import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { hashCode } from "../src/services/emailVerification.service";
import { emailHash } from "../src/services/referral.service";
import { api, createUserAndLogin, signupProfile } from "./helpers";

// Refer and Earn (client requirements of 6 Nov 2026). Every test request comes
// from 127.0.0.1, so network checks are steered by editing rows.

let founder: string;
let n = 0;

const as = (auth: string) => ({
  get: (p: string, headers: Record<string, string> = {}) => api().get(p).set("Authorization", auth).set(headers),
  post: (p: string, b: object = {}) => api().post(p).set("Authorization", auth).send(b),
  put: (p: string, b: object = {}) => api().put(p).set("Authorization", auth).send(b),
  delete: (p: string) => api().delete(p).set("Authorization", auth),
});

const setReferral = (body: object) => as(founder).put("/api/admin/settings/referral", body);

/** An inviter with a code; their "own" network is set to somewhere else. */
const inviter = async () => {
  const s = await createUserAndLogin();
  const me = (await as(s.auth).get("/api/users/me/referrals", { "X-Device-Id": `inviter-device-${++n}` })).body;
  const id = (await prisma.user.findUniqueOrThrow({ where: { email: s.email } })).id;
  await prisma.user.update({ where: { id }, data: { referralSeenIp: "10.9.9.9" } });
  return { ...s, id, code: me.code as string };
};

/** A friend signs up through the link and enters the emailed code. */
const friendJoins = async (code: string, opts: { email?: string; deviceId?: string; adult?: boolean; verify?: boolean } = {}) => {
  const email = opts.email ?? `friend${++n}-${Date.now()}@test.local`;
  const profile = await signupProfile();
  const reg = await api()
    .post("/api/auth/register")
    .send({ email, password: "Password123!", name: "Mina Bora", ...profile, ...(opts.adult === false ? {} : { dateOfBirth: "2000-02-02" }), referralCode: code, deviceId: opts.deviceId ?? `friend-device-${n}` });
  expect(reg.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  if (opts.verify !== false) {
    await prisma.emailVerificationCode.updateMany({ where: { userId: user.id }, data: { codeHash: hashCode(user.id, "123456") } });
    expect((await api().post("/api/auth/verify-email").send({ email, code: "123456" })).status).toBe(200);
  }
  return { id: user.id, email };
};
const referralOf = (referredId: string) => prisma.referral.findUniqueOrThrow({ where: { referredId } });
const coins = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).coins;

beforeAll(async () => {
  founder = (await createUserAndLogin("ADMIN")).auth;
});
beforeEach(async () => {
  await setReferral({ enabled: true, coinsPerReferral: 20, friendCoins: 5, dailyLimit: 5, sameNetworkLimit: 50 });
});

describe("refer and earn", () => {
  it("is off until the Founder switches it on; codes are not handed out meanwhile", async () => {
    await as(founder).delete("/api/admin/settings/referral");
    const s = await createUserAndLogin();
    expect((await as(s.auth).get("/api/users/me/referrals")).body).toMatchObject({ enabled: false, code: null, coinsPerReferral: 0 });
    expect((await api().get("/api/settings/public")).body.settings.referral).toMatchObject({ enabled: false });
  });

  it("the friend verifies their email → the inviter gets coins (90-day lot), the friend welcome coins", async () => {
    const a = await inviter();
    expect(a.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await api().get(`/api/referrals/invite/${a.code.toLowerCase()}`)).body).toEqual({ valid: true, inviterFirstName: "STUDENT", friendCoins: 5 });
    expect((await api().get("/api/referrals/invite/NOPE1234")).body).toEqual({ valid: false });

    const f = await friendJoins(a.code, { verify: false });
    expect((await referralOf(f.id)).status).toBe("PENDING");
    expect(await coins(a.id)).toBe(0); // nothing for an unverified sign-up

    await prisma.emailVerificationCode.updateMany({ where: { userId: f.id }, data: { codeHash: hashCode(f.id, "123456") } });
    await api().post("/api/auth/verify-email").send({ email: f.email, code: "123456" });
    expect(await referralOf(f.id)).toMatchObject({ status: "REWARDED", coinsReferrer: 20, coinsFriend: 5 });
    expect(await coins(a.id)).toBe(20);
    expect(await coins(f.id)).toBe(5);
    const lot = await prisma.coinLot.findFirstOrThrow({ where: { userId: a.id } });
    expect(Math.round((lot.expiresAt.getTime() - lot.creditedAt.getTime()) / 864e5)).toBe(90);

    const page = (await as(a.auth).get("/api/users/me/referrals")).body;
    expect(page.totals).toEqual({ joined: 1, rewarded: 1, coinsEarned: 20, waiting: 0 });
    expect(page.history[0]).toMatchObject({ friend: "Mina", status: "REWARDED", coins: 20 });
    expect(JSON.stringify(page)).not.toContain(f.email);
    const inbox = (await as(a.auth).get("/api/users/me/notifications")).body.items;
    expect(inbox[0].title).toBe("20 coins for inviting a friend");
  });

  it("an email earns a reward once (Gmail dots and +tags count as the same), even after erasure", async () => {
    expect(emailHash("Mina.Bora+x@googlemail.com")).toBe(emailHash("minabora@gmail.com"));
    const a = await inviter();
    const first = await friendJoins(a.code, { email: `once${n}@test.local` });
    expect((await referralOf(first.id)).status).toBe("REWARDED");
    await api().delete(`/api/admin/users/${first.id}`).set("Authorization", founder).send({ reason: "Asked to delete", confirmEmail: first.email });
    const again = await friendJoins(a.code, { email: first.email.replace("@", "+2@") });
    expect(await referralOf(again.id)).toMatchObject({ status: "REJECTED", reason: "This email has already earned a referral reward" });
    expect(await coins(a.id)).toBe(20);
  });

  it("suspicious sign-ups wait for the Founder: own device, own network, many from one network, daily limit", async () => {
    const a = await inviter();
    const own = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    const sameDevice = await friendJoins(a.code, { deviceId: own.referralSeenDevice! });
    expect(await referralOf(sameDevice.id)).toMatchObject({ status: "HELD", reason: "Signed up on the inviter's own device" });

    await prisma.user.update({ where: { id: a.id }, data: { referralSeenIp: "127.0.0.1" } });
    const sameNet = await friendJoins(a.code);
    expect((await referralOf(sameNet.id)).reason).toBe("Signed up from the inviter's own network");

    const b = await inviter();
    await setReferral({ sameNetworkLimit: 2, dailyLimit: 1 });
    const one = await friendJoins(b.code);
    expect((await referralOf(one.id)).status).toBe("REWARDED");
    const two = await friendJoins(b.code);
    expect((await referralOf(two.id)).reason).toBe("Over the daily limit of 1 rewards");
    const three = await friendJoins(b.code);
    expect((await referralOf(three.id)).reason).toBe("3 sign-ups for this inviter from one network or device");
    expect(await coins(b.id)).toBe(20);
  });

  it("no self-referral, no referring an existing account, codes from blocked inviters don't count", async () => {
    const a = await inviter();
    // An old account can't be attached to a code by signing in with Google later
    const old = await createUserAndLogin();
    const oldId = (await prisma.user.findUniqueOrThrow({ where: { email: old.email } })).id;
    await prisma.user.update({ where: { id: oldId }, data: { createdAt: new Date(Date.now() - 864e5) } });
    const { recordReferral } = await import("../src/services/referral.service");
    await recordReferral(oldId, { code: a.code, ip: "1.2.3.4" });
    await recordReferral(a.id, { code: a.code, ip: "1.2.3.4" });
    expect(await prisma.referral.count({ where: { referredId: { in: [oldId, a.id] } } })).toBe(0);

    await as(founder).post(`/api/admin/users/${a.id}/block`, { reason: "Fake accounts" });
    expect((await api().get(`/api/referrals/invite/${a.code}`)).body.valid).toBe(false);
    const f = await friendJoins(a.code);
    expect(await prisma.referral.count({ where: { referredId: f.id } })).toBe(0);
  });

  it("an inviter under 18 without a parent's permission: held; a minor friend gets no welcome coins", async () => {
    const kidInviter = await createUserAndLogin("STUDENT", { dateOfBirth: new Date("2014-01-01") });
    const code = (await as(kidInviter.auth).get("/api/users/me/referrals")).body.code;
    await prisma.user.update({ where: { email: kidInviter.email }, data: { referralSeenIp: "10.1.1.1" } });
    const f = await friendJoins(code);
    expect((await referralOf(f.id)).status).toBe("HELD");

    const a = await inviter();
    const minor = await friendJoins(a.code, { adult: false });
    expect(await referralOf(minor.id)).toMatchObject({ status: "REWARDED", coinsReferrer: 20, coinsFriend: 0 });
  });

  it("the Founder approves, rejects and reverses (taking back what's left), with the activity log", async () => {
    const a = await inviter();
    await setReferral({ dailyLimit: 1 });
    const paid = await friendJoins(a.code);
    const held = await friendJoins(a.code);
    const other = await friendJoins(a.code);
    const heldRef = await referralOf(held.id);
    expect(heldRef.status).toBe("HELD");

    const list = (await as(founder).get(`/api/admin/referrals?status=HELD&userId=${a.id}`)).body;
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({ referrer: { id: a.id }, sameNetwork: expect.any(Number) });
    expect((await as(founder).post(`/api/admin/referrals/${heldRef.id}/approve`, { note: "Checked: real classmate" })).status).toBe(200);
    expect((await as(founder).post(`/api/admin/referrals/${heldRef.id}/approve`, { note: "Again" })).status).toBe(409);
    expect(await coins(a.id)).toBe(40);

    const otherRef = await referralOf(other.id);
    expect((await as(founder).post(`/api/admin/referrals/${otherRef.id}/reject`, { note: "Same family, fake" })).status).toBe(200);
    expect((await referralOf(other.id)).status).toBe("REJECTED");

    // The inviter already spent 30 of 40 coins: only what's left can come back
    await prisma.$transaction(async (tx) => (await import("../src/services/coin.service")).applyCoinChange(tx, { userId: a.id, delta: -30, reason: "ADMIN_ADJUST", note: "spent" }));
    const paidRef = await referralOf(paid.id);
    const reversed = await as(founder).post(`/api/admin/referrals/${paidRef.id}/reverse`, { note: "Fake account found" });
    expect(reversed.body).toMatchObject({ taken: { referrer: 10, friend: 5 }, shortfall: { referrer: 10, friend: 0 } });
    expect(await coins(a.id)).toBe(0);
    expect((await referralOf(paid.id)).status).toBe("REVERSED");
    const row = await prisma.coinTransaction.findFirstOrThrow({ where: { userId: a.id, reason: "REFERRAL_REVERSED" } });
    expect(row.delta).toBe(-10);

    await new Promise((r) => setTimeout(r, 150));
    const actions = (await prisma.adminActivity.findMany({ where: { action: { startsWith: "referral." } } })).map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["referral.approve", "referral.reject", "referral.reverse"]));
    const summary = (await as(founder).get("/api/admin/referrals/summary")).body;
    expect(summary.counts.REVERSED).toBeGreaterThanOrEqual(1);
  });

  it("browsers may send the device id (CORS)", async () => {
    const pre = await api().options("/api/users/me/referrals").set("Origin", "http://localhost:3000").set("Access-Control-Request-Method", "GET").set("Access-Control-Request-Headers", "x-device-id");
    expect(pre.headers["access-control-allow-headers"]).toMatch(/X-Device-Id/i);
  });

  it("only the Super Admin sees referrals", async () => {
    await as(founder).post("/api/admin/team", { email: "ref-helper@test.local", password: "HelperPassword123!", permissions: ["users", "support"] });
    const helper = `Bearer ${(await api().post("/api/auth/login").send({ email: "ref-helper@test.local", password: "HelperPassword123!" })).body.accessToken}`;
    expect((await as(helper).get("/api/admin/referrals")).status).toBe(403);
    const student = await createUserAndLogin();
    expect((await as(student.auth).get("/api/admin/referrals")).status).toBe(403);
  });
});
