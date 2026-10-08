import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { clearSettingsCache, saveSetting } from "../src/services/settings.service";
import { applyCoinChange } from "../src/services/coin.service";
import { quotePrice } from "../src/services/order.service";
import { deleteObject } from "../src/services/storage.service";
import { api, createUserAndLogin, hasR2Env } from "./helpers";
import { FAKE_KEY_ID, FAKE_KEY_SECRET, FAKE_WEBHOOK_SECRET, FakeRazorpay } from "./fakeRazorpay";

const rzp = new FakeRazorpay();
let admin: { auth: string; email: string };
let student: { auth: string; email: string };
let studentId: string;
let chapterId: string;
let subjectId: string;

// Private bucket: the real R2 bucket stands in when R2 env vars exist (live
// tests); otherwise dummy credentials — presigned URLs are signed locally, so
// everything except the live upload test works offline.
const configureStorage = () =>
  saveSetting("storage", {
    endpoint: process.env.R2_ENDPOINT ?? "https://0000.r2.cloudflarestorage.com",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "test-access-key",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "test-secret",
    bucket: process.env.R2_BUCKET_NAME ?? "public-bucket",
    privateBucket: process.env.R2_BUCKET_NAME ?? "private-bucket",
    publicUrl: null,
    signedUrlTtlSeconds: 300,
  });

const configureRazorpay = () =>
  api()
    .put("/api/admin/settings/razorpay")
    .set("Authorization", admin.auth)
    .send({ keyId: FAKE_KEY_ID, keySecret: FAKE_KEY_SECRET, webhookSecret: FAKE_WEBHOOK_SECRET });

// A published ₹49 note with a (pretend) uploaded file.
const makeNote = async (data: Partial<{ title: string; pricePaise: number; isFree: boolean; isPublished: boolean; subjectLevel: boolean }> = {}) =>
  prisma.note.create({
    data: {
      title: data.title ?? "Chapter 1 — Complete Notes",
      chapterId: data.subjectLevel ? null : chapterId,
      subjectId: data.subjectLevel ? subjectId : null,
      pricePaise: data.isFree ? 0 : (data.pricePaise ?? 4900),
      isFree: data.isFree ?? false,
      isPublished: data.isPublished ?? true,
      fileKey: "notes/test/file.pdf",
      fileSize: 1234,
    },
  });

const as = (who: { auth: string }) => ({
  get: (path: string) => api().get(path).set("Authorization", who.auth),
  post: (path: string, body: object = {}) => api().post(path).set("Authorization", who.auth).send(body),
});

const order = (noteId: string, useCoins = false, who = student) => as(who).post("/api/payments/orders", { noteId, useCoins });
const verify = (orderId: string, paid: ReturnType<FakeRazorpay["pay"]>, who = student) =>
  as(who).post("/api/payments/verify", {
    orderId,
    razorpay_order_id: paid.razorpay_order_id,
    razorpay_payment_id: paid.razorpay_payment_id,
    razorpay_signature: paid.razorpay_signature,
  });
const sendWebhook = (body: string, signature: string) =>
  api().post("/api/payments/webhook/razorpay").set("Content-Type", "application/json").set("x-razorpay-signature", signature).send(body);
const balance = async () => (await prisma.user.findUniqueOrThrow({ where: { id: studentId } })).coins;
const giveCoins = (n: number) => prisma.$transaction((tx) => applyCoinChange(tx, { userId: studentId, delta: n, reason: "ADMIN_ADJUST", note: "test" }));

beforeAll(async () => {
  await rzp.start();
  await seedCatalog();
  admin = await createUserAndLogin("ADMIN");
  student = await createUserAndLogin("STUDENT");
  studentId = (await prisma.user.findUniqueOrThrow({ where: { email: student.email } })).id;
  const subject = await prisma.subject.findFirstOrThrow({
    where: { slug: "social-science", medium: { slug: "english-medium" }, classLevel: { slug: "class-10" } },
    include: { chapters: { where: { slug: "chapter-1" } } },
  });
  subjectId = subject.id;
  chapterId = subject.chapters[0].id;
});

afterAll(() => rzp.stop());

beforeEach(async () => {
  await prisma.noteAccess.deleteMany();
  await prisma.order.deleteMany();
  await prisma.note.deleteMany();
  await prisma.coinTransaction.deleteMany();
  await prisma.user.updateMany({ data: { coins: 0 } });
  await prisma.setting.deleteMany({ where: { key: { in: ["coins", "razorpay", "storage"] } } });
  clearSettingsCache();
});

describe("coin discount pricing", () => {
  const coins = { perPass: 10, coinValuePaise: 10, maxDiscountPercent: 50, awardRule: "firstPassPerChapter" as const };

  it("no coins → full price", () => {
    expect(quotePrice(4900, 500, coins, false)).toMatchObject({ coinsUsed: 0, amountPaise: 4900 });
    expect(quotePrice(4900, 0, coins, true)).toMatchObject({ coinsUsed: 0, amountPaise: 4900 });
  });

  it("caps the discount at 50% and never over-spends coins", () => {
    expect(quotePrice(4900, 1000, coins, true)).toMatchObject({ coinsUsed: 245, discountPaise: 2450, amountPaise: 2450 });
    expect(quotePrice(4900, 30, coins, true)).toMatchObject({ coinsUsed: 30, discountPaise: 300, amountPaise: 4600 });
  });

  it("never leaves less than Razorpay's ₹1 minimum to pay", () => {
    const q = quotePrice(150, 1000, { ...coins, maxDiscountPercent: 90 }, true);
    expect(q.amountPaise).toBeGreaterThanOrEqual(100);
    expect(q).toMatchObject({ coinsUsed: 5, amountPaise: 100 });
  });

  it("at 100% with enough coins the note is fully covered", () => {
    expect(quotePrice(4900, 1000, { ...coins, maxDiscountPercent: 100 }, true)).toMatchObject({ coinsUsed: 490, amountPaise: 0 });
    // 30-paise coins: 163 coins = ₹48.90 would leave 10 paise → round up to full coverage
    expect(quotePrice(4900, 1000, { ...coins, coinValuePaise: 30, maxDiscountPercent: 100 }, true)).toMatchObject({ coinsUsed: 164, amountPaise: 0 });
  });
});

describe("admin: notes", () => {
  it("validates where a note is attached and its price", async () => {
    const both = await as(admin).post("/api/admin/notes", { title: "X", chapterId, subjectId, pricePaise: 4900 });
    expect(both.status).toBe(400);
    expect((await as(admin).post("/api/admin/notes", { title: "X", pricePaise: 4900 })).status).toBe(400);
    const cheap = await as(admin).post("/api/admin/notes", { title: "X", chapterId, pricePaise: 50 });
    expect(cheap.body.error).toMatch(/at least ₹1/);
  });

  it("can't publish without a PDF, or upload without a private bucket", async () => {
    const created = await as(admin).post("/api/admin/notes", { title: "Notes", chapterId, pricePaise: 4900 });
    expect(created.status).toBe(201);
    const id = created.body.note.id;
    const publish = await api().patch(`/api/admin/notes/${id}`).set("Authorization", admin.auth).send({ isPublished: true });
    expect(publish.body.error).toMatch(/Upload the PDF/);
    const upload = await as(admin).post(`/api/admin/notes/${id}/upload-url`, { contentType: "application/pdf", size: 1000 });
    expect(upload.body.error).toMatch(/Private bucket/);
  });

  it("only accepts PDFs up to 50 MB, and only its own file keys", async () => {
    await configureStorage();
    const note = await makeNote();
    expect((await as(admin).post(`/api/admin/notes/${note.id}/upload-url`, { contentType: "image/png", size: 10 })).status).toBe(400);
    expect((await as(admin).post(`/api/admin/notes/${note.id}/upload-url`, { contentType: "application/pdf", size: 60 * 1024 * 1024 })).status).toBe(400);
    const url = await as(admin).post(`/api/admin/notes/${note.id}/upload-url`, { contentType: "application/pdf", size: 1000 });
    expect(url.body.key).toMatch(new RegExp(`^notes/${note.id}/[0-9a-f-]{36}\\.pdf$`));
    expect((await as(admin).post(`/api/admin/notes/${note.id}/file`, { key: "notes/someone-else/x.pdf" })).status).toBe(400);
  });

  it("a note that was ever ordered can't be deleted", async () => {
    await configureStorage();
    await configureRazorpay();
    const note = await makeNote();
    await order(note.id);
    const res = await api().delete(`/api/admin/notes/${note.id}`).set("Authorization", admin.auth);
    expect(res.status).toBe(409);
  });

  it.skipIf(!hasR2Env)("live: upload a PDF to the private bucket, attach it, and download it", async () => {
    await configureStorage();
    const created = await as(admin).post("/api/admin/notes", { title: "Live PDF", chapterId, isFree: true });
    const id = created.body.note.id;
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    const url = await as(admin).post(`/api/admin/notes/${id}/upload-url`, { contentType: "application/pdf", size: pdf.length });
    try {
      const put = await fetch(url.body.uploadUrl, { method: "PUT", body: pdf, headers: { "Content-Type": "application/pdf" } });
      expect(put.status).toBe(200);
      const attached = await as(admin).post(`/api/admin/notes/${id}/file`, { key: url.body.key });
      expect(attached.body.note).toMatchObject({ fileKey: url.body.key, fileSize: pdf.length });

      await api().patch(`/api/admin/notes/${id}`).set("Authorization", admin.auth).send({ isPublished: true });
      const dl = await as(student).get(`/api/notes/${id}/download`);
      const file = await fetch(dl.body.url);
      expect(file.status).toBe(200);
      expect(file.headers.get("content-disposition")).toContain("Live PDF.pdf");
      expect(Buffer.from(await file.arrayBuffer()).equals(pdf)).toBe(true);
    } finally {
      await deleteObject(url.body.key, "private");
    }
  });
});

describe("store & visibility", () => {
  it("lists only published notes with a file; shows ownership when logged in", async () => {
    await configureStorage();
    const visible = await makeNote();
    await makeNote({ title: "Draft", isPublished: false });
    await prisma.note.create({ data: { title: "No file", chapterId, pricePaise: 4900, isPublished: true } });
    await prisma.noteAccess.create({ data: { userId: studentId, noteId: visible.id } });

    const anon = await api().get(`/api/notes?chapterId=${chapterId}`);
    expect(anon.body.notes.map((n: { title: string }) => n.title)).toEqual(["Chapter 1 — Complete Notes"]);
    expect(anon.body.notes[0].owned).toBe(false);
    const mine = await as(student).get(`/api/notes?medium=english-medium&classSlug=class-10&subject=social-science`);
    expect(mine.body.notes[0].owned).toBe(true);
    expect(JSON.stringify(anon.body)).not.toContain("fileKey");
  });

  it("the chapter page lists chapter notes and whole-subject notes", async () => {
    await makeNote();
    await makeNote({ title: "Full subject guide", subjectLevel: true });
    const res = await api().get("/api/catalog/mediums/english-medium/classes/10/subjects/social-science/chapters/chapter-1");
    expect(res.body.notes.map((n: { title: string; scope: string }) => [n.title, n.scope]).sort()).toEqual([
      ["Chapter 1 — Complete Notes", "chapter"],
      ["Full subject guide", "subject"],
    ]);
  });

  it("free notes: login required, no purchase", async () => {
    await configureStorage();
    const note = await makeNote({ isFree: true });
    expect((await api().get(`/api/notes/${note.id}/download`)).status).toBe(401);
    const res = await as(student).get(`/api/notes/${note.id}/download`);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("X-Amz-Expires=300");
    expect(decodeURIComponent(res.body.url)).toContain('filename="Chapter 1 _ Complete Notes.pdf"');
    expect((await order(note.id)).body.error).toMatch(/free/);
  });
});

describe("razorpay settings", () => {
  it("checks keys with Razorpay before saving and never returns secrets", async () => {
    const bad = await api()
      .put("/api/admin/settings/razorpay")
      .set("Authorization", admin.auth)
      .send({ keyId: FAKE_KEY_ID, keySecret: "wrong" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/rejected the API keys/);

    const ok = await configureRazorpay();
    expect(ok.status).toBe(200);
    expect(ok.body.razorpay).toMatchObject({ source: "database", mode: "test" });
    expect(ok.body.razorpay.value).toMatchObject({ keyId: FAKE_KEY_ID, hasKeySecret: true, hasWebhookSecret: true });
    expect(JSON.stringify(ok.body)).not.toContain(FAKE_KEY_SECRET);
    expect(JSON.stringify(ok.body)).not.toContain(FAKE_WEBHOOK_SECRET);
    expect(ok.body.razorpay.webhookUrl).toMatch(/\/api\/payments\/webhook\/razorpay$/);
  });

  it("rejects malformed key ids", async () => {
    const res = await api().put("/api/admin/settings/razorpay").set("Authorization", admin.auth).send({ keyId: "abc", keySecret: "x" });
    expect(res.status).toBe(400);
  });
});

describe("buying a note", () => {
  beforeEach(async () => {
    await configureStorage();
    await configureRazorpay();
  });

  it("is refused while payments or the private bucket aren't configured", async () => {
    const note = await makeNote();
    await prisma.setting.deleteMany({ where: { key: "razorpay" } });
    clearSettingsCache();
    expect((await order(note.id)).status).toBe(503);
    await configureRazorpay();
    await prisma.setting.deleteMany({ where: { key: "storage" } });
    clearSettingsCache();
    expect((await order(note.id)).body.error).toMatch(/not available yet/);
  });

  it("happy path: order → pay → verify → download; receipts are idempotent", async () => {
    const note = await makeNote();
    expect((await as(student).get(`/api/notes/${note.id}/download`)).status).toBe(403);

    const created = await order(note.id);
    expect(created.status).toBe(201);
    expect(created.body.checkout).toMatchObject({ keyId: FAKE_KEY_ID, amount: 4900, currency: "INR", description: note.title });
    expect(created.body.order).toMatchObject({ status: "CREATED", amountPaise: 4900, coinsUsed: 0 });

    const paid = rzp.pay(created.body.checkout.razorpayOrderId);
    const res = await verify(created.body.order.id, paid);
    expect(res.body.status).toBe("PAID");
    expect((await as(student).get(`/api/notes/${note.id}/download`)).status).toBe(200);

    // Verifying again (and a late webhook) changes nothing
    expect((await verify(created.body.order.id, paid)).body.status).toBe("PAID");
    const hook = rzp.webhook("payment.captured", paid.payment);
    expect((await sendWebhook(hook.body, hook.signature)).status).toBe(200);
    expect(await prisma.noteAccess.count({ where: { userId: studentId } })).toBe(1);
    expect((await prisma.order.findFirstOrThrow({ where: { id: created.body.order.id } })).confirmedVia).toBe("verify");

    expect((await order(note.id)).status).toBe(409); // already owned
    const library = await as(student).get("/api/users/me/notes");
    expect(library.body.notes[0]).toMatchObject({ id: note.id, owned: true });
  });

  it("a forged or mismatched signature never unlocks the note", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    const paid = rzp.pay(created.body.checkout.razorpayOrderId);
    const forged = await verify(created.body.order.id, { ...paid, razorpay_signature: "0".repeat(64) });
    expect(forged.status).toBe(400);
    expect((await as(student).get(`/api/notes/${note.id}/download`)).status).toBe(403);

    // A real payment for a DIFFERENT order can't be replayed onto this one
    const other = await order((await makeNote({ title: "Other" })).id);
    const otherPaid = rzp.pay(other.body.checkout.razorpayOrderId);
    expect((await verify(created.body.order.id, otherPaid)).status).toBe(400);
  });

  it("authorized-but-not-captured is PENDING until the webhook confirms", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    const paid = rzp.pay(created.body.checkout.razorpayOrderId, { status: "authorized" });
    expect((await verify(created.body.order.id, paid)).body.status).toBe("PENDING");

    const hook = rzp.webhook("payment.captured", { ...paid.payment, status: "captured" });
    const res = await sendWebhook(hook.body, hook.signature);
    expect(res.body).toMatchObject({ ok: true, granted: true });
    expect((await as(student).get(`/api/payments/orders/${created.body.order.id}`)).body.order.status).toBe("PAID");
  });

  it("webhook: rejects bad signatures, ignores unknown orders, refuses wrong amounts", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    const paid = rzp.pay(created.body.checkout.razorpayOrderId);

    const forged = rzp.webhook("payment.captured", paid.payment, "not-the-secret");
    expect((await sendWebhook(forged.body, forged.signature)).status).toBe(400);

    const unknown = rzp.webhook("payment.captured", { ...paid.payment, order_id: "order_notours" });
    expect((await sendWebhook(unknown.body, unknown.signature)).body.ignored).toBe("unknown order");

    const short = rzp.webhook("payment.captured", { ...paid.payment, amount: 100 });
    expect((await sendWebhook(short.body, short.signature)).body).toMatchObject({ ok: true, granted: false });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } });
    expect(stored.status).toBe("CREATED");
    expect(stored.lastError).toMatch(/Amount mismatch/);
  });

  it("a failed payment is recorded, and the student can retry", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    const failed = rzp.pay(created.body.checkout.razorpayOrderId, { status: "failed" });
    const res = await verify(created.body.order.id, failed);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Card declined/);
    const retry = rzp.pay(created.body.checkout.razorpayOrderId);
    expect((await verify(created.body.order.id, retry)).body.status).toBe("PAID");
  });

  it("other students can't verify or see your order", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    const paid = rzp.pay(created.body.checkout.razorpayOrderId);
    const other = await createUserAndLogin("STUDENT");
    expect((await verify(created.body.order.id, paid, other)).status).toBe(404);
    expect((await as(other).get(`/api/payments/orders/${created.body.order.id}`)).status).toBe(404);
  });
});

describe("coins at checkout", () => {
  beforeEach(async () => {
    await configureStorage();
    await configureRazorpay();
  });

  it("holds coins on the order and shows the quote", async () => {
    const note = await makeNote();
    await giveCoins(300);
    const quote = await as(student).get(`/api/notes/${note.id}/quote`);
    expect(quote.body.withCoins).toMatchObject({ coinsUsed: 245, amountPaise: 2450 });

    const created = await order(note.id, true);
    expect(created.body.checkout.amount).toBe(2450);
    expect(await balance()).toBe(55);
    const ledger = await prisma.coinTransaction.findFirstOrThrow({ where: { reason: "NOTE_DISCOUNT" } });
    expect(ledger).toMatchObject({ delta: -245, balanceAfter: 55, refId: created.body.order.id });

    const paid = rzp.pay(created.body.checkout.razorpayOrderId);
    expect((await verify(created.body.order.id, paid)).body.status).toBe("PAID");
    expect(await balance()).toBe(55);
  });

  it("a new checkout for the same note cancels the old one and returns its coins", async () => {
    const note = await makeNote();
    await giveCoins(300);
    const first = await order(note.id, true);
    const second = await order(note.id, true);
    // 300 − 245 held by the first order, +245 refunded when it was replaced, −245 held by the second
    expect(await balance()).toBe(55);
    const firstStored = await prisma.order.findUniqueOrThrow({ where: { id: first.body.order.id } });
    expect(firstStored.status).toBe("CANCELLED");
    expect(await prisma.coinTransaction.count({ where: { reason: "NOTE_DISCOUNT_REFUND", refId: first.body.order.id } })).toBe(1);
    expect(second.body.order.status).toBe("CREATED");
  });

  it("an abandoned order gives its coins back after 30 minutes", async () => {
    const note = await makeNote();
    await giveCoins(300);
    const created = await order(note.id, true);
    await prisma.order.update({ where: { id: created.body.order.id }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });

    const orders = await as(student).get("/api/users/me/orders");
    expect(orders.body.orders[0].status).toBe("CANCELLED");
    expect(await balance()).toBe(300);

    // If the student pays that old checkout anyway, they still get the note.
    const paid = rzp.pay(created.body.checkout.razorpayOrderId);
    const hook = rzp.webhook("payment.captured", paid.payment);
    expect((await sendWebhook(hook.body, hook.signature)).body.granted).toBe(true);
    expect((await as(student).get(`/api/notes/${note.id}/download`)).status).toBe(200);
  });

  it("if Razorpay is down, the order is cancelled and coins returned", async () => {
    const note = await makeNote();
    await giveCoins(300);
    rzp.failNextOrderCreate = true;
    const res = await order(note.id, true);
    expect(res.status).toBe(502);
    expect(await balance()).toBe(300);
    expect((await prisma.order.findFirstOrThrow({ where: { noteId: note.id } })).status).toBe("CANCELLED");
  });

  it("fully covered by coins (100% setting): unlocked immediately, no Razorpay call", async () => {
    await api().put("/api/admin/settings/coins").set("Authorization", admin.auth).send({ maxDiscountPercent: 100 });
    const note = await makeNote();
    await giveCoins(1000);
    const before = rzp.orders.size;
    const res = await order(note.id, true);
    expect(res.body.order).toMatchObject({ status: "PAID", amountPaise: 0, coinsUsed: 490 });
    expect(res.body.checkout).toBeNull();
    expect(rzp.orders.size).toBe(before);
    expect(await balance()).toBe(510);
    expect((await as(student).get(`/api/notes/${note.id}/download`)).status).toBe(200);
  });
});

describe("admin: orders", () => {
  beforeEach(async () => {
    await configureStorage();
    await configureRazorpay();
  });

  it("reconcile unlocks a paid order whose confirmation never arrived", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    rzp.pay(created.body.checkout.razorpayOrderId); // paid, but no verify / webhook
    const res = await as(admin).post(`/api/admin/orders/${created.body.order.id}/reconcile`);
    expect(res.body).toMatchObject({ changed: true, status: "PAID" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } })).confirmedVia).toBe("reconcile");
  });

  it("lists orders with revenue, and can grant a note manually", async () => {
    const note = await makeNote();
    const created = await order(note.id);
    await verify(created.body.order.id, rzp.pay(created.body.checkout.razorpayOrderId));
    await order((await makeNote({ title: "Unpaid" })).id);

    const list = await as(admin).get("/api/admin/orders");
    expect(list.body.total).toBe(2);
    expect(list.body.paid).toEqual({ count: 1, amountPaise: 4900 });
    expect((await as(admin).get("/api/admin/orders?status=PAID")).body.orders).toHaveLength(1);

    const other = await createUserAndLogin("STUDENT");
    const otherId = (await prisma.user.findUniqueOrThrow({ where: { email: other.email } })).id;
    expect((await as(admin).post(`/api/admin/notes/${note.id}/grant`, { userId: otherId })).status).toBe(201);
    expect((await as(other).get(`/api/notes/${note.id}/download`)).status).toBe(200);
  });

  it("is admin-only", async () => {
    expect((await as(student).get("/api/admin/orders")).status).toBe(403);
    expect((await as(student).get("/api/admin/notes")).status).toBe(403);
  });
});
