import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { getSetting } from "../services/settings.service";
import { RazorpayPayment, RazorpayRefund, verifyWebhookSignature } from "../services/razorpay.service";
import {
  cancelStaleOrders,
  createOrder,
  confirmPayment,
  getOrderView,
  markRefunded,
  orderSelect,
  verifyCheckout,
} from "../services/order.service";

export const createOrderHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await createOrder(req.user!.userId, req.body.noteId, req.body.useCoins);
  res.status(201).json(result);
});

export const verifyPaymentHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const result = await verifyCheckout(req.user!.userId, {
    orderId,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });
  res.json(result);
});

// Polled by the checkout screen while a payment is PENDING.
export const getOrderHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ order: await getOrderView(req.params.id, req.user!.userId) });
});

export const myOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  await cancelStaleOrders(req.user!.userId);
  const orders = await prisma.order.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: orderSelect,
  });
  res.json({ orders });
});

interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment?: { entity?: RazorpayPayment };
    refund?: { entity?: RazorpayRefund };
  };
}

// POST /api/payments/webhook/razorpay — mounted with express.raw() so the
// signature is checked against the exact bytes Razorpay sent.
// 2xx = handled (or deliberately ignored); 5xx makes Razorpay retry later.
// Every branch is idempotent: Razorpay may send an event more than once.
export const razorpayWebhook = asyncHandler(async (req: Request, res: Response) => {
  const config = await getSetting("razorpay");
  if (!config?.webhookSecret) {
    throw new AppError(503, "Webhook secret not configured");
  }
  const signature = req.header("x-razorpay-signature");
  const raw = req.body as Buffer;
  if (!signature || !Buffer.isBuffer(raw) || !verifyWebhookSignature(config.webhookSecret, raw, signature)) {
    throw new AppError(400, "Invalid signature");
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError(400, "Invalid JSON");
  }

  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;
  const order = payment?.order_id
    ? await prisma.order.findUnique({ where: { razorpayOrderId: payment.order_id } })
    : refund?.payment_id
      ? await prisma.order.findUnique({ where: { razorpayPaymentId: refund.payment_id } })
      : null;
  if (!order) {
    // Not one of ours (e.g. another integration on the same Razorpay account).
    res.json({ ok: true, ignored: payment || refund ? "unknown order" : event.event });
    return;
  }

  // A refund (ours for a duplicate, or one made in the Razorpay dashboard).
  // Only a full refund removes access; a partial one is noted for the admin.
  if (event.event === "refund.processed" || event.event === "payment.refunded") {
    const refundedPaise = payment?.amount_refunded ?? refund?.amount ?? 0;
    if (refundedPaise >= order.amountPaise) {
      const changed = await markRefunded(order.id, refund?.id ?? null, "Refunded in Razorpay");
      res.json({ ok: true, refunded: changed });
    } else {
      await prisma.order.update({ where: { id: order.id }, data: { lastError: `Partly refunded in Razorpay (${refundedPaise} paise)` } });
      res.json({ ok: true, refunded: false });
    }
    return;
  }

  const confirmable =
    (event.event === "payment.captured" || event.event === "order.paid") && payment?.status === "captured"
      ? payment
      : event.event === "payment.authorized" && payment?.status === "authorized"
        ? payment
        : null;
  if (confirmable) {
    let granted: boolean;
    try {
      granted = await confirmPayment(order, confirmable, "webhook");
    } catch (err) {
      // An amount mismatch will never succeed on retry — record it and acknowledge.
      if (err instanceof AppError && err.statusCode === 400) {
        console.error(`[razorpay] webhook not granted for order ${order.id}: ${err.message}`);
        res.json({ ok: true, granted: false });
        return;
      }
      throw err;
    }
    res.json({ ok: true, granted });
    return;
  }

  if (event.event === "payment.failed" && order.status === "CREATED") {
    await prisma.order.update({ where: { id: order.id }, data: { lastError: payment?.error_description ?? "Payment failed" } });
  }
  res.json({ ok: true, ignored: event.event });
});
