import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../src/config/prisma";
import * as mailer from "../src/utils/mailer";
import { hashPassword } from "../src/utils/password";
import { api, createUserAndLogin } from "./helpers";

// Admin → Settings → My account: an admin changes their own password and
// sign-in email (handover: the client replaces the starting login).

const PASSWORD = "Password123!";
let codes: { to: string; code: string }[] = [];
let notices: { to: string; newEmail: string }[] = [];
const lastCode = (to: string) => [...codes].reverse().find((c) => c.to === to)?.code;

beforeEach(async () => {
  codes = [];
  notices = [];
  vi.spyOn(mailer, "sendEmailChangeCode").mockImplementation(async (to, code) => {
    codes.push({ to, code });
  });
  vi.spyOn(mailer, "sendEmailChangedNotice").mockImplementation(async (to, newEmail) => {
    notices.push({ to, newEmail });
  });
  await prisma.loginThrottle.deleteMany();
});
afterEach(() => vi.restoreAllMocks());

const signIn = (email: string, password = PASSWORD) => api().post("/api/auth/login").send({ email, password });

describe("change password", () => {
  it("refuses a wrong current password and counts it as a failed sign-in", async () => {
    const admin = await createUserAndLogin("ADMIN");
    const res = await api().post("/api/admin/account/password").set("Authorization", admin.auth).send({ currentPassword: "nope-nope", newPassword: "BrandNewPass1!" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("WRONG_PASSWORD");
    expect(await prisma.loginThrottle.count({ where: { key: `account:${admin.email}` } })).toBe(1);
    expect((await signIn(admin.email)).status).toBe(200); // unchanged
  });

  it("rejects a short or unchanged new password", async () => {
    const admin = await createUserAndLogin("ADMIN");
    const short = await api().post("/api/admin/account/password").set("Authorization", admin.auth).send({ currentPassword: PASSWORD, newPassword: "short" });
    expect(short.status).toBe(400);
    const same = await api().post("/api/admin/account/password").set("Authorization", admin.auth).send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);
  });

  it("changes it, signs out other devices and keeps this browser signed in", async () => {
    const admin = await createUserAndLogin("ADMIN");
    const other = await signIn(admin.email); // a second device
    const res = await api().post("/api/admin/account/password").set("Authorization", admin.auth).send({ currentPassword: PASSWORD, newPassword: "BrandNewPass1!" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    // Old tokens stop working; the new ones work
    expect((await api().get("/api/admin/account").set("Authorization", admin.auth)).status).toBe(401);
    expect((await api().post("/api/auth/refresh").send({ refreshToken: other.body.refreshToken })).status).toBe(401);
    expect((await api().get("/api/admin/account").set("Authorization", `Bearer ${res.body.accessToken}`)).status).toBe(200);

    expect((await signIn(admin.email)).status).toBe(401);
    expect((await signIn(admin.email, "BrandNewPass1!")).status).toBe(200);

    // In the activity log, without the passwords
    const log = await prisma.adminActivity.findFirstOrThrow({ where: { action: "account.password" } });
    expect(JSON.stringify(log)).not.toContain("BrandNewPass1!");
  });
});

describe("change sign-in email", () => {
  it("needs the password, then the code sent to the new address", async () => {
    const admin = await createUserAndLogin("ADMIN");
    const send = (body: object) => api().post("/api/admin/account/email").set("Authorization", admin.auth).send(body);

    expect((await send({ newEmail: "founder@school.test", password: "wrong" })).status).toBe(400);
    expect(codes).toHaveLength(0);

    const res = await send({ newEmail: "  Founder@School.test ", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ newEmail: "founder@school.test", expiresInMinutes: 5 });
    const code = lastCode("founder@school.test")!;
    expect(code).toMatch(/^\d{6}$/);

    // Nothing changes before the code is entered
    expect((await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })).email).toBe(admin.email);

    const wrong = code === "000000" ? "111111" : "000000";
    expect((await api().post("/api/admin/account/email/confirm").set("Authorization", admin.auth).send({ code: wrong })).status).toBe(400);
    const ok = await api().post("/api/admin/account/email/confirm").set("Authorization", admin.auth).send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe("founder@school.test");
    expect(notices).toEqual([{ to: admin.email, newEmail: "founder@school.test" }]);

    // The new email signs in; the old one doesn't
    expect((await signIn("founder@school.test")).status).toBe(200);
    expect((await signIn(admin.email)).status).toBe(401);

    // The code works only once
    expect((await api().post("/api/admin/account/email/confirm").set("Authorization", admin.auth).send({ code })).status).toBe(400);
  });

  it("refuses an email another account uses, or the same email", async () => {
    const admin = await createUserAndLogin("ADMIN");
    await prisma.user.create({ data: { email: "taken@test.local", password: await hashPassword(PASSWORD) } });
    const taken = await api().post("/api/admin/account/email").set("Authorization", admin.auth).send({ newEmail: "TAKEN@test.local", password: PASSWORD });
    expect(taken.status).toBe(409);
    const same = await api().post("/api/admin/account/email").set("Authorization", admin.auth).send({ newEmail: admin.email, password: PASSWORD });
    expect(same.status).toBe(400);
    expect(codes).toHaveLength(0);
  });

  it("a new address replaces the earlier request", async () => {
    const admin = await createUserAndLogin("ADMIN");
    const send = (newEmail: string) => api().post("/api/admin/account/email").set("Authorization", admin.auth).send({ newEmail, password: PASSWORD });
    expect((await send("typo@school.tset")).status).toBe(200);
    expect((await send("right@school.test")).status).toBe(200);
    const typoCode = lastCode("typo@school.tset")!;
    const rightCode = lastCode("right@school.test")!;
    if (typoCode !== rightCode) {
      expect((await api().post("/api/admin/account/email/confirm").set("Authorization", admin.auth).send({ code: typoCode })).status).toBe(400);
    }
    const ok = await api().post("/api/admin/account/email/confirm").set("Authorization", admin.auth).send({ code: rightCode });
    expect(ok.body.email).toBe("right@school.test");
  });
});

describe("access", () => {
  it("every admin (helpers too) can use it; students can't", async () => {
    const helper = await createUserAndLogin("ADMIN");
    await prisma.user.update({ where: { email: helper.email }, data: { adminLevel: "HELPER", adminPermissions: ["support"] } });
    const res = await api().get("/api/admin/account").set("Authorization", helper.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: helper.email, hasPassword: true });
    expect(res.body.password).toBeUndefined();

    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/admin/account").set("Authorization", student.auth)).status).toBe(403);
  });
});
