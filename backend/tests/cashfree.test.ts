import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { clearSettingsCache, saveSetting } from "../src/services/settings.service";
import { applyCoinChange } from "../src/services/coin.service";
import { CASHFREE_PLACEHOLDER_PHONE, ORDER_HOLD_MINUTES, syncPendingRefunds } from "../src/services/order.service";
import { api, createUserAndLogin } from "./helpers";
import { CF_APP_ID, CF_SECRET, FakeCashfree } from "./fakeCashfree";

// Cashfree Payments (client requirements of 6 Nov 2026): orders created on the
// server, payment status checked on the server, signed webhooks, idempotent
// unlocking, and refunds that only complete when Cashfree confirms them.
// Runs against tests/fakeCashfree.ts over real HTTP.

const cf = new FakeCashfree();
let admin: { auth: string; email: string };
let student: { auth: string; email: string };
let studentId: string;
let chapterId: string;

const as = (who: { auth: string }) => ({
  get: (path: string) => api().get(path).set("Authorization", who.auth),
  post: (path: string, body: object = {}) => api().post(path).set("Authorization", who.auth).send(body),
});
const order = (noteId: string, useCoins = false) => as(student).post("/api/payments/orders", { noteId, useCoins, parentConfirmed: true });
const verify = (orderId: string) => as(student).post("/api/payments/verify", { orderId });
const hook = (w: { body: string; signature: string; timestamp: string }) =>
  api()
    .post("/api/payments/webhook/cashfree")
    .set("Content-Type", "application/json")
    .set("x-webhook-signature", w.signature)
    .set("x-webhook-timestamp", w.timestamp)
    .send(w.body);
const balance = async () => (await prisma.user.findUniqueOrThrow({ where: { id: studentId } })).coins;
const giveCoins = (n: number) => prisma.$transaction((tx) => applyCoinChange(tx, { userId: studentId, delta: n, reason: "ADMIN_ADJUST", note: "test" }));
const canDownload = async (noteId: string) => (await as(student).get(`/api/notes/${noteId}/download`)).status === 200;
const makeNote = (pricePaise = 4900) =>
  prisma.note.create({ data: { title: "Cashfree Notes", chapterId, pricePaise, isFree: false, isPublished: true, fileKey: "notes/test/file.pdf", fileSize: 1234 } });

const configureCashfree = () =>
  api().put("/api/admin/settings/cashfree").set("Authorization", admin.auth).send({ appId: CF_APP_ID, secretKey: CF_SECRET, environment: "sandbox" });

beforeAll(async () => {
  await cf.start();
  await seedCatalog();
  admin = await createUserAndLogin("ADMIN");
  student = await createUserAndLogin("STUDENT");
  studentId = (await prisma.user.findUniqueOrThrow({ where: { email: student.email } })).id;
  const subject = await prisma.subject.findFirstOrThrow({
    where: { slug: "social-science", medium: { slug: "english-medium" }, classLevel: { slug: "class-10" } },
    include: { chapters: { where: { slug: "chapter-1" } } },
  });
  chapterId = subject.chapters[0].id;
});
afterAll(() => cf.stop());

beforeEach(async () => {
  await prisma.noteAccess.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.order.deleteMany();
  await prisma.note.deleteMany();
  await prisma.coinTransaction.deleteMany();
  await prisma.user.updateMany({ data: { coins: 0 } });
  await prisma.setting.deleteMany({ where: { key: { in: ["coins", "cashfree", "payments", "storage"] } } });
  clearSettingsCache();
  await saveSetting("storage", {
    endpoint: "https://0000.r2.cloudflarestorage.com",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret",
    bucket: "public-bucket",
    privateBucket: "private-bucket",
    publicUrl: null,
    signedUrlTtlSeconds: 300,
  });
  expect((await configureCashfree()).status).toBe(200);
  cf.requests = [];
});

describe("Cashfree settings", () => {
  it("checks the keys with Cashfree before saving, and never returns the secret", async () => {
    const bad = await api().put("/api/admin/settings/cashfree").set("Authorization", admin.auth).send({ appId: "WRONG", secretKey: "nope" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/rejected the API keys/);

    const view = await api().get("/api/admin/settings/cashfree").set("Authorization", admin.auth);
    expect(view.body.cashfree).toMatchObject({ source: "database", value: { appId: CF_APP_ID, environment: "sandbox", hasSecretKey: true } });
    expect(JSON.stringify(view.body)).not.toContain(CF_SECRET);
    expect(view.body.cashfree.webhookUrl).toMatch(/\/api\/payments\/webhook\/cashfree$/);
    // Public settings never include the gateway
    expect(JSON.stringify((await api().get("/api/settings/public")).body)).not.toMatch(/cashfree|secret/i);
  });

  it("Cashfree is the gateway for new orders unless the admin switches it", async () => {
    const res = await api().get("/api/admin/settings/payments").set("Authorization", admin.auth);
    expect(res.body.setting.value).toEqual({ provider: "cashfree" });
  });

  it("switching gateways is refused unless that gateway's keys are saved and work", async () => {
    const put = (provider: string) => api().put("/api/admin/settings/payments").set("Authorization", admin.auth).send({ provider });
    // Razorpay has no keys here
    const refused = await put("razorpay");
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ code: "GATEWAY_NOT_READY" });
    expect(refused.body.error).toMatch(/Save and test the Razorpay keys first/);
    expect((await api().get("/api/admin/settings/payments").set("Authorization", admin.auth)).body.setting.value.provider).toBe("cashfree");
    // Cashfree's keys work: switching (back) to it is fine
    expect((await put("cashfree")).status).toBe(200);
    // Saved keys that the gateway no longer accepts block the switch too
    await prisma.setting.deleteMany({ where: { key: "payments" } });
    await saveSetting("cashfree", { appId: CF_APP_ID, secretKey: "rotated-and-now-wrong", environment: "sandbox" });
    const stale = await put("cashfree");
    expect(stale.status).toBe(400);
    expect(stale.body.error).toMatch(/didn't accept the saved keys/);
  });

  it("without keys, checkout says payments aren't set up", async () => {
    await api().delete("/api/admin/settings/cashfree").set("Authorization", admin.auth);
    const note = await makeNote();
    const res = await order(note.id);
    expect(res.status).toBe(503);
  });
});

describe("buying with Cashfree", () => {
  it("success: server-made order → payment → verify asks Cashfree → unlocked; secrets only in headers", async () => {
    const note = await makeNote();
    expect(await canDownload(note.id)).toBe(false);
    const created = await order(note.id);
    expect(created.status).toBe(201);
    expect(created.body.checkout).toMatchObject({ provider: "cashfree", orderId: created.body.order.id, mode: "sandbox", paymentSessionId: expect.stringMatching(/^session_/) });
    expect(JSON.stringify(created.body)).not.toContain(CF_SECRET);

    // What Cashfree received: our order id, ₹49.00, the student, a return link
    const sent = cf.orders.get(created.body.order.id)!;
    expect(sent).toMatchObject({ order_amount: 49, order_currency: "INR", customer_details: { customer_email: student.email, customer_phone: CASHFREE_PLACEHOLDER_PHONE } });
    expect(sent.order_meta.return_url).toMatch(/\/checkout\/return\?order_id=\{order_id\}$/);
    expect(cf.requests.every((r) => !r.body.includes(CF_SECRET))).toBe(true);

    // Verify before paying: still pending, nothing unlocked
    expect((await verify(created.body.order.id)).body.status).toBe("PENDING");
    cf.pay(created.body.order.id);
    const res = await verify(created.body.order.id);
    expect(res.body.status).toBe("PAID");
    expect(await canDownload(note.id)).toBe(true);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } });
    expect(stored).toMatchObject({ provider: "cashfree", status: "PAID", confirmedVia: "verify", cashfreePaymentId: expect.any(String) });

    // Verify again and a late webhook change nothing
    expect((await verify(created.body.order.id)).body.status).toBe("PAID");
    const w = cf.webhook("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: created.body.order.id }, payment: { payment_status: "SUCCESS" } });
    expect((await hook(w)).body).toMatchObject({ ok: true });
    expect(await prisma.noteAccess.count({ where: { noteId: note.id } })).toBe(1);
  });

  it("the student's own phone goes to Cashfree when they gave one", async () => {
    await prisma.user.update({ where: { id: studentId }, data: { phone: "9876543210" } });
    const note = await makeNote();
    const created = await order(note.id);
    expect(cf.orders.get(created.body.order.id)!.customer_details.customer_phone).toBe("9876543210");
    await prisma.user.update({ where: { id: studentId }, data: { phone: null } });
  });

  it("the signed webhook alone unlocks (student closed the tab); forged webhooks are refused", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    cf.pay(created.body.order.id);

    const forged = cf.webhook("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: created.body.order.id } }, "wrong-secret");
    expect((await hook(forged)).status).toBe(400);
    const tampered = cf.webhook("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: created.body.order.id } });
    expect((await hook({ ...tampered, body: tampered.body.replace("SUCCESS", "SUCCESS ") })).status).toBe(400);
    expect(await canDownload(note.id)).toBe(false);

    const real = cf.webhook("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: created.body.order.id }, payment: { payment_status: "SUCCESS" } });
    const [a, b] = await Promise.all([hook(real), hook(real)]); // duplicate delivery
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await canDownload(note.id)).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } })).confirmedVia).toBe("webhook");

    // Not our order: acknowledged and ignored
    expect((await hook(cf.webhook("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: "someone-elses-order" } }))).body).toMatchObject({ ignored: "unknown order" });
  });

  it("a webhook can't unlock what Cashfree hasn't been paid for, or the wrong amount", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    // A signed message alone isn't enough: Cashfree has no successful payment
    const early = cf.webhook("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: created.body.order.id } });
    expect((await hook(early)).body).toMatchObject({ granted: false });
    expect(await canDownload(note.id)).toBe(false);

    cf.pay(created.body.order.id, { amount: 1 }); // ₹1 instead of ₹49
    const wrong = cf.webhook("PAYMENT_SUCCESS_WEBHOOK", { order: { order_id: created.body.order.id } });
    expect((await hook(wrong)).body).toMatchObject({ granted: false });
    expect(await canDownload(note.id)).toBe(false);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } })).lastError).toMatch(/Amount mismatch/);
  });

  it("failed and pending payments never unlock; a failed try can be retried", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    cf.pay(created.body.order.id, { status: "FAILED", message: "Card declined by bank" });
    const failed = await verify(created.body.order.id);
    expect(failed.status).toBe(400);
    expect(failed.body).toMatchObject({ code: "PAYMENT_FAILED", error: "Card declined by bank" });

    cf.pay(created.body.order.id, { status: "PENDING" });
    expect((await verify(created.body.order.id)).body.status).toBe("PENDING");
    expect(await canDownload(note.id)).toBe(false);

    // A pending payment is never cancelled at 30 minutes; it waits for Cashfree
    await prisma.order.update({ where: { id: created.body.order.id }, data: { createdAt: new Date(Date.now() - (ORDER_HOLD_MINUTES + 1) * 60_000) } });
    await as(student).get("/api/users/me/orders");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } })).status).toBe("CREATED");

    cf.pay(created.body.order.id); // the retry goes through
    expect((await verify(created.body.order.id)).body.status).toBe("PAID");
    expect(await canDownload(note.id)).toBe(true);
  });

  it("opening checkout again reuses the same Cashfree order; an abandoned one gives coins back", async () => {
    const note = await makeNote();
    await giveCoins(100);
    const first = await order(note.id, true);
    const again = await order(note.id, true);
    expect(again.body.order.id).toBe(first.body.order.id);
    expect(again.body.checkout.paymentSessionId).toBe(first.body.checkout.paymentSessionId);
    expect(cf.orders.size).toBeGreaterThanOrEqual(1);
    const held = first.body.order.coinsUsed;
    expect(await balance()).toBe(100 - held);

    await prisma.order.update({ where: { id: first.body.order.id }, data: { createdAt: new Date(Date.now() - (ORDER_HOLD_MINUTES + 1) * 60_000) } });
    await as(student).get("/api/users/me/orders");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: first.body.order.id } })).status).toBe("CANCELLED");
    expect(await balance()).toBe(100);
  });

  it("if Cashfree is down, the order is cancelled and held coins come back", async () => {
    const note = await makeNote();
    await giveCoins(100);
    cf.failNextOrderCreate = true;
    const res = await order(note.id, true);
    expect(res.status).toBe(502);
    expect(await balance()).toBe(100);
    expect((await prisma.order.findFirstOrThrow({ where: { noteId: note.id } })).status).toBe("CANCELLED");
  });
});

describe("refunds through Cashfree", () => {
  const paidOrder = async (useCoins = false) => {
    const note = await makeNote();
    const created = await order(note.id, useCoins);
    cf.pay(created.body.order.id);
    await verify(created.body.order.id);
    return { note, orderId: created.body.order.id as string };
  };

  it("the admin starts a refund: PENDING until Cashfree confirms, then REFUNDED and access removed", async () => {
    await giveCoins(100);
    const { note, orderId } = await paidOrder(true);
    const coinsAfterBuying = await balance();

    expect((await as(admin).post(`/api/admin/orders/${orderId}/refund`, { reason: "x" })).status).toBe(400); // reason too short
    const started = await as(admin).post(`/api/admin/orders/${orderId}/refund`, { reason: "The PDF was the wrong chapter" });
    expect(started.status).toBe(201);
    expect(started.body.refund).toMatchObject({ status: "PENDING", reason: "ADMIN", note: "The PDF was the wrong chapter", providerRefundId: expect.any(String) });
    expect(started.body.orderStatus).toBe("PAID"); // not complete until confirmed
    expect(await canDownload(note.id)).toBe(true);

    // A second click while it's pending is refused
    expect((await as(admin).post(`/api/admin/orders/${orderId}/refund`, { reason: "Clicked twice by mistake" })).status).toBe(409);

    // The student sees it pending
    const mine = await as(student).get("/api/users/me/orders");
    expect(mine.body.orders[0].refunds[0]).toMatchObject({ status: "PENDING" });

    // Cashfree's refund webhook confirms it
    const refundId = started.body.refund.id;
    const done = cf.settleRefund(refundId);
    const w = cf.webhook("REFUND_STATUS_WEBHOOK", { refund: done });
    expect((await hook(w)).body).toMatchObject({ ok: true, refunded: true });
    expect((await hook(w)).body).toMatchObject({ ok: true, refunded: false }); // replay
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(stored).toMatchObject({ status: "REFUNDED", refundId: String(done.cf_refund_id) });
    expect(await canDownload(note.id)).toBe(false);
    // Client's rule: coins used on it come back only for a duplicate
    expect(await balance()).toBe(coinsAfterBuying);
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).processedAt).toBeInstanceOf(Date);
  });

  it("a missed refund webhook is caught by checking Cashfree (Reconcile and the sweep)", async () => {
    const { orderId } = await paidOrder();
    const started = await as(admin).post(`/api/admin/orders/${orderId}/refund`, { reason: "Student paid but asked for a refund" });
    cf.settleRefund(started.body.refund.id);

    const res = await as(admin).post(`/api/admin/orders/${orderId}/reconcile`);
    expect(res.body).toMatchObject({ changed: true, status: "REFUNDED", refundStatus: "SUCCESS" });

    // The sweep does the same for refunds older than two minutes
    const second = await paidOrder();
    const r2 = await as(admin).post(`/api/admin/orders/${second.orderId}/refund`, { reason: "Another refund to check by sweep" });
    cf.settleRefund(r2.body.refund.id);
    await prisma.refund.update({ where: { id: r2.body.refund.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    expect(await syncPendingRefunds()).toBeGreaterThanOrEqual(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: second.orderId } })).status).toBe("REFUNDED");
  });

  it("a refund Cashfree refuses is FAILED, shown to the admin, and can be started again", async () => {
    const { orderId } = await paidOrder();
    cf.failNextRefund = true;
    const failed = await as(admin).post(`/api/admin/orders/${orderId}/refund`, { reason: "Wrong file was delivered" });
    expect(failed.status).toBe(502);
    expect(failed.body.refund).toMatchObject({ status: "FAILED", failureReason: expect.stringMatching(/refund amount/) });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");

    const detail = await as(admin).get(`/api/admin/orders/${orderId}`);
    expect(detail.body.order.refunds.map((r: { status: string }) => r.status)).toEqual(["FAILED"]);

    const retry = await as(admin).post(`/api/admin/orders/${orderId}/refund`, { reason: "Wrong file was delivered (retry)" });
    expect(retry.body.refund.status).toBe("PENDING");
  });

  it("a cancelled refund at Cashfree is marked FAILED", async () => {
    const { orderId } = await paidOrder();
    const started = await as(admin).post(`/api/admin/orders/${orderId}/refund`, { reason: "Testing a cancelled refund" });
    const cancelled = cf.settleRefund(started.body.refund.id, "CANCELLED");
    expect((await hook(cf.webhook("REFUND_STATUS_WEBHOOK", { refund: cancelled }))).body).toMatchObject({ refund: "FAILED" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");
  });

  it("only paid orders can be refunded, and only by an admin", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    expect((await as(admin).post(`/api/admin/orders/${created.body.order.id}/refund`, { reason: "Not paid yet at all" })).status).toBe(409);
    expect((await as(student).post(`/api/admin/orders/${created.body.order.id}/refund`, { reason: "Let me refund myself" })).status).toBe(403);
  });

  it("the same note paid twice: the duplicate is refunded automatically, with its coins", async () => {
    await giveCoins(200);
    const note = await makeNote();
    const withCoins = await order(note.id, true);
    // Changing the coin choice replaces the first order (CANCELLED, coins back),
    // but its Cashfree window may still be open in another tab: both get paid.
    const full = await order(note.id, false);
    cf.pay(withCoins.body.order.id);
    cf.pay(full.body.order.id);
    const [a, b] = await Promise.all([verify(withCoins.body.order.id), verify(full.body.order.id)]);
    expect([a.status, b.status]).toEqual([200, 200]);

    const orders = await prisma.order.findMany({ where: { noteId: note.id }, include: { refunds: true } });
    const duplicate = orders.find((o) => o.refunds.length > 0)!;
    expect(duplicate.refunds[0]).toMatchObject({ reason: "DUPLICATE", status: "PENDING" });
    // When Cashfree confirms, the duplicate is REFUNDED and its coins come back
    const done = cf.settleRefund(duplicate.refunds[0].id);
    await hook(cf.webhook("REFUND_STATUS_WEBHOOK", { refund: done }));
    const after = await prisma.order.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(after.status).toBe("REFUNDED");
    const kept = orders.find((o) => o.id !== duplicate.id)!;
    expect(await balance()).toBe(200 - kept.coinsUsed);
    expect(await canDownload(note.id)).toBe(true);
  });
});
