import crypto from "crypto";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { getSetting, RazorpaySettings } from "./settings.service";

// Minimal Razorpay REST client (orders + payments) and signature checks.
// The official SDK isn't used: we need only a few calls, and a plain fetch
// client lets the test suite point RAZORPAY_API_BASE at a local fake server.
// Keys come from the admin-managed `razorpay` setting (env fallback).

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  // created | authorized | captured | refunded | failed
  status: string;
  amount_refunded?: number;
  error_description?: string | null;
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export const requireRazorpay = async (): Promise<RazorpaySettings> => {
  const config = await getSetting("razorpay");
  if (!config) {
    throw new AppError(503, "Online payments are not set up yet. Please try again later.");
  }
  return config;
};

export const razorpayMode = (keyId: string) => (keyId.startsWith("rzp_live_") ? "live" : "test");

const call = async <T>(config: Pick<RazorpaySettings, "keyId" | "keySecret">, method: "GET" | "POST", path: string, body?: object): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${env.RAZORPAY_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new AppError(502, `Could not reach Razorpay: ${(err as Error).message}`);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) {
    if (res.status === 401) throw new AppError(502, "Razorpay rejected the API keys (check Key ID and Key Secret)");
    throw new AppError(502, `Razorpay error (${res.status}): ${data.error?.description ?? "unknown error"}`);
  }
  return data;
};

export const createRazorpayOrder = async (input: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}) => {
  const config = await requireRazorpay();
  return call<RazorpayOrder>(config, "POST", "/orders", {
    amount: input.amountPaise,
    currency: input.currency,
    receipt: input.receipt,
    notes: input.notes,
  });
};

export const fetchRazorpayPayment = async (paymentId: string) =>
  call<RazorpayPayment>(await requireRazorpay(), "GET", `/payments/${encodeURIComponent(paymentId)}`);

export const fetchRazorpayOrderPayments = async (razorpayOrderId: string) =>
  call<{ items: RazorpayPayment[] }>(await requireRazorpay(), "GET", `/orders/${encodeURIComponent(razorpayOrderId)}/payments`);

// Captures an authorized payment, so confirming a payment doesn't depend on
// the dashboard's auto-capture setting. A payment that is already captured
// (auto-capture, or a parallel call) counts as success.
export const captureRazorpayPayment = async (payment: RazorpayPayment): Promise<RazorpayPayment> => {
  const config = await requireRazorpay();
  try {
    return await call<RazorpayPayment>(config, "POST", `/payments/${encodeURIComponent(payment.id)}/capture`, {
      amount: payment.amount,
      currency: payment.currency,
    });
  } catch (err) {
    const latest = await fetchRazorpayPayment(payment.id);
    if (latest.status === "captured") return latest;
    throw err;
  }
};

// Full refund of a payment (e.g. a student who paid twice for the same note).
export const refundRazorpayPayment = async (paymentId: string, amountPaise: number, notes: Record<string, string>) =>
  call<RazorpayRefund>(await requireRazorpay(), "POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes });

// Checks keys with a harmless read. Used by the admin "Test" button before saving.
export const testRazorpayKeys = async (config: RazorpaySettings) => {
  const started = Date.now();
  try {
    await call(config, "GET", "/orders?count=1");
    return { ok: true, mode: razorpayMode(config.keyId), message: null as string | null, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, mode: razorpayMode(config.keyId), message: (err as Error).message, latencyMs: Date.now() - started };
  }
};

const safeEqualHex = (a: string, b: string) => {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const hmac = (secret: string, payload: string | Buffer) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

// Checkout success handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export const verifyCheckoutSignature = (keySecret: string, razorpayOrderId: string, paymentId: string, signature: string) =>
  safeEqualHex(hmac(keySecret, `${razorpayOrderId}|${paymentId}`), signature);

// Webhook signature: HMAC_SHA256(raw request body, webhook secret)
export const verifyWebhookSignature = (webhookSecret: string, rawBody: Buffer, signature: string) =>
  safeEqualHex(hmac(webhookSecret, rawBody), signature);
