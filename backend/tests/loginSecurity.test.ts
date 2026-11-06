import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../src/config/prisma";
import * as mailer from "../src/utils/mailer";
import { hashPassword } from "../src/utils/password";
import { accountKey } from "../src/services/loginThrottle.service";
import { api, createUserAndLogin } from "./helpers";

// Sign-in security (client requirements of 6 Nov 2026): failed sign-ins in the
// database with a growing pause, a stricter rule for admins that can never
// lock them out for long, an unlock code, a log of admin sign-ins, and
// forgot-password by a 6-digit code valid exactly 5 minutes.
// Time is simulated by editing rows (lockedUntil, lastFailureAt, expiresAt).

const PASSWORD = "Password123!";
const login = (email: string, password = PASSWORD) => api().post("/api/auth/login").send({ email, password });
const fail = async (email: string, times: number) => {
  let last;
  for (let i = 0; i < times; i++) last = await login(email, "wrong-password");
  return last!;
};
const makeUser = async (email: string, role: "STUDENT" | "ADMIN" = "STUDENT") =>
  prisma.user.create({ data: { email, name: "Test", role, password: await hashPassword(PASSWORD) } });
const expireLock = (email: string) => prisma.loginThrottle.update({ where: { key: accountKey(email) }, data: { lockedUntil: new Date(Date.now() - 1000) } });

// The emailed codes, caught on their way out
let sent: { to: string; purpose: string; code: string; minutes: number }[] = [];
const lastCode = (to: string, purpose: string) => [...sent].reverse().find((m) => m.to === to && m.purpose === purpose)?.code;

let adminAuth: string;
beforeAll(async () => {
  adminAuth = (await createUserAndLogin("ADMIN")).auth;
  // Every request here comes from one IP; the per-network rule is tested in
  // rateLimit.test.ts, so this file lets the network make many failures.
  expect((await api().put("/api/admin/settings/security").set("Authorization", adminAuth).send({ loginIpMax: 1000 })).status).toBe(200);
});
beforeEach(async () => {
  sent = [];
  vi.spyOn(mailer, "sendAuthCodeEmail").mockImplementation(async (to, purpose, code, minutes) => {
    sent.push({ to, purpose, code, minutes });
  });
  // Each case starts with no failed sign-ins (the network counter is shared)
  await prisma.loginThrottle.deleteMany();
});
afterEach(() => vi.restoreAllMocks());

describe("failed sign-ins", () => {
  it("say how many tries are left, then pause the account; the pause is in the database", async () => {
    const email = "kid1@test.local";
    await makeUser(email);
    expect((await login(email, "nope")).body).toMatchObject({ code: "WRONG_PASSWORD", error: "Email or password is wrong.", triesLeft: 4 });
    await fail(email, 2);
    const fourth = await login(email, "nope");
    expect(fourth.status).toBe(401);
    expect(fourth.body.error).toMatch(/1 try left before sign-in is paused/);
    const fifth = await login(email, "nope");
    expect(fifth.status).toBe(429);
    expect(fifth.body).toMatchObject({ code: "LOGIN_LOCKED", retryAfter: 900 });
    expect(fifth.body.error).toMatch(/paused for 15 minutes/);

    // A refresh or another browser changes nothing: the row is on the server
    const row = await prisma.loginThrottle.findUniqueOrThrow({ where: { key: accountKey(email) } });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect((await login(email)).status).toBe(429);

    // When the pause ends, the right password works and clears the count
    await expireLock(email);
    expect((await login(email)).status).toBe(200);
    expect(await prisma.loginThrottle.findUnique({ where: { key: accountKey(email) } })).toBeNull();
  });

  it("unknown emails count the same, so a pause never reveals which emails exist", async () => {
    const res = await fail("nobody@test.local", 5);
    expect(res.status).toBe(429);
    expect((await login("nobody@test.local", "nope")).body.code).toBe("LOGIN_LOCKED");
  });

  it("each new pause doubles the wait, up to 24 hours; a quiet day forgets earlier pauses", async () => {
    const email = "kid2@test.local";
    await makeUser(email);
    const waits: number[] = [];
    for (let round = 0; round < 3; round++) {
      waits.push((await fail(email, 5)).body.retryAfter);
      await expireLock(email);
    }
    expect(waits).toEqual([15 * 60, 30 * 60, 60 * 60]);

    await prisma.loginThrottle.update({ where: { key: accountKey(email) }, data: { lockLevel: 20 } });
    expect((await fail(email, 5)).body.retryAfter).toBe(24 * 60 * 60);

    await prisma.loginThrottle.update({ where: { key: accountKey(email) }, data: { lockedUntil: null, lastFailureAt: new Date(Date.now() - 25 * 60 * 60_000) } });
    expect((await fail(email, 5)).body.retryAfter).toBe(15 * 60);
  });

  it("failures older than the 15-minute window don't add up", async () => {
    const email = "kid3@test.local";
    await makeUser(email);
    await fail(email, 4);
    await prisma.loginThrottle.update({ where: { key: accountKey(email) }, data: { windowStart: new Date(Date.now() - 16 * 60_000) } });
    expect((await login(email, "nope")).body.triesLeft).toBe(4);
  });

  it("the admin can see a paused student and unpause them", async () => {
    const email = "kid4@test.local";
    const kid = await makeUser(email);
    await fail(email, 5);
    const status = await api().get(`/api/admin/users/${kid.id}/sign-in`).set("Authorization", adminAuth);
    expect(status.body.signIn).toMatchObject({ locked: true });
    const cleared = await api().post(`/api/admin/users/${kid.id}/sign-in/clear`).set("Authorization", adminAuth);
    expect(cleared.body.signIn).toMatchObject({ locked: false, failures: 0 });
    expect((await login(email)).status).toBe(200);

    const student = await createUserAndLogin("STUDENT");
    expect((await api().post(`/api/admin/users/${kid.id}/sign-in/clear`).set("Authorization", student.auth)).status).toBe(403);
  });
});

describe("admin sign-in", () => {
  it("has its own limit, a short cap, and every attempt is logged", async () => {
    const email = "founder@test.local";
    await makeUser(email, "ADMIN");
    await fail(email, 4);
    const locked = await login(email, "nope");
    expect(locked.body).toMatchObject({ code: "LOGIN_LOCKED", retryAfter: 900 });

    // However often someone else tries, the Founder waits at most 60 minutes
    await prisma.loginThrottle.update({ where: { key: accountKey(email) }, data: { lockLevel: 30, lockedUntil: null } });
    expect((await fail(email, 5)).body.retryAfter).toBe(60 * 60);

    const log = await api().get("/api/admin/security/admin-logins").query({ email }).set("Authorization", adminAuth);
    expect(log.status).toBe(200);
    const results = log.body.attempts.map((a: { result: string }) => a.result);
    expect(results.filter((r: string) => r === "WRONG_PASSWORD")).toHaveLength(8);
    expect(results.filter((r: string) => r === "LOCKED")).toHaveLength(2);
    expect(log.body.attempts[0]).toMatchObject({ email, ip: expect.any(String) });
    expect(log.body.failedToday).toBeGreaterThanOrEqual(10);
    expect((await api().get("/api/admin/security/admin-logins").query({ result: "LOCKED", email }).set("Authorization", adminAuth)).body.total).toBe(2);
  });

  it("an unlock code emailed to the account ends the pause at once", async () => {
    const email = "founder2@test.local";
    await makeUser(email, "ADMIN");
    await fail(email, 5);
    expect((await login(email)).status).toBe(429);

    const ask = await api().post("/api/auth/unlock/request").send({ email });
    expect(ask.status).toBe(200);
    const code = lastCode(email, "UNLOCK_ACCOUNT")!;
    expect(code).toMatch(/^\d{6}$/);
    expect(sent.at(-1)!.minutes).toBe(5);

    expect((await api().post("/api/auth/unlock").send({ email, code: code === "000000" ? "111111" : "000000" })).body.error).toMatch(/4 tries left/);
    expect((await api().post("/api/auth/unlock").send({ email, code })).status).toBe(200);
    expect((await api().post("/api/auth/unlock").send({ email, code })).status).toBe(400); // used once
    expect((await login(email)).status).toBe(200);

    const log = await api().get("/api/admin/security/admin-logins").query({ email }).set("Authorization", adminAuth);
    const results = log.body.attempts.map((a: { result: string }) => a.result);
    expect(results).toEqual(expect.arrayContaining(["UNLOCK_CODE_SENT", "UNLOCKED", "SUCCESS"]));
  });

  it("unlock codes go only to paused accounts, and the answer never says which", async () => {
    await makeUser("calm@test.local");
    const calm = await api().post("/api/auth/unlock/request").send({ email: "calm@test.local" });
    const unknown = await api().post("/api/auth/unlock/request").send({ email: "ghost@test.local" });
    expect(calm.body).toEqual(unknown.body);
    expect(sent).toEqual([]);
    expect((await api().post("/api/auth/unlock").send({ email: "ghost@test.local", code: "123456" })).status).toBe(400);
  });

  it("the sign-in log is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/admin/security/admin-logins").set("Authorization", student.auth)).status).toBe(403);
  });
});

describe("forgot password by code", () => {
  it("emails a 6-digit code valid exactly 5 minutes; the answer is the same for unknown emails", async () => {
    const email = "kid5@test.local";
    const user = await makeUser(email);
    const known = await api().post("/api/auth/forgot-password").send({ email });
    const unknown = await api().post("/api/auth/forgot-password").send({ email: "ghost@test.local" });
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toMatchObject({ expiresInMinutes: 5 });
    expect(sent.map((m) => m.to)).toEqual([email]);
    const row = await prisma.authCode.findFirstOrThrow({ where: { userId: user.id, purpose: "RESET_PASSWORD" } });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(5 * 60_000 - 1000);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(5 * 60_000 + 1000);
    expect(row.codeHash).not.toContain(lastCode(email, "RESET_PASSWORD")!); // only a hash is stored
  });

  it("a new code cancels the old one; expired and wrong codes are refused", async () => {
    const email = "kid6@test.local";
    const user = await makeUser(email);
    await api().post("/api/auth/forgot-password").send({ email });
    const first = lastCode(email, "RESET_PASSWORD")!;
    // Asking again within a minute keeps the same code (no flood of emails)
    await api().post("/api/auth/forgot-password").send({ email });
    expect(sent).toHaveLength(1);

    await prisma.authCode.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
    await api().post("/api/auth/forgot-password").send({ email });
    const second = lastCode(email, "RESET_PASSWORD")!;
    expect(sent).toHaveLength(2);

    const reset = (code: string, password = "NewPassword456!") => api().post("/api/auth/reset-password").send({ email, code, password });
    if (first !== second) expect((await reset(first)).status).toBe(400); // the old code no longer works

    await prisma.authCode.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    const expired = await reset(second);
    expect(expired.status).toBe(400);
    expect(expired.body).toMatchObject({ code: "CODE_EXPIRED" });
    expect(expired.body.error).toMatch(/5 minutes/);
  });

  it("the right code sets the password, signs out every device and ends a sign-in pause", async () => {
    const email = "kid7@test.local";
    await makeUser(email);
    const session = (await login(email)).body.refreshToken;
    await fail(email, 5);
    expect((await login(email)).status).toBe(429);

    await api().post("/api/auth/forgot-password").send({ email });
    const code = lastCode(email, "RESET_PASSWORD")!;
    expect((await api().post("/api/auth/reset-password").send({ email, code, password: "short" })).status).toBe(400);
    const ok = await api().post("/api/auth/reset-password").send({ email, code, password: "NewPassword456!" });
    expect(ok.status).toBe(200);

    expect((await api().post("/api/auth/refresh").send({ refreshToken: session })).status).toBe(401);
    expect((await login(email)).status).toBe(401); // old password, and the pause is gone
    expect((await login(email, "NewPassword456!")).status).toBe(200);
    expect((await api().post("/api/auth/reset-password").send({ email, code, password: "Another789!" })).status).toBe(400); // used once
  });

  it("five wrong codes use the code up", async () => {
    const email = "kid8@test.local";
    await makeUser(email);
    await api().post("/api/auth/forgot-password").send({ email });
    const code = lastCode(email, "RESET_PASSWORD")!;
    const wrong = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 4; i++) await api().post("/api/auth/reset-password").send({ email, code: wrong, password: "NewPassword456!" });
    const fifth = await api().post("/api/auth/reset-password").send({ email, code: wrong, password: "NewPassword456!" });
    expect(fifth.body.code).toBe("CODE_LOCKED");
    expect((await api().post("/api/auth/reset-password").send({ email, code, password: "NewPassword456!" })).body.code).toBe("CODE_LOCKED");
  });

  it("an old emailed link is refused", async () => {
    expect((await api().post("/api/auth/reset-password").send({ token: "a".repeat(64), password: "NewPassword456!" })).status).toBe(400);
  });
});
