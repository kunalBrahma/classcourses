import crypto from "crypto";
import http from "http";

// A small stand-in for Cashfree's PG API (orders, payments, refunds; API
// version 2023-08-01), so the whole Cashfree purchase flow runs over real HTTP
// in tests. Listens on the port in vitest.config.ts → CASHFREE_API_BASE.
export const CF_APP_ID = "TEST_FAKE_APP_ID_123";
export const CF_SECRET = "cfsk_ma_test_fake_secret_value";
export const CF_PORT = 4598;

interface FakeOrder {
  order_id: string;
  cf_order_id: number;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id: string;
  customer_details: { customer_id: string; customer_email: string; customer_phone: string; customer_name?: string };
  order_meta: { return_url?: string };
}
interface FakePayment { cf_payment_id: number; order_id: string; payment_status: string; payment_amount: number; payment_currency: string; payment_message?: string }
interface FakeRefund { cf_refund_id: number; refund_id: string; order_id: string; refund_amount: number; refund_status: string; status_description?: string }

let seq = 5_000_000;

export class FakeCashfree {
  orders = new Map<string, FakeOrder>();
  payments: FakePayment[] = [];
  refunds = new Map<string, FakeRefund>();
  /** Requests received, for checks (e.g. secrets only ever in headers). */
  requests: { method: string; path: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
  failNextOrderCreate = false;
  failNextRefund = false;
  /** Status new refunds start in (Cashfree usually answers PENDING). */
  refundStartStatus = "PENDING";
  private server = http.createServer((req, res) => this.handle(req, res));

  start() {
    return new Promise<void>((resolve) => this.server.listen(CF_PORT, "127.0.0.1", resolve));
  }
  stop() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** The student pays (or fails to) in Cashfree's window. */
  pay(orderId: string, opts: { status?: string; amount?: number; currency?: string; message?: string } = {}) {
    const order = this.orders.get(orderId)!;
    const payment: FakePayment = {
      cf_payment_id: ++seq,
      order_id: orderId,
      payment_status: opts.status ?? "SUCCESS",
      payment_amount: opts.amount ?? order.order_amount,
      payment_currency: opts.currency ?? order.order_currency,
      ...(opts.message ? { payment_message: opts.message } : {}),
    };
    this.payments.push(payment);
    if (payment.payment_status === "SUCCESS") order.order_status = "PAID";
    return payment;
  }

  /** Cashfree finishes a refund (as its refund webhook would report). */
  settleRefund(refundId: string, status = "SUCCESS") {
    const refund = this.refunds.get(refundId)!;
    refund.refund_status = status;
    return refund;
  }

  /** A signed webhook exactly as Cashfree sends it. */
  webhook(type: string, data: object, secret = CF_SECRET, timestamp = String(Date.now())) {
    const body = JSON.stringify({ type, event_time: new Date().toISOString(), data });
    const signature = crypto.createHmac("sha256", secret).update(timestamp + body).digest("base64");
    return { body, signature, timestamp };
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = (req.url ?? "").replace(/^\/pg/, "");
      this.requests.push({ method: req.method ?? "", path, headers: req.headers, body: raw });
      const send = (status: number, body: object) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.headers["x-client-id"] !== CF_APP_ID || req.headers["x-client-secret"] !== CF_SECRET) {
        return send(401, { message: "authentication Failed", code: "request_failed", type: "authentication_error" });
      }
      if (req.headers["x-api-version"] !== "2023-08-01") return send(400, { message: "x-api-version is missing or wrong", code: "request_invalid" });
      const body = raw ? JSON.parse(raw) : {};
      let m: RegExpMatchArray | null;

      if (req.method === "POST" && path === "/orders") {
        if (this.failNextOrderCreate) {
          this.failNextOrderCreate = false;
          return send(500, { message: "Internal error", code: "internal_error" });
        }
        if (!body.customer_details?.customer_phone) return send(400, { message: "customer_details.customer_phone : is missing", code: "customer_details.customer_phone_missing" });
        if (this.orders.has(body.order_id)) return send(409, { message: "order with same order_id already exists", code: "order_already_exists" });
        const order: FakeOrder = {
          order_id: body.order_id,
          cf_order_id: ++seq,
          order_amount: body.order_amount,
          order_currency: body.order_currency,
          order_status: "ACTIVE",
          payment_session_id: `session_${crypto.randomBytes(12).toString("hex")}`,
          customer_details: body.customer_details,
          order_meta: body.order_meta ?? {},
        };
        this.orders.set(order.order_id, order);
        return send(200, order);
      }
      if (req.method === "GET" && (m = path.match(/^\/orders\/([^/]+)$/))) {
        const order = this.orders.get(decodeURIComponent(m[1]));
        return order ? send(200, order) : send(404, { message: "order not found", code: "order_not_found" });
      }
      if (req.method === "GET" && (m = path.match(/^\/orders\/([^/]+)\/payments$/))) {
        const id = decodeURIComponent(m[1]);
        if (!this.orders.has(id)) return send(404, { message: "order not found", code: "order_not_found" });
        return send(200, this.payments.filter((p) => p.order_id === id));
      }
      if (req.method === "POST" && (m = path.match(/^\/orders\/([^/]+)\/refunds$/))) {
        const id = decodeURIComponent(m[1]);
        if (this.failNextRefund) {
          this.failNextRefund = false;
          return send(400, { message: "refund amount is greater than the refundable amount", code: "refund_amount_invalid" });
        }
        if (!this.payments.some((p) => p.order_id === id && p.payment_status === "SUCCESS")) {
          return send(400, { message: "no successful payment for this order", code: "order_not_paid" });
        }
        const existing = this.refunds.get(body.refund_id);
        if (existing) return send(200, existing); // same refund_id: nothing new
        const refund: FakeRefund = { cf_refund_id: ++seq, refund_id: body.refund_id, order_id: id, refund_amount: body.refund_amount, refund_status: this.refundStartStatus };
        this.refunds.set(refund.refund_id, refund);
        return send(200, refund);
      }
      if (req.method === "GET" && (m = path.match(/^\/orders\/([^/]+)\/refunds\/([^/]+)$/))) {
        const refund = this.refunds.get(decodeURIComponent(m[2]));
        return refund ? send(200, refund) : send(404, { message: "refund not found", code: "refund_not_found" });
      }
      send(404, { message: "not found", code: "not_found" });
    });
  }
}
