import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { getSetting } from "../services/settings.service";
import { RazorpayPayment, RazorpayRefund, verifyWebhookSignature } from "../services/razorpay.service";
import { verifyCashfreeWebhook } from "../services/cashfree.service";
import {
  cancelStaleOrders,
  createOrder,
  confirmPayment,
  getOrderView,
  recordGatewayRefund,
  setRefundStatus,
  settleFromCashfree,
  orderSelect,
  verifyCheckout,
} from "../services/order.service";

export const createOrderHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await createOrder(req.user!.userId, req.body.noteId, req.body.useCoins);
  res.status(201).json(result);
});

// After the gateway's window closes. Cashfree sends just { orderId } (the
// server asks Cashfree); Razorpay sends its signed checkout response.
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
      const recorded = await recordGatewayRefund(order.id, refund?.id ?? null, refund ? (refund as { notes?: { refundId?: string } }).notes?.refundId : null);
      res.json({ ok: true, refunded: recorded.changed });
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

interface CashfreeWebhookEvent {
  type?: string;
  data?: {
    order?: { order_id?: string };
    payment?: { payment_status?: string; payment_message?: string | null };
    refund?: { refund_id?: string; cf_refund_id?: string | number; order_id?: string; refund_status?: string; status_description?: string | null };
  };
}

// POST /api/payments/webhook/cashfree — mounted with express.raw() before
// express.json(): the signature (x-webhook-signature) is an HMAC of
// x-webhook-timestamp + the exact body, keyed with the Cashfree secret key.
// A payment event never unlocks a note by itself: the server asks Cashfree's
// API for the order's payments (settleFromCashfree), which checks the amount.
// Every branch is idempotent; 5xx makes Cashfree retry later.
export const cashfreeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const config = await getSetting("cashfree");
  if (!config) throw new AppError(503, "Cashfree is not configured");
  const signature = req.header("x-webhook-signature");
  const timestamp = req.header("x-webhook-timestamp");
  const raw = req.body as Buffer;
  if (!signature || !timestamp || !Buffer.isBuffer(raw) || !verifyCashfreeWebhook(config.secretKey, timestamp, raw, signature)) {
    throw new AppError(400, "Invalid signature");
  }
  let event: CashfreeWebhookEvent;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError(400, "Invalid JSON");
  }

  const orderId = event.data?.order?.order_id ?? event.data?.refund?.order_id;
  const order = orderId ? await prisma.order.findUnique({ where: { id: orderId } }) : null;
  if (!order || order.provider !== "cashfree") {
    // Not one of ours (a test webhook, or another site on the same account).
    res.json({ ok: true, ignored: orderId ? "unknown order" : (event.type ?? "no type") });
    return;
  }

  if (event.type === "REFUND_STATUS_WEBHOOK" && event.data?.refund) {
    const r = event.data.refund;
    const providerRefundId = r.cf_refund_id !== undefined ? String(r.cf_refund_id) : null;
    if (r.refund_status === "SUCCESS") {
      const recorded = await recordGatewayRefund(order.id, providerRefundId, r.refund_id);
      res.json({ ok: true, refunded: recorded.changed, refund: recorded.refund?.status ?? null });
      return;
    }
    const ours = r.refund_id ? await prisma.refund.findFirst({ where: { id: r.refund_id, orderId: order.id } }) : null;
    if (ours && r.refund_status === "CANCELLED") {
      const updated = await setRefundStatus(ours.id, "FAILED", { providerRefundId, failureReason: r.status_description ?? "Cancelled by Cashfree" });
      res.json({ ok: true, refund: updated.status });
      return;
    }
    res.json({ ok: true, refund: ours?.status ?? null });
    return;
  }

  if (event.type === "PAYMENT_SUCCESS_WEBHOOK" || event.type === "PAYMENT_FAILED_WEBHOOK" || event.type === "PAYMENT_USER_DROPPED_WEBHOOK") {
    try {
      const settled = await settleFromCashfree(order, "webhook");
      res.json({ ok: true, granted: settled.status === "PAID" });
    } catch (err) {
      // An amount mismatch will never succeed on retry — recorded; acknowledge.
      if (err instanceof AppError && err.statusCode === 400) {
        console.error(`[cashfree] webhook not granted for order ${order.id}: ${err.message}`);
        res.json({ ok: true, granted: false });
        return;
      }
      throw err;
    }
    return;
  }
  res.json({ ok: true, ignored: event.type ?? "no type" });
});
