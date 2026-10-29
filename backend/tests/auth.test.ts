import { describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { hashCode, MAX_ATTEMPTS } from "../src/services/emailVerification.service";
import { api, createUserAndLogin } from "./helpers";

// Tests can't read the email, so they swap the stored code for a known one.
const useKnownCode = async (email: string, code = "123456") => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.emailVerificationCode.updateMany({ where: { userId: user.id }, data: { codeHash: hashCode(user.id, code) } });
  return user;
};
const verifyWithKnownCode = async (email: string) => {
  await useKnownCode(email);
  const res = await api().post("/api/auth/verify-email").send({ email, code: "123456" });
  expect(res.status).toBe(200);
  return res;
};
const signUp = (email: string, extra: Record<string, unknown> = {}) =>
  api().post("/api/auth/register").send({ email, password: "Password123!", name: "Asha", phone: "9876543210", ...extra });

describe("auth & roles", () => {
  it("health check", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
  });

  it("registers a new user as STUDENT and returns the role on login and /me", async () => {
    const email = `new-${Date.now()}@test.local`;
    const reg = await api().post("/api/auth/register").send({ email, password: "Password123!", name: "New", phone: "98765 43210" });
    expect(reg.status).toBe(201);
    expect(reg.body.needsVerification).toBe(true);
    expect(reg.body.accessToken).toBeUndefined();

    await verifyWithKnownCode(email);

    const login = await api().post("/api/auth/login").send({ email, password: "Password123!" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("STUDENT");

    const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.body.user.role).toBe("STUDENT");
    expect(me.body.user.phone).toBe("9876543210");
  });

  it("admin routes: 401 without a token, 403 for a student, 200 for an admin", async () => {
    expect((await api().get("/api/admin/settings")).status).toBe(401);

    const student = await createUserAndLogin("STUDENT");
    const denied = await api().get("/api/admin/settings").set("Authorization", student.auth);
    expect(denied.status).toBe(403);

    const admin = await createUserAndLogin("ADMIN");
    const ok = await api().get("/api/admin/settings").set("Authorization", admin.auth);
    expect(ok.status).toBe(200);
  });
});

describe("sign-up email code", () => {
  it("needs name, a valid Indian mobile number and stores it as 10 digits", async () => {
    expect((await signUp("p1@test.local", { phone: "12345" })).status).toBe(400);
    expect((await signUp("p2@test.local", { phone: "5876543210" })).status).toBe(400);
    expect((await signUp("p3@test.local", { name: "" })).status).toBe(400);
    expect((await signUp("p4@test.local", { phone: undefined })).status).toBe(400);
    expect((await signUp("p5@test.local", { phone: "+91 98765-43210" })).status).toBe(201);
    expect((await prisma.user.findUnique({ where: { email: "p5@test.local" } }))?.phone).toBe("9876543210");
    expect((await signUp("p6@test.local", { phone: "09876543210" })).status).toBe(201);
  });

  it("logs in only after the right code; login before that asks for the code", async () => {
    const email = "otp1@test.local";
    expect((await signUp(email)).status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBe(false);
    const stored = await prisma.emailVerificationCode.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/); // only a hash is kept

    const early = await api().post("/api/auth/login").send({ email, password: "Password123!" });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(early.body.accessToken).toBeUndefined();

    const res = await verifyWithKnownCode(email);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);
    expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(0);

    expect((await api().post("/api/auth/login").send({ email, password: "Password123!" })).status).toBe(200);
    // Verified accounts can't be signed up again
    expect((await signUp(email)).status).toBe(400);
    expect((await api().post("/api/auth/verify-email").send({ email, code: "123456" })).body.code).toBe("ALREADY_VERIFIED");
  });

  it("allows a few wrong guesses, then locks the code until a new one is sent", async () => {
    const email = "otp2@test.local";
    await signUp(email);
    await useKnownCode(email);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const wrong = await api().post("/api/auth/verify-email").send({ email, code: "000000" });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe("CODE_WRONG");
      expect(wrong.body.error).toContain(`${MAX_ATTEMPTS - i}`);
    }
    expect((await api().post("/api/auth/verify-email").send({ email, code: "000000" })).body.code).toBe("CODE_LOCKED");
    // Even the right code is refused now
    expect((await api().post("/api/auth/verify-email").send({ email, code: "123456" })).body.code).toBe("CODE_LOCKED");

    // A new code (after the resend wait) works
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.emailVerificationCode.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 61_000) } });
    const resend = await api().post("/api/auth/resend-code").send({ email });
    expect(resend.status).toBe(200);
    expect(resend.body.retryAfter).toBe(60);
    await verifyWithKnownCode(email);
  });

  it("expired codes are refused", async () => {
    const email = "otp3@test.local";
    await signUp(email);
    const user = await useKnownCode(email);
    await prisma.emailVerificationCode.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await api().post("/api/auth/verify-email").send({ email, code: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CODE_EXPIRED");
  });

  it("resend waits a minute between codes and doesn't reveal unknown emails", async () => {
    const email = "otp4@test.local";
    await signUp(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const first = await prisma.emailVerificationCode.findFirstOrThrow({ where: { userId: user.id } });

    const soon = await api().post("/api/auth/resend-code").send({ email });
    expect(soon.status).toBe(200);
    expect(soon.body.retryAfter).toBeGreaterThan(0);
    expect(soon.body.retryAfter).toBeLessThanOrEqual(60);
    // Same code still in place
    expect((await prisma.emailVerificationCode.findFirstOrThrow({ where: { userId: user.id } })).id).toBe(first.id);

    const unknown = await api().post("/api/auth/resend-code").send({ email: "nobody@test.local" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.message).toBe(soon.body.message);
  });

  it("signing up again before verifying replaces the details", async () => {
    const email = "otp5@test.local";
    await signUp(email, { name: "Old" });
    expect((await signUp(email, { name: "New Name", phone: "9123456780", password: "Another123!" })).status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.name).toBe("New Name");
    expect(user.phone).toBe("9123456780");
    await verifyWithKnownCode(email);
    expect((await api().post("/api/auth/login").send({ email, password: "Another123!" })).status).toBe(200);
  });

  it("existing accounts and admins count as verified", async () => {
    const admin = await createUserAndLogin("ADMIN");
    expect(admin.auth).toBeTruthy();
  });
});
