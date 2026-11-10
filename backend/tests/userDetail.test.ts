import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { api, createUserAndLogin } from "./helpers";

// User management (client requirements of 6 Nov 2026): filter by joining date;
// one page shows purchases, saved items, referrals and Helpline tickets.

let founder: string;
beforeAll(async () => {
  founder = (await createUserAndLogin("ADMIN")).auth;
});
const get = (p: string) => api().get(p).set("Authorization", founder);

describe("admin users", () => {
  it("filters by joining date (India days, both ends included)", async () => {
    const old = await createUserAndLogin();
    const fresh = await createUserAndLogin();
    // Joined 1 March 2026, 23:30 IST = 18:00 UTC
    await prisma.user.update({ where: { email: old.email }, data: { createdAt: new Date("2026-03-01T18:00:00Z") } });
    const emails = async (q: string) => (await get(`/api/admin/users?pageSize=100&${q}`)).body.users.map((u: { email: string }) => u.email);
    expect(await emails("joinedFrom=2026-03-01&joinedTo=2026-03-01")).toEqual([old.email]);
    expect(await emails("joinedTo=2026-02-28")).not.toContain(old.email);
    const recent = await emails("joinedFrom=2026-03-02");
    expect(recent).toContain(fresh.email);
    expect(recent).not.toContain(old.email);
    expect((await get("/api/admin/users?joinedFrom=1-3-2026")).status).toBe(400);
  });

  it("the user page lists Helpline messages, saved items, referrals and orders", async () => {
    const s = await createUserAndLogin();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: s.email } });
    await prisma.contactMessage.create({ data: { name: "S", email: s.email, topic: "bug", message: "The quiz froze", userId: user.id } });
    const friend = await createUserAndLogin();
    const f = await prisma.user.findUniqueOrThrow({ where: { email: friend.email } });
    await prisma.referral.create({ data: { referrerId: user.id, referredId: f.id, emailHash: "x", status: "REWARDED", coinsReferrer: 20 } });
    const detail = (await get(`/api/admin/users/${user.id}`)).body.user;
    expect(detail.contactMessages[0]).toMatchObject({ topic: "bug", message: "The quiz froze" });
    expect(detail.referralsMade[0]).toMatchObject({ status: "REWARDED", coinsReferrer: 20, referred: { email: friend.email } });
    expect(detail.orders).toEqual([]);
    expect(detail.savedItems).toEqual([]);
    expect((await get(`/api/admin/users/${f.id}`)).body.user.referredBy).toMatchObject({ referrer: { email: s.email } });
  });
});
