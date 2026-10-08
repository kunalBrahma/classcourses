import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { sendPurchaseReceiptEmail } from "../utils/mailer";
import { applyCoinChange } from "./coin.service";
import { CoinSettings, requireSetting } from "./settings.service";
import { hasPrivateBucket } from "./storage.service";
import {
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  requireRazorpay,
  verifyCheckoutSignature,
} from "./razorpay.service";

// Premium-note purchases. Lifecycle:
//   createOrder   → Order CREATED; coins used for the discount are HELD
//                   (deducted now, NOTE_DISCOUNT) so they can't be spent twice
//   confirm       → verify (checkout signature + payment fetched from Razorpay
//                   = captured) or the signed webhook → grantOrder(): PAID +
//                   NoteAccess, idempotent — both may arrive, in any order
//   cancel        → replaced by a newer order or abandoned for 30 min:
//                   CANCELLED, held coins refunded (NOTE_DISCOUNT_REFUND)
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
// Cancelling (refunds held coins)
// ---------------------------------------------------------------------------

export const cancelOrder = async (orderId: string, reason: string) => {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return;
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: "CREATED" },
      data: { status: "CANCELLED", lastError: reason },
    });
    if (updated.count === 1 && order.coinsUsed > 0) {
      await applyCoinChange(tx, {
        userId: order.userId,
        delta: order.coinsUsed,
        reason: "NOTE_DISCOUNT_REFUND",
        refId: order.id,
        note: "Coins returned: order not completed",
      });
    }
  });
};

// Orders left unpaid for ORDER_HOLD_MINUTES give their coins back.
// Applied lazily (before creating orders / listing), optionally for one user.
export const cancelStaleOrders = async (userId?: string) => {
  const stale = await prisma.order.findMany({
    where: { status: "CREATED", createdAt: { lt: new Date(Date.now() - ORDER_HOLD_MINUTES * 60_000) }, userId },
    select: { id: true },
  });
  for (const { id } of stale) {
    await cancelOrder(id, `Not paid within ${ORDER_HOLD_MINUTES} minutes`);
  }
};

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

export const createOrder = async (userId: string, noteId: string, useCoins: boolean) => {
  await cancelStaleOrders(userId);
  const note = await requirePublicNote(noteId);
  if (note.isFree) throw new AppError(400, "This note is free — download it directly");
  if (!(await hasPrivateBucket())) {
    throw new AppError(503, "Premium notes are not available yet. Please try again later.");
  }
  if (await hasNoteAccess(userId, noteId)) throw new AppError(409, "You already have this note");
  const razorpay = await requireRazorpay();

  // Only one open checkout per note: an older unpaid order gives its coins back first.
  const open = await prisma.order.findMany({ where: { userId, noteId, status: "CREATED" }, select: { id: true } });
  for (const { id } of open) await cancelOrder(id, "Replaced by a newer checkout");

  const [user, coins] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, email: true, name: true } }),
    requireSetting("coins"),
  ]);
  const quote = quotePrice(note.pricePaise, user.coins, coins, useCoins);

  const order = await prisma.$transaction(async (tx) => {
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
    return created;
  });

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

  return {
    order: await getOrderView(order.id, userId),
    // Everything the frontend passes to Razorpay Checkout.
    checkout: {
      keyId: razorpay.keyId,
      razorpayOrderId: rzpOrder.id,
      amount: order.amountPaise,
      currency: order.currency,
      name: (await requireSetting("site")).name,
      description: note.title,
      prefill: { email: user.email, name: user.name ?? undefined },
    },
  };
};

// ---------------------------------------------------------------------------
// Granting (idempotent)
// ---------------------------------------------------------------------------

export const grantOrder = async (
  orderId: string,
  opts: { via: "verify" | "webhook" | "reconcile" | "coins"; paymentId?: string; paidAmountPaise?: number }
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { note: { select: { title: true } }, user: { select: { email: true, name: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status === "PAID") return { newlyPaid: false };

  if (opts.paidAmountPaise !== undefined && opts.paidAmountPaise !== order.amountPaise) {
    await prisma.order.update({
      where: { id: order.id },
      data: { lastError: `Amount mismatch: paid ${opts.paidAmountPaise}, expected ${order.amountPaise}` },
    });
    throw new AppError(400, "Payment amount does not match the order");
  }

  const paidAt = new Date();
  const newlyPaid = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["CREATED", "CANCELLED"] } },
      data: {
        status: "PAID",
        paidAt,
        confirmedVia: opts.via,
        razorpayPaymentId: opts.paymentId ?? null,
        // Paid after the hold expired: held coins were already refunded.
        lastError: order.status === "CANCELLED" ? "Paid after the order was cancelled; held coins had been refunded" : null,
      },
    });
    if (updated.count === 0) return false; // a concurrent confirmation won

    const existing = await tx.noteAccess.findUnique({
      where: { userId_noteId: { userId: order.userId, noteId: order.noteId } },
    });
    if (existing) {
      // Paid twice for the same note (e.g. two checkouts). Keep access; flag for a manual refund.
      await tx.order.update({ where: { id: order.id }, data: { lastError: "Duplicate purchase — student already had this note. Refund manually." } });
    } else {
      await tx.noteAccess.create({ data: { userId: order.userId, noteId: order.noteId, orderId: order.id } });
    }
    return true;
  });

  if (newlyPaid) {
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
  }
  return { newlyPaid };
};

// ---------------------------------------------------------------------------
// Confirmation paths
// ---------------------------------------------------------------------------

// Called by the frontend after Razorpay Checkout succeeds. The signature proves
// the response came from Razorpay; the payment is then fetched server-side and
// must be `captured` for exactly this order and amount.
export const verifyCheckout = async (
  userId: string,
  input: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }
) => {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.userId !== userId) throw new AppError(404, "Order not found");
  if (order.status === "PAID") return { status: "PAID" as const, order: await getOrderView(order.id, userId) };
  if (!order.razorpayOrderId || order.razorpayOrderId !== input.razorpayOrderId) {
    throw new AppError(400, "Payment could not be verified");
  }

  const { keySecret } = await requireRazorpay();
  if (!verifyCheckoutSignature(keySecret, input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw new AppError(400, "Payment could not be verified");
  }

  const payment = await fetchRazorpayPayment(input.razorpayPaymentId);
  if (payment.order_id !== order.razorpayOrderId) throw new AppError(400, "Payment could not be verified");

  if (payment.status === "captured") {
    await grantOrder(order.id, { via: "verify", paymentId: payment.id, paidAmountPaise: payment.amount });
    return { status: "PAID" as const, order: await getOrderView(order.id, userId) };
  }
  if (payment.status === "failed") {
    await prisma.order.update({ where: { id: order.id }, data: { lastError: payment.error_description ?? "Payment failed" } });
    throw new AppError(400, payment.error_description ?? "Payment failed");
  }
  // authorized / created: capture pending — the webhook will finish it.
  return { status: "PENDING" as const, order: await getOrderView(order.id, userId) };
};

// Admin: missed webhook / student closed the tab → ask Razorpay directly.
export const reconcileOrder = async (orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.status === "PAID") return { changed: false, status: order.status };
  if (!order.razorpayOrderId) return { changed: false, status: order.status };

  const { items } = await fetchRazorpayOrderPayments(order.razorpayOrderId);
  const captured = items.find((p) => p.status === "captured");
  if (!captured) return { changed: false, status: order.status, payments: items.map((p) => p.status) };

  const { newlyPaid } = await grantOrder(order.id, { via: "reconcile", paymentId: captured.id, paidAmountPaise: captured.amount });
  return { changed: newlyPaid, status: "PAID" as const };
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
