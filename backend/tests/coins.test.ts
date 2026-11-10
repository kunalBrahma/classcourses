import { beforeAll, describe, expect, it } from "vitest";
import { CoinReason } from "@prisma/client";
import prisma from "../src/config/prisma";
import { applyCoinChange, expireAllDueCoins, refreshCoins } from "../src/services/coin.service";
import { api, createUserAndLogin } from "./helpers";

// Coins expire 90 days after they are credited, each credit separately
// (client requirements of 6 Nov 2026). Time is simulated by editing lot dates.

const DAY = 24 * 60 * 60 * 1000;
let adminAuth: string;

const change = (userId: string, delta: number, reason: CoinReason, extra: { refId?: string; restoreRefId?: string } = {}) =>
  prisma.$transaction((tx) => applyCoinChange(tx, { userId, delta, reason, refId: extra.refId ?? `${reason}-${Math.random()}`, restoreRefId: extra.restoreRefId }));
const lotsOf = (userId: string) => prisma.coinLot.findMany({ where: { userId }, orderBy: { creditedAt: "asc" } });
const balance = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coins;
// The invariant: the cached balance is the sum of what's left in the lots.
const expectConsistent = async (userId: string) => {
  const sum = (await lotsOf(userId)).reduce((s, l) => s + l.remaining, 0);
  expect(await balance(userId)).toBe(sum);
};
// Moves a lot's dates into the past by `days`.
const age = (lotId: string, days: number) =>
  prisma.coinLot.findUniqueOrThrow({ where: { id: lotId } }).then((l) =>
    prisma.coinLot.update({ where: { id: lotId }, data: { creditedAt: new Date(l.creditedAt.getTime() - days * DAY), expiresAt: new Date(l.expiresAt.getTime() - days * DAY) } })
  );
const student = async () => {
  const s = await createUserAndLogin("STUDENT");
  const user = await prisma.user.findUniqueOrThrow({ where: { email: s.email } });
  return { ...s, id: user.id };
};

beforeAll(async () => {
  adminAuth = (await createUserAndLogin("ADMIN")).auth;
});

describe("coin lots", () => {
  it("every credit expires 90 days after it was credited; new coins never extend older ones", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    const [first] = await lotsOf(s.id);
    expect(first.expiresAt.getTime() - first.creditedAt.getTime()).toBe(90 * DAY);
    await age(first.id, 30);
    await change(s.id, 10, "QUIZ_PASS");
    const [a, b] = await lotsOf(s.id);
    expect(a.expiresAt.getTime()).toBe(first.expiresAt.getTime() - 30 * DAY); // unchanged by the new credit
    expect(b.expiresAt.getTime() - b.creditedAt.getTime()).toBe(90 * DAY);
    await expectConsistent(s.id);
  });

  it("spending takes the coins that expire first", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    await change(s.id, 10, "QUIZ_PASS");
    const [older] = await lotsOf(s.id);
    await age(older.id, 40);
    await change(s.id, -15, "ADMIN_ADJUST");
    const [a, b] = await lotsOf(s.id);
    expect([a.remaining, b.remaining]).toEqual([0, 5]);
    await expectConsistent(s.id);
  });

  it("expired coins leave the balance as their own row, and can't be spent", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    await change(s.id, 20, "QUIZ_PASS");
    const [old] = await lotsOf(s.id);
    await age(old.id, 91);

    await refreshCoins(s.id);
    expect(await balance(s.id)).toBe(20);
    const expired = await prisma.coinTransaction.findFirstOrThrow({ where: { userId: s.id, reason: "COIN_EXPIRED" } });
    expect(expired).toMatchObject({ delta: -10, balanceAfter: 20 });
    expect(expired.note).toMatch(/were valid until/);
    expect(await prisma.coinLot.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ remaining: 0, expiredAmount: 10 });

    await expect(change(s.id, -25, "ADMIN_ADJUST")).rejects.toThrow(/Not enough coins/);
    // Refreshing again writes nothing new
    await refreshCoins(s.id);
    expect(await prisma.coinTransaction.count({ where: { userId: s.id, reason: "COIN_EXPIRED" } })).toBe(1);
    await expectConsistent(s.id);
  });

  it("a spend removes coins that just expired first, so they never count", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    const [lot] = await lotsOf(s.id);
    await age(lot.id, 90);
    // No refresh in between: the change itself expires them first, so the
    // spend is refused (and rolled back with everything in its transaction)…
    await expect(change(s.id, -5, "ADMIN_ADJUST")).rejects.toThrow(/Not enough coins/);
    // …and the next read removes them for good.
    await refreshCoins(s.id);
    expect(await balance(s.id)).toBe(0);
  });

  it("held coins that come back return to their own lots, keeping their dates", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    await change(s.id, 10, "QUIZ_PASS");
    const [a] = await lotsOf(s.id);
    await age(a.id, 10);
    await change(s.id, -12, "NOTE_DISCOUNT", { refId: "order-1" });
    await change(s.id, 12, "NOTE_DISCOUNT_REFUND", { refId: "order-1", restoreRefId: "order-1" });
    const lots = await lotsOf(s.id);
    expect(lots).toHaveLength(2); // no new lot: both went back
    expect(lots.map((l) => l.remaining)).toEqual([10, 10]);
    await expectConsistent(s.id);
  });

  it("coins returned to a lot that has meanwhile expired expire at once (shown in the history)", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    await change(s.id, -10, "NOTE_DISCOUNT", { refId: "order-2" });
    const [lot] = await lotsOf(s.id);
    await age(lot.id, 95);
    await change(s.id, 10, "NOTE_DISCOUNT_REFUND", { refId: "order-2", restoreRefId: "order-2" });
    expect(await balance(s.id)).toBe(0);
    const rows = await prisma.coinTransaction.findMany({ where: { userId: s.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.reason, r.delta])).toEqual([
      ["QUIZ_PASS", 10],
      ["NOTE_DISCOUNT", -10],
      ["NOTE_DISCOUNT_REFUND", 10],
      ["COIN_EXPIRED", -10],
    ]);
    await expectConsistent(s.id);
  });

  it("the validity is a setting; a change applies to coins credited afterwards", async () => {
    const s = await student();
    await change(s.id, 5, "QUIZ_PASS");
    expect((await api().put("/api/admin/settings/coins").set("Authorization", adminAuth).send({ validityDays: 30 })).status).toBe(200);
    await change(s.id, 5, "QUIZ_PASS");
    const [a, b] = await lotsOf(s.id);
    expect(a.expiresAt.getTime() - a.creditedAt.getTime()).toBe(90 * DAY);
    expect(b.expiresAt.getTime() - b.creditedAt.getTime()).toBe(30 * DAY);
    expect((await api().put("/api/admin/settings/coins").set("Authorization", adminAuth).send({ validityDays: 0 })).status).toBe(400);
    await api().delete("/api/admin/settings/coins").set("Authorization", adminAuth);
  });

  it("older accounts get their lots rebuilt from the ledger, dated when each coin was earned", async () => {
    const s = await student();
    // Written directly, as before coins expired: ledger rows and a balance, no lots
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY);
    await prisma.coinTransaction.createMany({
      data: [
        { userId: s.id, delta: 10, balanceAfter: 10, reason: "QUIZ_PASS", refId: "legacy-1", createdAt: at(100) },
        { userId: s.id, delta: 10, balanceAfter: 20, reason: "QUIZ_PASS", refId: "legacy-2", createdAt: at(20) },
        { userId: s.id, delta: -4, balanceAfter: 16, reason: "NOTE_DISCOUNT", refId: "legacy-o", createdAt: at(10) },
        { userId: s.id, delta: 4, balanceAfter: 20, reason: "NOTE_DISCOUNT_REFUND", refId: "legacy-o", createdAt: at(9) },
      ],
    });
    await prisma.user.update({ where: { id: s.id }, data: { coins: 20 } });

    await refreshCoins(s.id);
    const lots = await lotsOf(s.id);
    expect(lots).toHaveLength(2);
    const first = await prisma.coinTransaction.findFirstOrThrow({ where: { userId: s.id, refId: "legacy-1" } });
    expect(lots[0].creditedAt.getTime()).toBe(first.createdAt.getTime());
    // The 100-day-old coins (refund went back to them) have expired; the newer ones remain
    expect(lots.map((l) => [l.remaining, l.expiredAmount])).toEqual([
      [0, 10],
      [10, 0],
    ]);
    expect(await balance(s.id)).toBe(10);
    await expectConsistent(s.id);
  });

  it("the maintenance sweep expires due coins for everyone", async () => {
    const s = await student();
    await change(s.id, 7, "QUIZ_PASS");
    const [lot] = await lotsOf(s.id);
    await age(lot.id, 120);
    expect(await expireAllDueCoins()).toBeGreaterThanOrEqual(1);
    expect(await balance(s.id)).toBe(0);
  });
});

describe("what students and the admin see", () => {
  it("the student's coins: balance, next expiry, expired total, and each credit's date", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    await change(s.id, 15, "QUIZ_PASS");
    const [old] = await lotsOf(s.id);
    await age(old.id, 95);
    await change(s.id, 6, "QUIZ_PASS");
    const [, mid] = await lotsOf(s.id);
    await age(mid.id, 80);

    const me = await api().get("/api/auth/me").set("Authorization", s.auth);
    expect(me.body.user.coins).toBe(21);

    const res = await api().get("/api/users/me/coins").set("Authorization", s.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ balance: 21, validityDays: 90, expiredTotal: 10, nextExpiry: { amount: 15 } });
    expect(new Date(res.body.nextExpiry.expiresAt).getTime()).toBeLessThan(Date.now() + 11 * DAY);
    const expired = res.body.transactions.filter((t: { reason: string }) => t.reason === "COIN_EXPIRED");
    expect(expired).toHaveLength(1);
    const credit = res.body.transactions.find((t: { reason: string; delta: number }) => t.reason === "QUIZ_PASS" && t.delta === 6);
    expect(credit.lot).toMatchObject({ remaining: 6, expiredAmount: 0 });
  });

  it("the admin sees lots, the next expiry and expired coins; admin removals use the soonest-expiring coins", async () => {
    const s = await student();
    await change(s.id, 10, "QUIZ_PASS");
    await change(s.id, 10, "QUIZ_PASS");
    const [old] = await lotsOf(s.id);
    await age(old.id, 50);
    const removed = await api().post(`/api/admin/users/${s.id}/coins`).set("Authorization", adminAuth).send({ delta: -5, note: "Fixing a mistake" });
    expect(removed.status).toBe(201);
    const detail = await api().get(`/api/admin/users/${s.id}`).set("Authorization", adminAuth);
    expect(detail.body.user.coinLots.map((l: { remaining: number }) => l.remaining)).toEqual([5, 10]);
    expect(detail.body.user).toMatchObject({ coins: 15, expiredCoins: 0, nextCoinExpiry: { amount: 5 } });
    expect(detail.body.user.coinTxns[0]).toMatchObject({ reason: "ADMIN_ADJUST", delta: -5 });
  });
});
