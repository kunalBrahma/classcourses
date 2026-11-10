import { Prisma, RefundReason, RefundStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { notifyUser } from "./notification.service";
import { AppError } from "../utils/AppError";
import { sendPurchaseReceiptEmail } from "../utils/mailer";
import { applyCoinChange, prepareCoinsTx } from "./coin.service";
import { CashfreeSettings, CoinSettings, getSetting, RazorpaySettings, requireSetting } from "./settings.service";
import { hasPrivateBucket } from "./storage.service";
import {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  RazorpayPayment,
  fetchRazorpayRefund,
  refundRazorpayPayment,
  requireRazorpay,
  testRazorpayKeys,
  verifyCheckoutSignature,
} from "./razorpay.service";
import {
  CashfreeRefund,
  createCashfreeOrder,
  createCashfreeRefund,
  fetchCashfreeOrderPayments,
  fetchCashfreeRefund,
  requireCashfree,
  testCashfreeKeys,
  toPaise,
} from "./cashfree.service";

// Premium-note purchases, through Cashfree (the gateway at launch) or
// Razorpay (kept, switched off) — the `payments` setting picks the gateway for
// new orders; each order keeps its own (Order.provider). Lifecycle:
//   createOrder   → Order CREATED; coins used for the discount are HELD
//                   (deducted now, NOTE_DISCOUNT) so they can't be spent twice
//   confirm       → the gateway is asked on the server (Cashfree: a SUCCESS
//                   payment for exactly this amount; Razorpay: checkout
//                   signature + captured payment) from verify, the signed
//                   webhook or reconcile → grantOrder(): PAID + NoteAccess,
//                   idempotent — they may arrive in any order
//   cancel        → replaced by a newer order (different price/coins) or
//                   abandoned for 30 min with no payment at the gateway:
//                   CANCELLED, held coins refunded (NOTE_DISCOUNT_REFUND)
//   refund        → startRefund(): a Refund row (PENDING) and the gateway's
//                   refund API. Only when the gateway confirms SUCCESS is the
//                   order REFUNDED and its access removed. Coins used on it
//                   come back only for a duplicate (the same note paid twice),
//                   per the client's rule.
// A double tap / second tab gets the SAME open order back (createOrder), so
// the gateway sees one order and takes at most one payment for it.
// A note is NEVER unlocked because a checkout page was opened or a link was
// visited — only by a server-side confirmation (requirements PDF §6.2).

export const ORDER_HOLD_MINUTES = 30;
// The gateways' minimum charge is ₹1.
export const RAZORPAY_MIN_PAISE = 100;
// Cashfree needs a customer phone on every order; the student's is optional
// (client, 6 Nov 2026). Without one, this placeholder is sent (open question
// for the client: Cashfree may ask the student for a number at checkout).
export const CASHFREE_PLACEHOLDER_PHONE = "9999999999";

export type Provider = "cashfree" | "razorpay";
export const activeProvider = async (): Promise<Provider> => (await requireSetting("payments")).provider;

/**
 * Before new payments are switched to a gateway: its keys must be saved and
 * still accepted by the gateway right now, or students would hit "payments
 * are not set up" at checkout.
 */
export const assertGatewayReady = async (provider: Provider) => {
  const name = provider === "cashfree" ? "Cashfree" : "Razorpay";
  const config = provider === "cashfree" ? await getSetting("cashfree") : await getSetting("razorpay");
  if (!config) throw new AppError(400, `Save and test the ${name} keys first, then switch.`, "GATEWAY_NOT_READY");
  const result = provider === "cashfree" ? await testCashfreeKeys(config as CashfreeSettings) : await testRazorpayKeys(config as RazorpaySettings);
  if (!result.ok) throw new AppError(400, `${name} didn't accept the saved keys (${result.message}). Fix them first, then switch.`, "GATEWAY_NOT_READY");
};

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PriceQuote {
  listPricePaise: number;
  coinsUsed: number;
  discountPaise: number;
  amountPaise: number;
  coinBalance: number;
  maxDiscountPaise: number;
}

// Coin discount = coins × coinValuePaise, capped at maxDiscountPercent of the
// price. The amount left to pay is either 0 (fully covered — only possible at
// 100%) or at least Razorpay's ₹1 minimum; coins are never over-spent.
export const quotePrice = (listPricePaise: number, coinBalance: number, coins: CoinSettings, useCoins: boolean): PriceQuote => {
  const maxDiscountPaise = Math.floor((listPricePaise * coins.maxDiscountPercent) / 100);
  const base = { listPricePaise, coinBalance, maxDiscountPaise };
  if (!useCoins || coins.coinValuePaise <= 0 || maxDiscountPaise <= 0 || coinBalance <= 0) {
    return { ...base, coinsUsed: 0, discountPaise: 0, amountPaise: listPricePaise };
  }

  const cv = coins.coinValuePaise;
  let coinsUsed = Math.min(coinBalance, Math.floor(maxDiscountPaise / cv));
  let discountPaise = coinsUsed * cv;
  let amountPaise = listPricePaise - discountPaise;

  if (amountPaise > 0 && amountPaise < RAZORPAY_MIN_PAISE) {
    const coinsForFullPrice = Math.ceil(listPricePaise / cv);
    if (coins.maxDiscountPercent >= 100 && coinBalance >= coinsForFullPrice) {
      coinsUsed = coinsForFullPrice;
      discountPaise = listPricePaise;
      amountPaise = 0;
    } else {
      coinsUsed = Math.max(0, Math.floor((listPricePaise - RAZORPAY_MIN_PAISE) / cv));
      discountPaise = coinsUsed * cv;
      amountPaise = listPricePaise - discountPaise;
    }
  }
  return { ...base, coinsUsed, discountPaise, amountPaise };
};

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

// A note is visible to students when published, has a file, and whatever it
// is attached to (chapter or subject) is itself visible.
export const publicNoteWhere: Prisma.NoteWhereInput = {
  isPublished: true,
  fileKey: { not: null },
  OR: [
    {
      chapter: {
        isPublished: true,
        subject: { isActive: true, medium: { isActive: true }, classLevel: { isActive: true } },
      },
    },
    { chapterId: null, subject: { isActive: true, medium: { isActive: true }, classLevel: { isActive: true } } },
  ],
};

export const requirePublicNote = async (noteId: string) => {
  const note = await prisma.note.findFirst({ where: { id: noteId, ...publicNoteWhere } });
  if (!note) throw new AppError(404, "Note not found");
  return note;
};

export const hasNoteAccess = async (userId: string, noteId: string) =>
  Boolean(await prisma.noteAccess.findUnique({ where: { userId_noteId: { userId, noteId } }, select: { id: true } }));

// ---------------------------------------------------------------------------
// Held coins
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;
type OrderRow = Prisma.OrderGetPayload<object>;

// Gives back whatever coins this order still holds, worked out from the
// ledger (held − returned + taken again). Returns false when coins are still
// held but can't be returned automatically (already refunded once — the
// (reason, refId) pair is unique), so the caller can flag it for an admin.
const returnHeldCoinsTx = async (tx: Tx, order: OrderRow, note: string) => {
  const ledger = await tx.coinTransaction.findMany({
    where: { refId: order.id, reason: { in: ["NOTE_DISCOUNT", "NOTE_DISCOUNT_REFUND", "NOTE_DISCOUNT_REAPPLIED"] } },
    select: { reason: true, delta: true },
  });
  const held = -ledger.reduce((sum, row) => sum + row.delta, 0);
  if (held <= 0) return true;
  if (ledger.some((row) => row.reason === "NOTE_DISCOUNT_REFUND")) return false;
  // Back to the lots they came from, with their own expiry dates.
  await applyCoinChange(tx, { userId: order.userId, delta: held, reason: "NOTE_DISCOUNT_REFUND", refId: order.id, note, restoreRefId: order.id });
  return true;
};

// ---------------------------------------------------------------------------
// Cancelling (refunds held coins)
// ---------------------------------------------------------------------------

// Inside the caller's transaction. Guarded on status, so it runs at most once.
const cancelOrderTx = async (tx: Tx, order: OrderRow, reason: string) => {
  const updated = await tx.order.updateMany({
    where: { id: order.id, status: "CREATED" },
    data: { status: "CANCELLED", lastError: reason },
  });
  if (updated.count === 1) await returnHeldCoinsTx(tx, order, "Coins returned: order not completed");
  return updated.count === 1;
};

export const cancelOrder = async (orderId: string, reason: string) => {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (order) await cancelOrderTx(tx, order, reason);
  });
};

// Orders left unpaid for ORDER_HOLD_MINUTES give their coins back.
// Applied lazily (before creating orders / listing) and by the maintenance
// sweep, optionally for one user. The gateway is asked first: a payment that
// went through (or is still being processed) is confirmed, not cancelled.
export const cancelStaleOrders = async (userId?: string) => {
  const stale = await prisma.order.findMany({
    where: { status: "CREATED", createdAt: { lt: new Date(Date.now() - ORDER_HOLD_MINUTES * 60_000) }, userId },
  });
  for (const order of stale) {
    if (order.razorpayOrderId || order.cashfreeSessionId) {
      try {
        const settled = await settleOrder(order, "reconcile");
        if (settled.status !== "NONE") continue;
      } catch (err) {
        // Can't tell whether it was paid: leave it for the next sweep.
        console.error(`[orders] couldn't check order ${order.id} with ${order.provider}:`, (err as Error).message);
        continue;
      }
    }
    await cancelOrder(order.id, `Not paid within ${ORDER_HOLD_MINUTES} minutes`);
  }
};

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

// A brand-new order whose Razorpay order is still being created.
const OPENING_GRACE_MS = 20_000;

// What the browser needs to open the gateway's payment window.
export type CheckoutOptions =
  | { provider: "cashfree"; orderId: string; paymentSessionId: string; mode: "sandbox" | "production" }
  | {
      provider: "razorpay";
      keyId: string;
      razorpayOrderId: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      prefill: { email: string; name?: string };
    };

export const createOrder = async (userId: string, noteId: string, useCoins: boolean) => {
  await cancelStaleOrders(userId);
  const note = await requirePublicNote(noteId);
  if (note.isFree) throw new AppError(400, "This note is free — download it directly");
  if (!(await hasPrivateBucket())) {
    throw new AppError(503, "Premium notes are not available yet. Please try again later.");
  }
  if (await hasNoteAccess(userId, noteId)) throw new AppError(409, "You already have this note");
  const provider = await activeProvider();
  const gateway = provider === "cashfree" ? { provider, config: await requireCashfree() } : { provider, config: await requireRazorpay() };
  const coins = await requireSetting("coins");

  // One transaction for "reuse or replace the open order, create, hold coins".
  // It starts by locking the student's row, so a double tap or two tabs run
  // one after the other and can never leave two open orders for one note.
  const result = await prisma.$transaction(async (tx) => {
    // Takes the row lock, and removes expired coins before pricing.
    await prepareCoinsTx(tx, userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, email: true, name: true, phone: true } });
    const open = await tx.order.findMany({ where: { userId, noteId, status: "CREATED" }, orderBy: { createdAt: "desc" } });
    // Coins held by an open order would come back if it's replaced.
    const available = user.coins + open.reduce((sum, o) => sum + o.coinsUsed, 0);
    const quote = quotePrice(note.pricePaise, available, coins, useCoins);
    // Same price, same coins and the gateway in use now: the same checkout.
    const samePrice = (o: OrderRow) =>
      o.provider === provider && o.listPricePaise === quote.listPricePaise && o.coinsUsed === quote.coinsUsed && o.amountPaise === quote.amountPaise;
    const opened = (o: OrderRow) => Boolean(o.provider === "cashfree" ? o.cashfreeSessionId : o.razorpayOrderId);

    for (const o of open) {
      if (samePrice(o) && opened(o)) return { user, reuse: o };
      if (samePrice(o) && Date.now() - o.createdAt.getTime() < OPENING_GRACE_MS) {
        throw new AppError(409, "Your payment window is already opening. Please wait a moment.");
      }
      await cancelOrderTx(tx, o, "Replaced by a newer checkout");
    }

    const created = await tx.order.create({
      data: {
        userId,
        noteId,
        provider,
        listPricePaise: quote.listPricePaise,
        coinsUsed: quote.coinsUsed,
        discountPaise: quote.discountPaise,
        amountPaise: quote.amountPaise,
        // The route only lets an order through with the box ticked.
        purchaseConfirmedAt: new Date(),
      },
    });
    if (quote.coinsUsed > 0) {
      // Fails (and rolls back the order) if the balance changed meanwhile.
      await applyCoinChange(tx, {
        userId,
        delta: -quote.coinsUsed,
        reason: "NOTE_DISCOUNT",
        refId: created.id,
        note: `Discount on "${note.title}"`,
      });
    }
    return { user, created };
  });

  const { user } = result;
  const checkoutFor = async (o: OrderRow): Promise<CheckoutOptions> =>
    gateway.provider === "cashfree"
      ? { provider: "cashfree", orderId: o.id, paymentSessionId: o.cashfreeSessionId!, mode: gateway.config.environment }
      : {
          // Everything the frontend passes to Razorpay Checkout.
          provider: "razorpay",
          keyId: gateway.config.keyId,
          razorpayOrderId: o.razorpayOrderId!,
          amount: o.amountPaise,
          currency: o.currency,
          name: (await requireSetting("site")).name,
          description: note.title,
          prefill: { email: user.email, name: user.name ?? undefined },
        };

  if (result.reuse) {
    // Same checkout again (double tap, second tab): the gateway takes only one
    // payment per order. If it was in fact paid already, confirm it instead.
    const o = result.reuse;
    const settled = await settleOrder(o, "verify");
    if (settled.status === "PAID") return { order: await getOrderView(o.id, userId), checkout: null };
    return { order: await getOrderView(o.id, userId), checkout: await checkoutFor(o) };
  }

  const order = result.created!;
  if (order.amountPaise === 0) {
    await grantOrder(order.id, { via: "coins" });
    return { order: await getOrderView(order.id, userId), checkout: null };
  }

  try {
    if (gateway.provider === "cashfree") {
      const site = await requireSetting("site");
      const cf = await createCashfreeOrder({
        orderId: order.id,
        amountPaise: order.amountPaise,
        currency: order.currency,
        customer: { id: userId, email: user.email, phone: user.phone ?? CASHFREE_PLACEHOLDER_PHONE, name: user.name },
        // Cashfree fills {order_id} in; the page asks our server for the result.
        returnUrl: `${site.frontendUrl.replace(/\/$/, "")}/checkout/return?order_id={order_id}`,
        note: note.title,
        // A little after our own 30-minute hold, so a payment can't start after we cancel.
        expiresAt: new Date(order.createdAt.getTime() + (ORDER_HOLD_MINUTES + 5) * 60_000),
      });
      const saved = await prisma.order.update({ where: { id: order.id }, data: { cashfreeSessionId: cf.payment_session_id } });
      return { order: await getOrderView(order.id, userId), checkout: await checkoutFor(saved) };
    }
    const rzpOrder = await createRazorpayOrder({
      amountPaise: order.amountPaise,
      currency: order.currency,
      receipt: order.id.slice(0, 40),
      notes: { orderId: order.id, userId, noteId },
    });
    const saved = await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rzpOrder.id } });
    return { order: await getOrderView(order.id, userId), checkout: await checkoutFor(saved) };
  } catch (err) {
    await cancelOrder(order.id, `${gateway.provider === "cashfree" ? "Cashfree" : "Razorpay"} order failed: ${(err as Error).message}`);
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Granting (idempotent)
// ---------------------------------------------------------------------------

type Via = "verify" | "webhook" | "reconcile" | "coins";

// A confirmed payment, in paise, from either gateway.
export interface ConfirmedPayment {
  id: string;
  amount: number;
  currency: string;
  provider: Provider;
}

export const grantOrder = async (orderId: string, opts: { via: Via; payment?: ConfirmedPayment }) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { note: { select: { title: true } }, user: { select: { email: true, name: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status === "PAID" || order.status === "REFUNDED") return { newlyPaid: false };

  if (opts.payment && (opts.payment.amount !== order.amountPaise || opts.payment.currency !== order.currency)) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        lastError: `Amount mismatch: paid ${opts.payment.amount} ${opts.payment.currency}, expected ${order.amountPaise} ${order.currency}`,
      },
    });
    throw new AppError(400, "Payment amount does not match the order");
  }

  const paidAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const data = {
      status: "PAID" as const,
      paidAt,
      confirmedVia: opts.via,
      razorpayPaymentId: opts.payment?.provider === "razorpay" ? opts.payment.id : null,
      cashfreePaymentId: opts.payment?.provider === "cashfree" ? opts.payment.id : null,
      lastError: null,
    };
    // Guarded on status: of two confirmations arriving together, one wins.
    let wasCancelled = false;
    let updated = await tx.order.updateMany({ where: { id: order.id, status: "CREATED" }, data });
    if (updated.count === 0) {
      updated = await tx.order.updateMany({ where: { id: order.id, status: "CANCELLED" }, data });
      wasCancelled = updated.count === 1;
    }
    if (updated.count === 0) return null; // a concurrent confirmation won

    // ON CONFLICT DO NOTHING: if the student already owns the note (two
    // checkouts paid), nothing is created and nothing rolls back.
    const access = await tx.noteAccess.createMany({
      data: [{ userId: order.userId, noteId: order.noteId, orderId: order.id }],
      skipDuplicates: true,
    });
    if (access.count === 0) {
      await tx.order.update({ where: { id: order.id }, data: { lastError: "Duplicate payment: student already had this note" } });
      return { duplicate: true };
    }

    // Paid after the order was cancelled: its held coins went back, but the
    // discount was used after all, so take them again if the student still has them.
    if (wasCancelled && order.coinsUsed > 0) {
      try {
        await applyCoinChange(tx, {
          userId: order.userId,
          delta: -order.coinsUsed,
          reason: "NOTE_DISCOUNT_REAPPLIED",
          refId: order.id,
          note: `Discount on "${order.note.title}" (paid after the order had expired)`,
        });
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        await tx.order.update({
          where: { id: order.id },
          data: { lastError: `Paid after the order was cancelled; the ${order.coinsUsed} discount coins had already been spent` },
        });
      }
    }
    return { duplicate: false };
  });

  if (!result) return { newlyPaid: false };
  if (result.duplicate) {
    await refundDuplicate(order.id);
    return { newlyPaid: true, duplicate: true };
  }

  await sendPurchaseReceiptEmail(order.user.email, {
    studentName: order.user.name,
    noteTitle: order.note.title,
    orderId: order.id,
    listPricePaise: order.listPricePaise,
    coinsUsed: order.coinsUsed,
    discountPaise: order.discountPaise,
    amountPaise: order.amountPaise,
    paidAt,
  });
  return { newlyPaid: true };
};

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

// PAID → REFUNDED in one transaction: the note access this order gave is
// removed. Coins used on it go back only when `returnCoins` (a duplicate
// payment; the client's rule). Idempotent (guarded on status).
export const markRefunded = async (orderId: string, refundId: string | null, reason: string, opts: { returnCoins: boolean }) =>
  prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return false;
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "REFUNDED", refundId, refundedAt: new Date(), lastError: reason },
    });
    if (updated.count === 0) return false;
    await tx.noteAccess.deleteMany({ where: { orderId } });
    if (opts.returnCoins && !(await returnHeldCoinsTx(tx, order, "Coins returned: the same note was paid for twice"))) {
      await tx.order.update({ where: { id: orderId }, data: { lastError: `${reason}. Held coins could not be returned automatically` } });
    }
    return true;
  });

// A PAID order that didn't unlock anything (the student already had the note)
// is a duplicate payment: refund it in full, coins included. If the gateway
// can't be reached the refund is FAILED with a note, and Reconcile (admin)
// tries again.
const isUnrefundedDuplicate = async (order: OrderRow) =>
  order.status === "PAID" &&
  !(await prisma.noteAccess.findUnique({ where: { orderId: order.id }, select: { id: true } })) &&
  !(await prisma.refund.findFirst({ where: { orderId: order.id, status: { in: ["PENDING", "SUCCESS"] } }, select: { id: true } }));

export const refundDuplicate = async (orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !(await isUnrefundedDuplicate(order))) return false;
  const refund = await startRefund(order.id, { reason: "DUPLICATE", note: "The same note was paid for twice: refunded automatically" });
  if (refund.status === "FAILED") {
    await prisma.order.update({
      where: { id: order.id },
      data: { lastError: `Duplicate payment: automatic refund failed (${refund.failureReason}). Use Reconcile to try again.` },
    });
    console.error(`[orders] refund of duplicate order ${order.id} failed:`, refund.failureReason);
    return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Refunds (both gateways)
// ---------------------------------------------------------------------------

const REFUND_SELECT = { id: true, orderId: true, provider: true, providerRefundId: true, amountPaise: true, status: true, reason: true, note: true, failureReason: true, processedAt: true, createdAt: true } as const;
type RefundRow = Prisma.RefundGetPayload<{ select: typeof REFUND_SELECT }>;

const razorpayRefundStatus = (status: string): RefundStatus => (status === "processed" ? "SUCCESS" : status === "failed" ? "FAILED" : "PENDING");

const cashfreeRefundStatus = (r: Pick<CashfreeRefund, "refund_status">): RefundStatus =>
  r.refund_status === "SUCCESS" ? "SUCCESS" : r.refund_status === "CANCELLED" ? "FAILED" : "PENDING";

/**
 * Records what the gateway says about a refund. Guarded: only a PENDING
 * refund changes, so webhook, polling and admin checks can all arrive. On
 * SUCCESS the order becomes REFUNDED (access removed; coins back only for a
 * duplicate). Returns the refund as it now is.
 */
export const setRefundStatus = async (refundId: string, status: RefundStatus, extra: { providerRefundId?: string | null; failureReason?: string | null } = {}) => {
  if (status !== "PENDING") {
    const updated = await prisma.refund.updateMany({
      where: { id: refundId, status: "PENDING" },
      data: {
        status,
        processedAt: status === "SUCCESS" ? new Date() : null,
        failureReason: extra.failureReason ?? null,
        ...(extra.providerRefundId ? { providerRefundId: extra.providerRefundId } : {}),
      },
    });
    if (updated.count === 1) {
      const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
      if (status === "SUCCESS") {
        await markRefunded(refund.orderId, refund.providerRefundId, refund.note ?? "Refunded", { returnCoins: refund.reason === "DUPLICATE" });
        const order = await prisma.order.findUniqueOrThrow({ where: { id: refund.orderId }, select: { userId: true, note: { select: { title: true } } } });
        const rupees = refund.amountPaise > 0 ? `₹${(refund.amountPaise / 100).toLocaleString("en-IN")} ` : "";
        await notifyUser(order.userId, {
          kind: "ACCOUNT",
          title: "Refund completed",
          body: `Your payment ${rupees}for “${order.note.title}” has been refunded${refund.reason === "DUPLICATE" ? ", and the coins you used are back" : ""}. Banks can take 5 to 7 working days to show it.`,
          link: "/profile",
        });
      } else {
        await prisma.order.update({ where: { id: refund.orderId }, data: { lastError: `Refund failed: ${extra.failureReason ?? "the gateway refused it"}` } });
      }
    }
  } else if (extra.providerRefundId) {
    await prisma.refund.updateMany({ where: { id: refundId, providerRefundId: null }, data: { providerRefundId: extra.providerRefundId } });
  }
  return prisma.refund.findUniqueOrThrow({ where: { id: refundId }, select: REFUND_SELECT });
};

/**
 * Refunds a PAID order in full through its gateway (client requirements of
 * 6 Nov 2026: the Founder can start a refund from the admin panel). One
 * active refund per order. The refund stays PENDING until the gateway
 * confirms it; a coins-only order (nothing paid in money) completes at once.
 */
export const startRefund = async (orderId: string, opts: { reason: RefundReason; note: string; createdById?: string | null }): Promise<RefundRow> => {
  const refund = await prisma.$transaction(async (tx) => {
    // Locks the order row so two clicks can't start two refunds.
    const locked = await tx.order.updateMany({ where: { id: orderId, status: "PAID" }, data: { updatedAt: new Date() } });
    if (locked.count === 0) throw new AppError(409, "Only a paid order can be refunded");
    const active = await tx.refund.findFirst({ where: { orderId, status: { in: ["PENDING", "SUCCESS"] } }, select: { status: true } });
    if (active) throw new AppError(409, active.status === "PENDING" ? "A refund for this order is already in progress" : "This order was already refunded");
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    return tx.refund.create({
      data: { orderId, provider: order.provider, amountPaise: order.amountPaise, reason: opts.reason, note: opts.note, createdById: opts.createdById ?? null },
      select: REFUND_SELECT,
    });
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  // Paid entirely with coins: no money to send back.
  if (order.amountPaise === 0) return setRefundStatus(refund.id, "SUCCESS");

  try {
    if (order.provider === "cashfree") {
      const cf = await createCashfreeRefund(order.id, refund.id, order.amountPaise, opts.note);
      return setRefundStatus(refund.id, cashfreeRefundStatus(cf), { providerRefundId: String(cf.cf_refund_id), failureReason: cf.status_description ?? null });
    }
    if (!order.razorpayPaymentId) throw new AppError(409, "This order has no Razorpay payment to refund");
    const rz = await refundRazorpayPayment(order.razorpayPaymentId, order.amountPaise, { orderId: order.id, refundId: refund.id, reason: opts.reason.toLowerCase() });
    return setRefundStatus(refund.id, razorpayRefundStatus(rz.status), { providerRefundId: rz.id });
  } catch (err) {
    return setRefundStatus(refund.id, "FAILED", { failureReason: (err as Error).message.slice(0, 300) });
  }
};

/**
 * The gateway says an order's money went back (webhook). If it's one of our
 * refunds, that refund completes; otherwise it was made in the gateway's own
 * dashboard and is recorded as such (no coins back: the client's rule).
 */
export const recordGatewayRefund = async (orderId: string, providerRefundId: string | null, ourRefundId?: string | null) => {
  const ours =
    (ourRefundId ? await prisma.refund.findFirst({ where: { id: ourRefundId, orderId } }) : null) ??
    (providerRefundId ? await prisma.refund.findUnique({ where: { providerRefundId } }) : null) ??
    (await prisma.refund.findFirst({ where: { orderId, status: "PENDING" }, orderBy: { createdAt: "desc" } }));
  // `changed`: this message completed a refund (a replay changes nothing).
  if (ours) {
    const refund = await setRefundStatus(ours.id, "SUCCESS", { providerRefundId });
    return { changed: ours.status === "PENDING" && refund.status === "SUCCESS", refund };
  }
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PAID") return { changed: false, refund: null };
  const created = await prisma.refund.create({
    data: { orderId, provider: order.provider, providerRefundId, amountPaise: order.amountPaise, reason: "GATEWAY", note: "Refunded in the payment gateway's dashboard" },
  });
  return { changed: true, refund: await setRefundStatus(created.id, "SUCCESS") };
};

/** Asks the refund's gateway about it while PENDING (missed webhook, admin "Check", sweep). */
export const syncRefund = async (refundId: string) => {
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { order: { select: { id: true } } } });
  if (!refund || refund.status !== "PENDING") return refund;
  if (refund.provider === "cashfree") {
    const cf = await fetchCashfreeRefund(refund.orderId, refund.id);
    return setRefundStatus(refund.id, cashfreeRefundStatus(cf), { providerRefundId: String(cf.cf_refund_id), failureReason: cf.status_description ?? null });
  }
  // Razorpay: ask about the refund it gave us an id for. (Without an id the
  // request never reached Razorpay, and the refund is FAILED, not PENDING.)
  if (!refund.providerRefundId) return refund;
  const rz = await fetchRazorpayRefund(refund.providerRefundId);
  return setRefundStatus(refund.id, razorpayRefundStatus(rz.status), { providerRefundId: rz.id, failureReason: rz.status === "failed" ? "Razorpay could not complete the refund" : null });
};

// Maintenance sweep: refunds still PENDING after a few minutes are checked
// with their gateway (Cashfree or Razorpay), in case a webhook was missed.
export const syncPendingRefunds = async () => {
  const pending = await prisma.refund.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 2 * 60_000) } },
    select: { id: true },
    take: 50,
  });
  for (const r of pending) {
    try {
      await syncRefund(r.id);
    } catch (err) {
      console.error(`[refunds] couldn't check refund ${r.id}:`, (err as Error).message);
    }
  }
  return pending.length;
};

// ---------------------------------------------------------------------------
// Confirmation paths
// ---------------------------------------------------------------------------

// A payment Razorpay reports for this order: captured → confirm; authorized →
// capture it ourselves, then confirm.
export const confirmPayment = async (order: OrderRow, payment: RazorpayPayment, via: Via) => {
  if (payment.status === "authorized") {
    // Never capture money that doesn't match the order.
    if (payment.amount !== order.amountPaise || payment.currency !== order.currency) {
      await prisma.order.update({
        where: { id: order.id },
        data: { lastError: `Amount mismatch: authorized ${payment.amount} ${payment.currency}, expected ${order.amountPaise} ${order.currency}` },
      });
      throw new AppError(400, "Payment amount does not match the order");
    }
    payment = await captureRazorpayPayment(payment);
  }
  if (payment.status !== "captured") return false;
  await grantOrder(order.id, { via, payment: { id: payment.id, amount: payment.amount, currency: payment.currency, provider: "razorpay" } });
  return true;
};

// Asks Razorpay about an order's payments (missed webhook, closed tab, stale order).
export const settleFromRazorpay = async (order: OrderRow, via: Via) => {
  if (!order.razorpayOrderId) return { status: "NONE" as const, payments: [] as string[] };
  const { items } = await fetchRazorpayOrderPayments(order.razorpayOrderId);
  const payment = items.find((p) => p.status === "captured") ?? items.find((p) => p.status === "authorized");
  if (payment && (await confirmPayment(order, payment, via))) return { status: "PAID" as const, payments: items.map((p) => p.status) };
  return { status: "NONE" as const, payments: items.map((p) => p.status) };
};

// Asks Cashfree for an order's payments. A SUCCESS payment confirms the order
// (grantOrder refuses one whose amount or currency differs). PENDING means
// the bank hasn't answered yet: never cancelled while that lasts.
export const settleFromCashfree = async (order: OrderRow, via: Via) => {
  if (order.provider !== "cashfree" || !order.cashfreeSessionId) return { status: "NONE" as const, payments: [] as string[] };
  const payments = await fetchCashfreeOrderPayments(order.id);
  const statuses = payments.map((p) => p.payment_status);
  const success = payments.find((p) => p.payment_status === "SUCCESS");
  if (success) {
    await grantOrder(order.id, {
      via,
      payment: { id: String(success.cf_payment_id), amount: toPaise(success.payment_amount), currency: success.payment_currency, provider: "cashfree" },
    });
    return { status: "PAID" as const, payments: statuses };
  }
  if (statuses.includes("PENDING")) return { status: "PENDING" as const, payments: statuses };
  const failed = payments.find((p) => p.payment_status === "FAILED" || p.payment_status === "USER_DROPPED" || p.payment_status === "CANCELLED");
  if (failed && order.status === "CREATED") {
    await prisma.order.update({ where: { id: order.id }, data: { lastError: failed.payment_message || `Payment ${failed.payment_status.toLowerCase().replace("_", " ")}` } });
  }
  return { status: "NONE" as const, payments: statuses, failed: Boolean(failed), failure: failed?.payment_message || null };
};

/** Asks the order's own gateway whether it was paid. */
export const settleOrder = async (order: OrderRow, via: Via): Promise<{ status: "PAID" | "PENDING" | "NONE"; payments: string[] }> =>
  order.provider === "cashfree" ? settleFromCashfree(order, via) : settleFromRazorpay(order, via);

// Called by the frontend after Razorpay Checkout succeeds. The signature proves
// the response came from Razorpay; the payment is then fetched server-side and
// must be captured (or capturable) for exactly this order, amount and currency.
export const verifyCheckout = async (
  userId: string,
  input: { orderId: string; razorpayOrderId?: string; razorpayPaymentId?: string; razorpaySignature?: string }
) => {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.userId !== userId) throw new AppError(404, "Order not found");
  if (order.status === "PAID" || order.status === "REFUNDED") return { status: order.status, order: await getOrderView(order.id, userId) };

  // Cashfree: nothing from the browser is trusted; the server asks Cashfree.
  if (order.provider === "cashfree") {
    const settled = await settleFromCashfree(order, "verify");
    if (settled.status === "PAID") {
      const view = await getOrderView(order.id, userId);
      return { status: view.status === "REFUNDED" ? ("REFUNDED" as const) : ("PAID" as const), order: view };
    }
    // The student's last try failed (or they gave up) and nothing is pending.
    if (settled.status === "NONE" && "failed" in settled && settled.failed) {
      throw new AppError(400, settled.failure || "The payment didn't go through. No money was taken.", "PAYMENT_FAILED");
    }
    // Still being processed (or not paid yet): the checkout keeps checking.
    return { status: "PENDING" as const, order: await getOrderView(order.id, userId) };
  }

  if (!input.razorpayOrderId || !input.razorpayPaymentId || !input.razorpaySignature) throw new AppError(400, "Payment could not be verified");
  if (!order.razorpayOrderId || order.razorpayOrderId !== input.razorpayOrderId) {
    throw new AppError(400, "Payment could not be verified");
  }

  const { keySecret } = await requireRazorpay();
  if (!verifyCheckoutSignature(keySecret, input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw new AppError(400, "Payment could not be verified");
  }

  const payment = await fetchRazorpayPayment(input.razorpayPaymentId);
  if (payment.order_id !== order.razorpayOrderId) throw new AppError(400, "Payment could not be verified");

  if (payment.status === "failed") {
    await prisma.order.update({ where: { id: order.id }, data: { lastError: payment.error_description ?? "Payment failed" } });
    throw new AppError(400, payment.error_description ?? "Payment failed");
  }
  if (await confirmPayment(order, payment, "verify")) {
    const view = await getOrderView(order.id, userId);
    return { status: view.status === "REFUNDED" ? ("REFUNDED" as const) : ("PAID" as const), order: view };
  }
  // created: not finished yet — the webhook will complete it.
  return { status: "PENDING" as const, order: await getOrderView(order.id, userId) };
};

// Admin: missed webhook / student closed the tab → ask the gateway directly.
// A pending refund is checked; a duplicate payment whose refund failed is
// tried again.
export const reconcileOrder = async (orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status === "PAID") {
    // A refund still waiting for the gateway: ask about it.
    const pending = await prisma.refund.findFirst({ where: { orderId, status: "PENDING" }, select: { id: true } });
    if (pending) {
      const refund = await syncRefund(pending.id);
      const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      return { changed: after.status !== order.status, status: after.status, refundStatus: refund?.status ?? null };
    }
    if (await isUnrefundedDuplicate(order)) {
      const refunded = await refundDuplicate(order.id);
      return { changed: refunded, status: refunded ? ("REFUNDED" as const) : order.status };
    }
    return { changed: false, status: order.status };
  }
  if (order.status === "REFUNDED") return { changed: false, status: order.status };

  const settled = await settleOrder(order, "reconcile");
  if (settled.status !== "PAID") return { changed: false, status: order.status, payments: settled.payments };
  const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
  return { changed: true, status: after.status };
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const orderSelect = {
  id: true,
  noteId: true,
  status: true,
  listPricePaise: true,
  coinsUsed: true,
  discountPaise: true,
  amountPaise: true,
  currency: true,
  provider: true,
  razorpayOrderId: true,
  paidAt: true,
  createdAt: true,
  note: { select: { id: true, title: true } },
  // The latest refund, so the student sees pending / done / failed
  refunds: { orderBy: { createdAt: "desc" as const }, take: 1, select: { status: true, amountPaise: true, providerRefundId: true, createdAt: true, processedAt: true } },
} as const;

export const getOrderView = async (orderId: string, userId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { ...orderSelect, userId: true } });
  if (!order || order.userId !== userId) throw new AppError(404, "Order not found");
  const { userId: _owner, ...view } = order;
  return view;
};
