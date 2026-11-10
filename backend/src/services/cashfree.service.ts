import crypto from "crypto";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { CashfreeSettings, getSetting } from "./settings.service";

// Minimal Cashfree Payments (PG) REST client, API version 2023-08-01, plus the
// webhook signature check. Like the Razorpay client it is plain fetch, so the
// tests can point CASHFREE_API_BASE at a local fake (tests/fakeCashfree.ts).
// Keys come from the admin-managed `cashfree` setting (env fallback) and are
// only ever used here, on the server (client requirements of 6 Nov 2026).
//
// Our Order.id is used as Cashfree's order_id (a UUID: letters, digits and
// dashes, 36 characters; Cashfree allows 3–45), and a Refund.id as refund_id.

export const CASHFREE_API_VERSION = "2023-08-01";

const BASES = { sandbox: "https://sandbox.cashfree.com/pg", production: "https://api.cashfree.com/pg" } as const;
const baseFor = (config: Pick<CashfreeSettings, "environment">) => env.CASHFREE_API_BASE ?? BASES[config.environment];

export interface CashfreeOrder {
  cf_order_id: string | number;
  order_id: string;
  order_amount: number;
  order_currency: string;
  // ACTIVE | PAID | EXPIRED | TERMINATED | TERMINATION_REQUESTED
  order_status: string;
  payment_session_id: string;
}

export interface CashfreePayment {
  cf_payment_id: string | number;
  order_id?: string;
  // SUCCESS | NOT_ATTEMPTED | FAILED | USER_DROPPED | VOID | CANCELLED | PENDING
  payment_status: string;
  payment_amount: number;
  payment_currency: string;
  payment_message?: string | null;
}

export interface CashfreeRefund {
  cf_refund_id: string | number;
  refund_id: string;
  order_id: string;
  refund_amount: number;
  // SUCCESS | PENDING | CANCELLED | ONHOLD
  refund_status: string;
  status_description?: string | null;
}

export const requireCashfree = async (): Promise<CashfreeSettings> => {
  const config = await getSetting("cashfree");
  if (!config) throw new AppError(503, "Online payments are not set up yet. Please try again later.");
  return config;
};

const call = async <T>(config: CashfreeSettings, method: "GET" | "POST", path: string, body?: object, idempotencyKey?: string): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${baseFor(config)}${path}`, {
      method,
      headers: {
        "x-client-id": config.appId,
        "x-client-secret": config.secretKey,
        "x-api-version": CASHFREE_API_VERSION,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        // A retried POST with the same key does nothing new at Cashfree.
        ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new AppError(502, `Could not reach Cashfree: ${(err as Error).message}`);
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string; code?: string } & T;
  if (!res.ok) {
    if (res.status === 401) throw new AppError(502, "Cashfree rejected the API keys (check the App ID and Secret key, and sandbox vs production)");
    throw new AppError(502, `Cashfree error (${res.status}): ${data.message ?? "unknown error"}`, data.code ? `CASHFREE_${data.code.toUpperCase()}` : undefined);
  }
  return data;
};

// Rupees with two decimals, as Cashfree wants them; back to whole paise.
export const toRupees = (paise: number) => Number((paise / 100).toFixed(2));
export const toPaise = (rupees: number) => Math.round(rupees * 100);

export const createCashfreeOrder = async (input: {
  orderId: string;
  amountPaise: number;
  currency: string;
  customer: { id: string; email: string; phone: string; name: string | null };
  returnUrl: string;
  note: string;
  expiresAt: Date;
}) => {
  const config = await requireCashfree();
  return call<CashfreeOrder>(
    config,
    "POST",
    "/orders",
    {
      order_id: input.orderId,
      order_amount: toRupees(input.amountPaise),
      order_currency: input.currency,
      customer_details: {
        customer_id: input.customer.id,
        customer_email: input.customer.email,
        customer_phone: input.customer.phone,
        ...(input.customer.name ? { customer_name: input.customer.name.slice(0, 100) } : {}),
      },
      // Where Cashfree sends the student back after a redirect-style payment
      order_meta: { return_url: input.returnUrl },
      order_note: input.note.slice(0, 200),
      order_expiry_time: input.expiresAt.toISOString(),
    },
    input.orderId
  );
};

export const fetchCashfreeOrder = async (orderId: string) => call<CashfreeOrder>(await requireCashfree(), "GET", `/orders/${encodeURIComponent(orderId)}`);

export const fetchCashfreeOrderPayments = async (orderId: string) =>
  call<CashfreePayment[]>(await requireCashfree(), "GET", `/orders/${encodeURIComponent(orderId)}/payments`);

// Full refund of an order's payment. refundId is ours (a Refund.id), so asking
// twice can never refund twice.
export const createCashfreeRefund = async (orderId: string, refundId: string, amountPaise: number, note: string) =>
  call<CashfreeRefund>(
    await requireCashfree(),
    "POST",
    `/orders/${encodeURIComponent(orderId)}/refunds`,
    { refund_amount: toRupees(amountPaise), refund_id: refundId, refund_note: note.slice(0, 100), refund_speed: "STANDARD" },
    refundId
  );

export const fetchCashfreeRefund = async (orderId: string, refundId: string) =>
  call<CashfreeRefund>(await requireCashfree(), "GET", `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`);

// Checks keys with a harmless read: asking for an order that can't exist
// answers 404 when the keys are right and 401 when they aren't.
export const testCashfreeKeys = async (config: CashfreeSettings) => {
  const started = Date.now();
  try {
    await call(config, "GET", `/orders/key-check-${crypto.randomUUID().slice(0, 8)}`);
    return { ok: true, message: null as string | null, latencyMs: Date.now() - started };
  } catch (err) {
    const message = (err as Error).message;
    if (/\(404\)/.test(message)) return { ok: true, message: null as string | null, latencyMs: Date.now() - started };
    return { ok: false, message, latencyMs: Date.now() - started };
  }
};

// Webhook signature: base64(HMAC_SHA256(timestamp + raw body, secret key)),
// sent as x-webhook-signature with x-webhook-timestamp.
export const verifyCashfreeWebhook = (secretKey: string, timestamp: string, rawBody: Buffer, signature: string) => {
  const expected = crypto.createHmac("sha256", secretKey).update(timestamp).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
