import crypto from "crypto";
import http from "http";

// A tiny stand-in for api.razorpay.com (orders + payments), so the whole
// purchase flow runs over real HTTP in tests. Listens on the port in
// vitest.config.ts → RAZORPAY_API_BASE.
export const FAKE_KEY_ID = "rzp_test_FakeKey123";
export const FAKE_KEY_SECRET = "fake_key_secret_value";
export const FAKE_WEBHOOK_SECRET = "fake_webhook_secret_value";
export const FAKE_PORT = 4599;

interface FakeOrder { id: string; amount: number; currency: string; receipt: string; status: string }
interface FakePayment { id: string; order_id: string; amount: number; currency: string; status: string; amount_refunded?: number; error_description?: string }
interface FakeRefund { id: string; payment_id: string; amount: number; status: string }

export class FakeRazorpay {
  orders = new Map<string, FakeOrder>();
  payments = new Map<string, FakePayment>();
  refunds = new Map<string, FakeRefund>();
  failNextOrderCreate = false;
  failNextRefund = false;
  private server = http.createServer((req, res) => this.handle(req, res));

  start() {
    return new Promise<void>((resolve) => this.server.listen(FAKE_PORT, "127.0.0.1", resolve));
  }
  stop() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // Simulates the student paying in Razorpay Checkout. Returns what the checkout success handler receives.
  pay(orderId: string, opts: { status?: string; amount?: number; currency?: string } = {}) {
    const order = this.orders.get(orderId)!;
    const payment: FakePayment = {
      id: `pay_${crypto.randomBytes(7).toString("hex")}`,
      order_id: orderId,
      amount: opts.amount ?? order.amount,
      currency: opts.currency ?? "INR",
      status: opts.status ?? "captured",
      ...(opts.status === "failed" ? { error_description: "Card declined by bank" } : {}),
    };
    this.payments.set(payment.id, payment);
    const signature = crypto.createHmac("sha256", FAKE_KEY_SECRET).update(`${orderId}|${payment.id}`).digest("hex");
    return { payment, razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: signature };
  }

  webhook(event: string, payment: FakePayment, secret = FAKE_WEBHOOK_SECRET, refund?: FakeRefund) {
    const body = JSON.stringify({ event, payload: { payment: { entity: payment }, ...(refund ? { refund: { entity: refund } } : {}) } });
    return { body, signature: crypto.createHmac("sha256", secret).update(body).digest("hex") };
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const send = (status: number, body: object) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const expected = `Basic ${Buffer.from(`${FAKE_KEY_ID}:${FAKE_KEY_SECRET}`).toString("base64")}`;
    if (req.headers.authorization !== expected) {
      return send(401, { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } });
    }

    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname.replace(/^\/v1/, "");

      if (req.method === "POST" && path === "/orders") {
        if (this.failNextOrderCreate) {
          this.failNextOrderCreate = false;
          return send(500, { error: { description: "Internal error" } });
        }
        const body = JSON.parse(raw);
        const order = { id: `order_${crypto.randomBytes(7).toString("hex")}`, amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created" };
        this.orders.set(order.id, order);
        return send(200, order);
      }
      if (req.method === "GET" && path === "/orders") return send(200, { entity: "collection", count: 0, items: [] });

      const orderPayments = /^\/orders\/([^/]+)\/payments$/.exec(path);
      if (req.method === "GET" && orderPayments) {
        return send(200, { items: [...this.payments.values()].filter((p) => p.order_id === orderPayments[1]) });
      }
      const capture = /^\/payments\/([^/]+)\/capture$/.exec(path);
      if (req.method === "POST" && capture) {
        const p = this.payments.get(capture[1]);
        if (!p) return send(400, { error: { description: "The id provided does not exist" } });
        if (p.status === "captured") return send(400, { error: { description: "This payment has already been captured" } });
        if (p.status !== "authorized") return send(400, { error: { description: "Only authorized payments can be captured" } });
        const body = JSON.parse(raw);
        if (body.amount !== p.amount || body.currency !== p.currency) return send(400, { error: { description: "Capture amount must be equal to the amount authorized" } });
        p.status = "captured";
        return send(200, p);
      }
      const refund = /^\/payments\/([^/]+)\/refund$/.exec(path);
      if (req.method === "POST" && refund) {
        const p = this.payments.get(refund[1]);
        if (!p || p.status !== "captured") return send(400, { error: { description: "Payment can't be refunded" } });
        if (this.failNextRefund) {
          this.failNextRefund = false;
          return send(500, { error: { description: "Internal error" } });
        }
        const body = JSON.parse(raw);
        if ((p.amount_refunded ?? 0) + body.amount > p.amount) return send(400, { error: { description: "The total refund amount is greater than the refund payment amount" } });
        const r = { id: `rfnd_${crypto.randomBytes(7).toString("hex")}`, payment_id: p.id, amount: body.amount, status: "processed" };
        p.amount_refunded = (p.amount_refunded ?? 0) + body.amount;
        if (p.amount_refunded === p.amount) p.status = "refunded";
        this.refunds.set(r.id, r);
        return send(200, r);
      }
      const payment = /^\/payments\/([^/]+)$/.exec(path);
      if (req.method === "GET" && payment) {
        const p = this.payments.get(payment[1]);
        return p ? send(200, p) : send(400, { error: { description: "The id provided does not exist" } });
      }
      send(404, { error: { description: "not found" } });
    });
  }
}
