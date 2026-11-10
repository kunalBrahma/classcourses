import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { applyCoinChange } from "../src/services/coin.service";
import { api, createUserAndLogin, signupProfile } from "./helpers";

// User management, helper admins and the activity log (client requirements
// of 6 Nov 2026).

const PASSWORD = "Password123!";
let founder: { auth: string; email: string; id: string };

const makeStudent = async (email: string) => {
  const user = await prisma.user.create({ data: { email, name: "Riya", password: await hashPassword(PASSWORD) } });
  return user.id;
};
const login = (email: string, password = PASSWORD) => api().post("/api/auth/login").send({ email, password });
const as = (auth: string) => ({
  get: (p: string) => api().get(p).set("Authorization", auth),
  post: (p: string, b: object = {}) => api().post(p).set("Authorization", auth).send(b),
  patch: (p: string, b: object = {}) => api().patch(p).set("Authorization", auth).send(b),
  put: (p: string, b: object = {}) => api().put(p).set("Authorization", auth).send(b),
  delete: (p: string, b: object = {}) => api().delete(p).set("Authorization", auth).send(b),
});
// The log is written just after the response goes out: wait a moment for it.
const settle = () => new Promise((r) => setTimeout(r, 150));
const latestActivity = async (action: string) => {
  for (let i = 0; i < 10; i++) {
    const row = await prisma.adminActivity.findFirst({ where: { action }, orderBy: { createdAt: "desc" } });
    if (row) return row;
    await settle();
  }
  return null;
};

beforeAll(async () => {
  const f = await createUserAndLogin("ADMIN"); // admins default to Super Admin
  founder = { ...f, id: (await prisma.user.findUniqueOrThrow({ where: { email: f.email } })).id };
});

describe("suspend", () => {
  it("needs a reason; stops sign-in and every open session at once, with a clear message", async () => {
    const id = await makeStudent("s1@test.local");
    const session = (await login("s1@test.local")).body;
    const auth = `Bearer ${session.accessToken}`;
    expect((await api().get("/api/auth/me").set("Authorization", auth)).status).toBe(200);

    expect((await as(founder.auth).post(`/api/admin/users/${id}/suspend`, { until: null, reason: "x" })).status).toBe(400);
    const res = await as(founder.auth).post(`/api/admin/users/${id}/suspend`, { until: "2099-01-31", reason: "Abusive Helpline messages" });
    expect(res.status).toBe(200);

    // The open session stops working straight away (not at token expiry), and
    // says why, so the site can show the student the reason
    const me = await api().get("/api/auth/me").set("Authorization", auth);
    expect(me.status).toBe(403);
    expect(me.body).toMatchObject({ code: "ACCOUNT_SUSPENDED" });
    expect((await api().post("/api/auth/refresh").send({ refreshToken: session.refreshToken })).body.code).toBe("ACCOUNT_SUSPENDED");

    const blocked = await login("s1@test.local");
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ code: "ACCOUNT_SUSPENDED", suspendedUntil: expect.stringContaining("2099-01-31") });
    expect(blocked.body.error).toMatch(/suspended until 31 January 2099\. Reason: Abusive Helpline messages/);

    const entry = await latestActivity("user.suspend");
    expect(entry).toMatchObject({ actorId: founder.id, targetId: id, reason: "Abusive Helpline messages", statusCode: 200 });

    expect((await as(founder.auth).post(`/api/admin/users/${id}/unsuspend`)).status).toBe(200);
    expect((await login("s1@test.local")).status).toBe(200);
    expect((await api().get("/api/auth/me").set("Authorization", auth)).status).toBe(200); // the old session carries on
  });

  it("a suspension past its date lets the student back in by itself", async () => {
    const id = await makeStudent("s2@test.local");
    await as(founder.auth).post(`/api/admin/users/${id}/suspend`, { until: "2099-01-01", reason: "Short break for review" });
    await prisma.user.update({ where: { id }, data: { suspendedUntil: new Date(Date.now() - 1000) } });
    expect((await login("s2@test.local")).status).toBe(200);
  });

  it("an until-lifted suspension says so; admins and your own account can't be suspended here", async () => {
    const id = await makeStudent("s3@test.local");
    await as(founder.auth).post(`/api/admin/users/${id}/suspend`, { until: null, reason: "Checking a payment dispute" });
    expect((await login("s3@test.local")).body.error).toMatch(/until further notice/);
    expect((await as(founder.auth).post(`/api/admin/users/${founder.id}/suspend`, { until: null, reason: "Trying on myself" })).status).toBe(400);
    expect((await as(founder.auth).post(`/api/admin/users/${id}/suspend`, { until: "2001-01-01", reason: "A date in the past" })).status).toBe(400);
  });
});

describe("block", () => {
  it("stops sign-in for good and the email can't sign up again; unblock reverses both", async () => {
    const id = await makeStudent("b1@test.local");
    expect((await as(founder.auth).post(`/api/admin/users/${id}/block`, { reason: "Fraud: fake referrals" })).status).toBe(200);
    const res = await login("b1@test.local");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "ACCOUNT_BLOCKED" });
    expect(res.body.error).toMatch(/blocked\. Reason: Fraud: fake referrals\. If you think/);

    const again = await api().post("/api/auth/register").send({ email: "B1@test.local".toLowerCase(), password: PASSWORD, name: "Again", ...(await signupProfile()) });
    expect(again.status).toBe(403);
    expect(again.body.code).toBe("EMAIL_BLOCKED");

    expect((await as(founder.auth).get(`/api/admin/users/${id}/account`)).body.account).toMatchObject({ status: "BLOCKED", emailBlocked: true });
    expect((await as(founder.auth).post(`/api/admin/users/${id}/unblock`)).status).toBe(200);
    expect((await login("b1@test.local")).status).toBe(200);
    expect(await prisma.blockedEmail.count({ where: { email: "b1@test.local" } })).toBe(0);
  });
});

describe("sign out everywhere, edit details, export", () => {
  it("sign out everywhere ends every session", async () => {
    const id = await makeStudent("o1@test.local");
    const a = (await login("o1@test.local")).body;
    const b = (await login("o1@test.local")).body;
    expect((await as(founder.auth).post(`/api/admin/users/${id}/sign-out`)).status).toBe(200);
    expect((await api().get("/api/auth/me").set("Authorization", `Bearer ${a.accessToken}`)).status).toBe(401);
    expect((await api().post("/api/auth/refresh").send({ refreshToken: b.refreshToken })).status).toBe(401);
    expect((await login("o1@test.local")).status).toBe(200); // the password still works
  });

  it("editing details needs a reason and keeps before and after", async () => {
    const id = await makeStudent("e1@test.local");
    const profile = await signupProfile();
    expect((await as(founder.auth).patch(`/api/admin/users/${id}/details`, { name: "Riya Das" })).status).toBe(400);
    const res = await as(founder.auth).patch(`/api/admin/users/${id}/details`, { name: "Riya Das", districtId: profile.districtId, dateOfBirth: "2012-03-04", reason: "Parent asked by email" });
    expect(res.status).toBe(200);
    const entry = await latestActivity("user.edit_details");
    expect(entry?.reason).toBe("Parent asked by email");
    expect(entry?.details).toMatchObject({ before: { name: "Riya", dateOfBirth: null }, after: { name: "Riya Das", dateOfBirth: "2012-03-04" } });
  });

  it("exports everything stored about the student as a readable file, and logs it", async () => {
    const id = await makeStudent("x1@test.local");
    await prisma.$transaction((tx) => applyCoinChange(tx, { userId: id, delta: 10, reason: "ADMIN_ADJUST", note: "Welcome" }));
    const res = await as(founder.auth).get(`/api/admin/users/${id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="class-course-data-/);
    const data = JSON.parse(res.text);
    expect(data.account).toMatchObject({ email: "x1@test.local", name: "Riya" });
    expect(data.coins).toHaveLength(1);
    expect(data.account.password).toBeUndefined();
    expect(await latestActivity("user.export")).toMatchObject({ targetId: id, method: "GET" });
  });
});

describe("erase (DPDP)", () => {
  it("erases personal data, keeps payment records anonymously, and needs the email typed to confirm", async () => {
    const id = await makeStudent("d1@test.local");
    await prisma.$transaction((tx) => applyCoinChange(tx, { userId: id, delta: 5, reason: "ADMIN_ADJUST", note: "x" }));
    const note = await prisma.note.create({ data: { title: "Kept note", pricePaise: 4900 } });
    await prisma.order.create({ data: { userId: id, noteId: note.id, listPricePaise: 4900, amountPaise: 4900, status: "PAID" } });

    expect((await as(founder.auth).delete(`/api/admin/users/${id}`, { reason: "Parent asked to delete", confirmEmail: "wrong@test.local" })).status).toBe(400);
    const res = await as(founder.auth).delete(`/api/admin/users/${id}`, { reason: "Parent asked to delete the account", confirmEmail: "d1@test.local" });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user).toMatchObject({ status: "DELETED", name: null, phone: null, password: null, coins: 0 });
    expect(user.email).toMatch(/@deleted\.invalid$/);
    expect(await prisma.coinTransaction.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.order.count({ where: { userId: id } })).toBe(1); // payment records kept
    expect((await login("d1@test.local")).status).toBe(401);
    // Hidden from the user list unless asked for
    expect((await as(founder.auth).get("/api/admin/users?search=deleted.invalid")).body.users).toEqual([]);
    expect((await as(founder.auth).get("/api/admin/users?status=DELETED")).body.users.map((u: { id: string }) => u.id)).toContain(id);
    expect((await latestActivity("user.erase"))?.summary).toMatch(/was d1@test\.local/);
    // The same email may sign up again afterwards (it wasn't blocked)
    expect((await api().post("/api/auth/register").send({ email: "d1@test.local", password: PASSWORD, name: "New", ...(await signupProfile()) })).status).toBe(201);
  });
});

describe("helper admins", () => {
  it("get only the sections ticked for them; the Super Admin's areas stay closed", async () => {
    const added = await as(founder.auth).post("/api/admin/team", { email: "helper1@test.local", name: "Content Helper", password: "HelperPassword123!", permissions: ["content"] });
    expect(added.status).toBe(201);
    expect(added.body.admin).toMatchObject({ adminLevel: "HELPER", adminPermissions: ["content"] });
    const helper = `Bearer ${(await login("helper1@test.local", "HelperPassword123!")).body.accessToken}`;

    expect((await api().get("/api/auth/me").set("Authorization", helper)).body.user).toMatchObject({ role: "ADMIN", adminLevel: "HELPER", adminPermissions: ["content"] });
    expect((await as(helper).get("/api/admin/mediums")).status).toBe(200);
    expect((await as(helper).get("/api/admin/stats")).status).toBe(200); // dashboard: every admin
    const noUsers = await as(helper).get("/api/admin/users");
    expect(noUsers.status).toBe(403);
    expect(noUsers.body.code).toBe("ADMIN_NO_ACCESS");
    for (const path of ["/api/admin/settings", "/api/admin/team", "/api/admin/activity", "/api/admin/security/admin-logins"]) {
      expect((await as(helper).get(path)).status).toBe(403);
    }

    // The Super Admin adds Students: now users work, but blocking stays Super-only
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: "helper1@test.local" } })).id;
    expect((await as(founder.auth).patch(`/api/admin/team/${id}`, { permissions: ["content", "users"] })).status).toBe(200);
    expect((await as(helper).get("/api/admin/users")).status).toBe(200);
    const student = await makeStudent("h-target@test.local");
    expect((await as(helper).post(`/api/admin/users/${student}/sign-out`)).status).toBe(200);
    expect((await as(helper).post(`/api/admin/users/${student}/block`, { reason: "Helper trying to block" })).status).toBe(403);
    expect((await as(helper).delete(`/api/admin/users/${student}`, { reason: "Helper trying to delete", confirmEmail: "h-target@test.local" })).status).toBe(403);
    expect((await as(helper).patch(`/api/admin/users/${student}`, { role: "ADMIN" })).status).toBe(403);
    // A helper can't make helpers or change themselves
    expect((await as(helper).post("/api/admin/team", { email: "x@test.local", password: "LongEnoughPassword1", permissions: ["content"] })).status).toBe(403);

    // Removing a helper: back to a student, signed out at once
    expect((await as(founder.auth).delete(`/api/admin/team/${id}`)).status).toBe(200);
    expect((await api().get("/api/auth/me").set("Authorization", helper)).status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe("STUDENT");
  });

  it("an existing account can be made a helper; Super Admins can't be changed from the panel", async () => {
    await makeStudent("existing@test.local");
    const res = await as(founder.auth).post("/api/admin/team", { email: "existing@test.local", permissions: ["support"] });
    expect(res.status).toBe(201);
    expect((await as(founder.auth).post("/api/admin/team", { email: "brand-new@test.local", permissions: ["support"] })).body.error).toMatch(/starting password/);
    expect((await as(founder.auth).post("/api/admin/team", { email: "x2@test.local", password: "LongEnoughPassword1", permissions: [] })).status).toBe(400);

    const other = await createUserAndLogin("ADMIN"); // another Super Admin
    const otherId = (await prisma.user.findUniqueOrThrow({ where: { email: other.email } })).id;
    expect((await as(founder.auth).patch(`/api/admin/team/${otherId}`, { permissions: ["content"] })).status).toBe(400);
    expect((await as(founder.auth).delete(`/api/admin/team/${founder.id}`)).status).toBe(400);
    const team = await as(founder.auth).get("/api/admin/team");
    expect(team.body.permissions.map((p: { key: string }) => p.key)).toEqual(["content", "quiz_reports", "notes_orders", "users", "support"]);
  });

  it("promoting someone from the user page makes a helper with no sections; the last Super Admin stays", async () => {
    const id = await makeStudent("promo@test.local");
    expect((await as(founder.auth).patch(`/api/admin/users/${id}`, { role: "ADMIN" })).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({ role: "ADMIN", adminLevel: "HELPER", adminPermissions: [] });
  });
});

describe("activity log", () => {
  it("records every change with who, what and why, never the secrets; only the Super Admin reads it", async () => {
    await as(founder.auth).post("/api/admin/settings/cashfree/test", { appId: "SOME_APP", secretKey: "super-secret-value-123", environment: "sandbox" });
    await settle();
    const entry = await prisma.adminActivity.findFirst({ where: { path: "/api/admin/settings/cashfree/test" }, orderBy: { createdAt: "desc" } });
    expect(entry).toMatchObject({ actorEmail: founder.email, method: "POST" });
    expect(JSON.stringify(entry?.details)).not.toContain("super-secret-value-123");
    expect(entry?.details).toMatchObject({ request: { appId: "SOME_APP", secretKey: "[hidden]" } });

    // A plain content change is recorded too, by its route
    await as(founder.auth).post("/api/admin/districts", { name: "Logged District" });
    await settle();
    expect(await prisma.adminActivity.findFirst({ where: { action: "POST /districts" } })).not.toBeNull();

    const list = await as(founder.auth).get("/api/admin/activity?q=user.suspend");
    expect(list.status).toBe(200);
    expect(list.body.entries.length).toBeGreaterThan(0);
    expect(list.body.entries.every((e: { action: string }) => e.action === "user.suspend")).toBe(true);
    // Reading isn't logged (only changes and exports)
    await settle();
    const before = await prisma.adminActivity.count();
    await as(founder.auth).get("/api/admin/users");
    await settle();
    expect(await prisma.adminActivity.count()).toBe(before);
  });
});
