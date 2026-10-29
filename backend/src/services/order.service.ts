import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { sendPurchaseReceiptEmail } from "../utils/mailer";
import { applyCoinChange } from "./coin.service";
import { CoinSettings, requireSetting } from "./settings.service";
import { hasPrivateBucket } from "./storage.service";
import {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  RazorpayPayment,
  refundRazorpayPayment,
  requireRazorpay,
  verifyCheckoutSignature,
} from "./razorpay.service";

// Premium-note purchases. Lifecycle:
//   createOrder   → Order CREATED; coins used for the discount are HELD
//                   (deducted now, NOTE_DISCOUNT) so they can't be spent twice
//   confirm       → verify (checkout signature + payment fetched from Razorpay
//                   = captured) or the signed webhook → grantOrder(): PAID +
//                   NoteAccess, idempotent — both may arrive, in any order
//   cancel        → replaced by a newer order (different price/coins) or
//                   abandoned for 30 min with no payment at Razorpay:
//                   CANCELLED, held coins refunded (NOTE_DISCOUNT_REFUND)
//   refund        → a duplicate payment (note already owned) is refunded
//                   automatically; a refund made in the Razorpay dashboard
//                   arrives by webhook. REFUNDED, access from it removed.
// A double tap / second tab gets the SAME open order back (createOrder), so
// Razorpay sees one order and takes at most one payment for it.
// A note is NEVER unlocked because a checkout page was opened or a link was
// visited — only by a server-side confirmation (requirements PDF §6.2).

export const ORDER_HOLD_MINUTES = 30;
// Razorpay's minimum charge is ₹1.
export const RAZORPAY_MIN_PAISE = 100;

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
  await applyCoinChange(tx, { userId: order.userId, delta: held, reason: "NOTE_DISCOUNT_REFUND", refId: order.id, note });
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
// sweep, optionally for one user. Razorpay is asked first: a payment that
// went through (or is waiting to be captured) is confirmed, not cancelled.
export const cancelStaleOrders = async (userId?: string) => {
  const stale = await prisma.order.findMany({
    where: { status: "CREATED", createdAt: { lt: new Date(Date.now() - ORDER_HOLD_MINUTES * 60_000) }, userId },
  });
  for (const order of stale) {
    if (order.razorpayOrderId) {
      try {
        const settled = await settleFromRazorpay(order, "reconcile");
        if (settled.status !== "NONE") continue;
      } catch (err) {
        // Can't tell whether it was paid: leave it for the next sweep.
        console.error(`[orders] couldn't check order ${order.id} with Razorpay:`, (err as Error).message);
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

export const createOrder = async (userId: string, noteId: string, useCoins: boolean) => {
  await cancelStaleOrders(userId);
  const note = await requirePublicNote(noteId);
  if (note.isFree) throw new AppError(400, "This note is free — download it directly");
  if (!(await hasPrivateBucket())) {
    throw new AppError(503, "Premium notes are not available yet. Please try again later.");
  }
  if (await hasNoteAccess(userId, noteId)) throw new AppError(409, "You already have this note");
  const razorpay = await requireRazorpay();
  const coins = await requireSetting("coins");

  // One transaction for "reuse or replace the open order, create, hold coins".
  // It starts by locking the student's row, so a double tap or two tabs run
  // one after the other and can never leave two open orders for one note.
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { coins: { increment: 0 } }, // no change: only takes the row lock
      select: { coins: true, email: true, name: true },
    });
    const open = await tx.order.findMany({ where: { userId, noteId, status: "CREATED" }, orderBy: { createdAt: "desc" } });
    // Coins held by an open order would come back if it's replaced.
    const available = user.coins + open.reduce((sum, o) => sum + o.coinsUsed, 0);
    const quote = quotePrice(note.pricePaise, available, coins, useCoins);
    const samePrice = (o: OrderRow) =>
      o.listPricePaise === quote.listPricePaise && o.coinsUsed === quote.coinsUsed && o.amountPaise === quote.amountPaise;

    for (const o of open) {
      if (samePrice(o) && o.razorpayOrderId) return { user, reuse: o };
      if (samePrice(o) && Date.now() - o.createdAt.getTime() < OPENING_GRACE_MS) {
        throw new AppError(409, "Your payment window is already opening. Please wait a moment.");
      }
      await cancelOrderTx(tx, o, "Replaced by a newer checkout");
    }

    const created = await tx.order.create({
      data: {
        userId,
        noteId,
        listPricePaise: quote.listPricePaise,
        coinsUsed: quote.coinsUsed,
        discountPaise: quote.discountPaise,
        amountPaise: quote.amountPaise,
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
  const checkoutFor = async (razorpayOrderId: string, amountPaise: number, currency: string) => ({
    // Everything the frontend passes to Razorpay Checkout.
    keyId: razorpay.keyId,
    razorpayOrderId,
    amount: amountPaise,
    currency,
    name: (await requireSetting("site")).name,
    description: note.title,
    prefill: { email: user.email, name: user.name ?? undefined },
  });

  if (result.reuse) {
    // Same checkout again (double tap, second tab): Razorpay takes only one
    // payment per order. If it was in fact paid already, confirm it instead.
    const o = result.reuse;
    const settled = await settleFromRazorpay(o, "verify");
    if (settled.status === "PAID") return { order: await getOrderView(o.id, userId), checkout: null };
    return { order: await getOrderView(o.id, userId), checkout: await checkoutFor(o.razorpayOrderId!, o.amountPaise, o.currency) };
  }

  const order = result.created!;
  if (order.amountPaise === 0) {
    await grantOrder(order.id, { via: "coins" });
    return { order: await getOrderView(order.id, userId), checkout: null };
  }

  let rzpOrder;
  try {
    rzpOrder = await createRazorpayOrder({
      amountPaise: order.amountPaise,
      currency: order.currency,
      receipt: order.id.slice(0, 40),
      notes: { orderId: order.id, userId, noteId },
    });
  } catch (err) {
    await cancelOrder(order.id, `Razorpay order failed: ${(err as Error).message}`);
    throw err;
  }
  await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rzpOrder.id } });

  return { order: await getOrderView(order.id, userId), checkout: await checkoutFor(rzpOrder.id, order.amountPaise, order.currency) };
};

// ---------------------------------------------------------------------------
// Granting (idempotent)
// ---------------------------------------------------------------------------

type Via = "verify" | "webhook" | "reconcile" | "coins";

export const grantOrder = async (orderId: string, opts: { via: Via; payment?: Pick<RazorpayPayment, "id" | "amount" | "currency"> }) => {
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
    const data = { status: "PAID" as const, paidAt, confirmedVia: opts.via, razorpayPaymentId: opts.payment?.id ?? null, lastError: null };
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
// removed and its held coins go back. Idempotent (guarded on status).
export const markRefunded = async (orderId: string, refundId: string | null, reason: string) =>
  prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return false;
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "REFUNDED", refundId, refundedAt: new Date(), lastError: reason },
    });
    if (updated.count === 0) return false;
    await tx.noteAccess.deleteMany({ where: { orderId } });
    if (!(await returnHeldCoinsTx(tx, order, "Coins returned: order refunded"))) {
      await tx.order.update({ where: { id: orderId }, data: { lastError: `${reason}. Held coins could not be returned automatically` } });
    }
    return true;
  });

// A PAID order that didn't unlock anything (the student already had the note)
// is a duplicate payment: refund it in full. If Razorpay can't be reached the
// order stays PAID with a note, and Reconcile (admin) tries again.
const isUnrefundedDuplicate = async (order: OrderRow) =>
  order.status === "PAID" && !order.refundId && !(await prisma.noteAccess.findUnique({ where: { orderId: order.id }, select: { id: true } }));

export const refundDuplicate = async (orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !(await isUnrefundedDuplicate(order))) return false;
  let refundId: string | null = null;
  if (order.amountPaise > 0 && order.razorpayPaymentId) {
    try {
      refundId = (await refundRazorpayPayment(order.razorpayPaymentId, order.amountPaise, { orderId: order.id, reason: "duplicate payment" })).id;
    } catch (err) {
      await prisma.order.update({
        where: { id: order.id },
        data: { lastError: `Duplicate payment: automatic refund failed (${(err as Error).message}). Use Reconcile to try again.` },
      });
      console.error(`[orders] refund of duplicate order ${order.id} failed:`, (err as Error).message);
      return false;
    }
  }
  return markRefunded(order.id, refundId, "Duplicate payment: refunded automatically");
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
  await grantOrder(order.id, { via, payment });
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

// Called by the frontend after Razorpay Checkout succeeds. The signature proves
// the response came from Razorpay; the payment is then fetched server-side and
// must be captured (or capturable) for exactly this order, amount and currency.
export const verifyCheckout = async (
  userId: string,
  input: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
) => {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.userId !== userId) throw new AppError(404, "Order not found");
  if (order.status === "PAID" || order.status === "REFUNDED") return { status: order.status, order: await getOrderView(order.id, userId) };
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

// Admin: missed webhook / student closed the tab → ask Razorpay directly.
// For a duplicate payment whose refund failed, tries the refund again.
export const reconcileOrder = async (orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status === "PAID") {
    if (await isUnrefundedDuplicate(order)) {
      const refunded = await refundDuplicate(order.id);
      return { changed: refunded, status: refunded ? ("REFUNDED" as const) : order.status };
    }
    return { changed: false, status: order.status };
  }
  if (order.status === "REFUNDED") return { changed: false, status: order.status };

  const settled = await settleFromRazorpay(order, "reconcile");
  if (settled.status === "NONE") return { changed: false, status: order.status, payments: settled.payments };
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
  razorpayOrderId: true,
  paidAt: true,
  createdAt: true,
  note: { select: { id: true, title: true } },
} as const;

export const getOrderView = async (orderId: string, userId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { ...orderSelect, userId: true } });
  if (!order || order.userId !== userId) throw new AppError(404, "Order not found");
  const { userId: _owner, ...view } = order;
  return view;
};
