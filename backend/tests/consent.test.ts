import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../src/config/prisma";
import * as mailer from "../src/utils/mailer";
import { api, createUserAndLogin } from "./helpers";

// Parent / guardian consent for students under 18 (client requirements of
// 6 Nov 2026). Time is simulated by editing rows.

let founder: string;
let sent: { to: string; token: string }[] = [];

const yearsAgo = (years: number, extraDays = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + extraDays);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const kid = async (age = 12) => {
  const s = await createUserAndLogin("STUDENT", { dateOfBirth: yearsAgo(age) });
  const id = (await prisma.user.findUniqueOrThrow({ where: { email: s.email } })).id;
  return { ...s, id };
};
const as = (auth: string) => ({
  get: (p: string) => api().get(p).set("Authorization", auth),
  post: (p: string, b: object = {}) => api().post(p).set("Authorization", auth).send(b),
});
const access = async (auth: string) => (await as(auth).get("/api/auth/me")).body.user.access;
const startQuiz = (auth: string) => as(auth).post("/api/quiz/start", {});
const grant = { decision: "grant", parentName: "Rina Das", relationship: "parent", confirmAdult: true };

beforeAll(async () => {
  founder = (await createUserAndLogin("ADMIN")).auth;
});
beforeEach(() => {
  sent = [];
  vi.spyOn(mailer, "sendParentConsentEmail").mockImplementation(async (to, _name, token) => {
    sent.push({ to, token });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("who needs consent", () => {
  it("under 18: limited until a parent agrees; quizzes and purchases are refused by the server", async () => {
    const k = await kid(12);
    expect(await access(k.auth)).toMatchObject({ fullAccess: false, block: "CONSENT_REQUIRED", consent: { required: true, status: "NONE" } });
    const quiz = await startQuiz(k.auth);
    expect(quiz.status).toBe(403);
    expect(quiz.body.code).toBe("CONSENT_REQUIRED");
    expect((await as(k.auth).post("/api/payments/orders", { noteId: "00000000-0000-4000-8000-000000000000", parentConfirmed: true })).body.code).toBe("CONSENT_REQUIRED");
    // Browsing still works
    expect((await as(k.auth).get("/api/users/me/coins")).status).toBe(200);
  });

  it("adults need nothing; a missing date of birth blocks quizzes; 18 on the birthday counts", async () => {
    const adult = await createUserAndLogin("STUDENT");
    expect(await access(adult.auth)).toMatchObject({ fullAccess: true, block: null, consent: { required: false } });
    expect((await startQuiz(adult.auth)).status).not.toBe(403);

    const unknown = await createUserAndLogin("STUDENT", { dateOfBirth: null });
    expect(await access(unknown.auth)).toMatchObject({ fullAccess: false, block: "NO_DATE_OF_BIRTH" });
    expect((await startQuiz(unknown.auth)).body.code).toBe("NO_DATE_OF_BIRTH");

    const birthday = await createUserAndLogin("STUDENT", { dateOfBirth: yearsAgo(18) });
    expect((await access(birthday.auth)).fullAccess).toBe(true);
    const tomorrow = await createUserAndLogin("STUDENT", { dateOfBirth: yearsAgo(18, 1) });
    expect((await access(tomorrow.auth)).fullAccess).toBe(false);
  });

  it("the requirement is a setting (for the lawyer's decision)", async () => {
    const k = await kid(10);
    await api().put("/api/admin/settings/consent").set("Authorization", founder).send({ required: false });
    expect(await access(k.auth)).toMatchObject({ fullAccess: true, consent: { required: false } });
    await api().delete("/api/admin/settings/consent").set("Authorization", founder);
    expect((await access(k.auth)).fullAccess).toBe(false);
  });
});

describe("the parent's link", () => {
  it("the student asks a parent; the parent agrees; the account is fully active", async () => {
    const k = await kid(13);
    expect((await as(k.auth).post("/api/users/me/consent", { parentEmail: k.email })).status).toBe(400); // not their own email
    const asked = await as(k.auth).post("/api/users/me/consent", { parentEmail: "Rina.Das@Example.com" });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ parentEmail: "ri•••@example.com", consent: { status: "PENDING" } });
    expect(sent).toEqual([{ to: "rina.das@example.com", token: expect.any(String) }]);
    // Asking again straight away waits a minute; after that "send again" uses the saved email
    expect((await as(k.auth).post("/api/users/me/consent", { parentEmail: "rina.das@example.com" })).status).toBe(429);
    await prisma.parentalConsent.update({ where: { userId: k.id }, data: { lastSentAt: new Date(Date.now() - 120_000) } });
    expect((await as(k.auth).post("/api/users/me/consent/resend")).status).toBe(200);
    expect(sent.map((m) => m.to)).toEqual(["rina.das@example.com", "rina.das@example.com"]);
    sent.shift(); // the first link was replaced by the second

    const token = sent[0].token;
    const page = await api().get(`/api/consent/${token}`);
    expect(page.body).toMatchObject({ studentFirstName: "STUDENT", status: "PENDING", expired: false });
    expect(JSON.stringify(page.body)).not.toContain(k.email);

    expect((await api().post(`/api/consent/${token}`).send({ ...grant, confirmAdult: false })).status).toBe(400);
    const answered = await api().post(`/api/consent/${token}`).set("User-Agent", "ParentPhone/1.0").send(grant);
    expect(answered.status).toBe(200);
    expect(answered.body.status).toBe("GRANTED");

    const record = await prisma.parentalConsent.findUniqueOrThrow({ where: { userId: k.id } });
    expect(record).toMatchObject({ status: "GRANTED", parentName: "Rina Das", relationship: "parent", decidedVia: "parent_link", decidedUserAgent: "ParentPhone/1.0", tokenHash: null });
    expect(record.decidedIp).toBeTruthy();
    expect(await access(k.auth)).toMatchObject({ fullAccess: true, consent: { status: "GRANTED" } });
    expect((await startQuiz(k.auth)).status).not.toBe(403);
    // The link works once
    expect((await api().post(`/api/consent/${token}`).send(grant)).status).toBe(404);
  });

  it("a parent can say no; the student can ask again (a new link replaces the old)", async () => {
    const k = await kid(11);
    await as(k.auth).post("/api/users/me/consent", { parentEmail: "dad@example.com" });
    const first = sent[0].token;
    expect((await api().post(`/api/consent/${first}`).send({ ...grant, decision: "decline" })).body.status).toBe("DECLINED");
    expect(await access(k.auth)).toMatchObject({ fullAccess: false, consent: { status: "DECLINED" } });

    await as(k.auth).post("/api/users/me/consent", { parentEmail: "mum@example.com" });
    expect((await access(k.auth)).consent.status).toBe("PENDING");
    expect((await api().get(`/api/consent/${first}`)).status).toBe(404); // old link dead
  });

  it("an expired link is refused; nonsense tokens are not found", async () => {
    const k = await kid(9);
    await as(k.auth).post("/api/users/me/consent", { parentEmail: "late@example.com" });
    await prisma.parentalConsent.update({ where: { userId: k.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api().get(`/api/consent/${sent[0].token}`)).body.expired).toBe(true);
    expect((await api().post(`/api/consent/${sent[0].token}`).send(grant)).status).toBe(410);
    expect((await access(k.auth)).consent.expired).toBe(true);
    expect((await api().get("/api/consent/short")).status).toBe(404);
  });

  it("adults can't ask (there's nothing to approve)", async () => {
    const adult = await createUserAndLogin("STUDENT");
    expect((await as(adult.auth).post("/api/users/me/consent", { parentEmail: "x@example.com" })).status).toBe(400);
  });
});

describe("the admin", () => {
  it("sees the record, can record consent given another way, withdraw it, and resend the link", async () => {
    const k = await kid(14);
    const none = await as(founder).get(`/api/admin/users/${k.id}/consent`);
    expect(none.body).toMatchObject({ required: true, fullAccess: false, record: null });
    expect((await as(founder).post(`/api/admin/users/${k.id}/consent/resend`)).status).toBe(400); // no parent email yet

    const recorded = await as(founder).post(`/api/admin/users/${k.id}/consent/record`, { parentEmail: "parent@example.com", parentName: "Asha Das", relationship: "guardian", note: "Guardian emailed the Helpline on 12 Nov" });
    expect(recorded.status).toBe(200);
    expect(recorded.body).toMatchObject({ fullAccess: true, record: { status: "GRANTED", decidedVia: "admin", relationship: "guardian" } });
    expect(JSON.stringify(recorded.body)).not.toContain("tokenHash");

    const withdrawn = await as(founder).post(`/api/admin/users/${k.id}/consent/withdraw`, { note: "Guardian asked to stop on 20 Nov" });
    expect(withdrawn.body).toMatchObject({ fullAccess: false, record: { status: "WITHDRAWN" } });
    expect((await startQuiz(k.auth)).body.code).toBe("CONSENT_REQUIRED");

    expect((await as(founder).post(`/api/admin/users/${k.id}/consent/resend`)).status).toBe(200);
    expect(sent.at(-1)!.to).toBe("parent@example.com");

    await new Promise((r) => setTimeout(r, 150));
    const actions = (await prisma.adminActivity.findMany({ where: { targetId: k.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["consent.record", "consent.withdraw", "consent.resend"]));
  });

  it("helpers with Students can resend, but only the Super Admin records or withdraws consent", async () => {
    const k = await kid(12);
    await as(k.auth).post("/api/users/me/consent", { parentEmail: "p@example.com" });
    await prisma.parentalConsent.update({ where: { userId: k.id }, data: { lastSentAt: new Date(Date.now() - 120_000) } });
    await as(founder).post("/api/admin/team", { email: "consent-helper@test.local", password: "HelperPassword123!", permissions: ["users"] });
    const helper = `Bearer ${(await api().post("/api/auth/login").send({ email: "consent-helper@test.local", password: "HelperPassword123!" })).body.accessToken}`;
    expect((await as(helper).get(`/api/admin/users/${k.id}/consent`)).status).toBe(200);
    expect((await as(helper).post(`/api/admin/users/${k.id}/consent/resend`)).status).toBe(200);
    expect((await as(helper).post(`/api/admin/users/${k.id}/consent/record`, { parentEmail: "p@example.com", parentName: "P Das", relationship: "parent", note: "Helper trying to record" })).status).toBe(403);
  });

  it("the users list finds students who still need consent", async () => {
    const waiting = await kid(8);
    const missing = (await as(founder).get("/api/admin/users?consent=missing")).body.users.map((u: { id: string }) => u.id);
    expect(missing).toContain(waiting.id);
    const adult = await createUserAndLogin("STUDENT");
    const adultId = (await prisma.user.findUniqueOrThrow({ where: { email: adult.email } })).id;
    expect(missing).not.toContain(adultId);
    const granted = (await as(founder).get("/api/admin/users?consent=granted")).body.users;
    expect(granted.every((u: { parentalConsent: { status: string } | null }) => u.parentalConsent?.status === "GRANTED")).toBe(true);
  });

  it("erasing an account removes its consent record; the export includes it", async () => {
    const k = await kid(15);
    await as(k.auth).post("/api/users/me/consent", { parentEmail: "erase-parent@example.com" });
    const data = JSON.parse((await as(founder).get(`/api/admin/users/${k.id}/export`)).text);
    expect(data.parentalConsent).toMatchObject({ parentEmail: "erase-parent@example.com", status: "PENDING" });
    await api().delete(`/api/admin/users/${k.id}`).set("Authorization", founder).send({ reason: "Parent asked to delete", confirmEmail: k.email });
    expect(await prisma.parentalConsent.count({ where: { userId: k.id } })).toBe(0);
  });
});
