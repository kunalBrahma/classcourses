import { CoinReason, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { requireSetting } from "./settings.service";

// The only place coin balances change. Always call inside a transaction so the
// ledger row, the lots and the cached User.coins can't drift apart.
//
// (reason, refId) is unique in the DB, so a duplicate payout for the same quiz
// attempt / order fails instead of paying twice.
//
// Coins expire (client requirements of 6 Nov 2026): every credit is a CoinLot
// valid `coins.validityDays` (90) from the day it was credited. Spending takes
// from the lot that expires first; new coins never extend older ones. Expiry
// is its own ledger row (COIN_EXPIRED), written lazily before any change or
// read (refreshCoins) and by the maintenance sweep. Invariant:
// User.coins === sum of the user's CoinLot.remaining.

type Tx = Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CoinChange {
  userId: string;
  delta: number;
  reason: CoinReason;
  refId?: string | null;
  note?: string | null;
  createdById?: string | null;
  // A credit that returns coins held for this refId (an order): they go back
  // to the lots they came from, with those lots' expiry dates.
  restoreRefId?: string | null;
}

const dateText = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// Takes the student's row lock (a no-op update), so coin changes for one
// student run one after another and every later read sees the earlier ones.
const lockUser = async (tx: Tx, userId: string) => {
  const locked = await tx.user.updateMany({ where: { id: userId }, data: { coins: { increment: 0 } } });
  if (locked.count === 0) throw new AppError(404, "User not found");
};

const balanceOf = async (tx: Tx, userId: string) => (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } })).coins;

const newLot = async (tx: Tx, userId: string, creditTxId: string, amount: number, creditedAt: Date) => {
  const { validityDays } = await requireSetting("coins");
  return tx.coinLot.create({
    data: { userId, creditTxId, amount, remaining: amount, creditedAt, expiresAt: new Date(creditedAt.getTime() + validityDays * DAY_MS) },
  });
};

// Takes `amount` from the user's lots, soonest expiry first. Throws if the
// lots don't hold enough (the caller has already checked the balance).
const takeFromLots = async (tx: Tx, userId: string, txId: string, amount: number) => {
  let left = amount;
  const lots = await tx.coinLot.findMany({ where: { userId, remaining: { gt: 0 } }, orderBy: [{ expiresAt: "asc" }, { creditedAt: "asc" }] });
  for (const lot of lots) {
    if (left === 0) break;
    const take = Math.min(lot.remaining, left);
    await tx.coinLot.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } });
    await tx.coinLotMove.create({ data: { txId, lotId: lot.id, amount: -take } });
    left -= take;
  }
  // A plain Error (not AppError): callers that catch "Not enough coins" must
  // not carry on after this, so the whole transaction rolls back.
  if (left > 0) throw new Error(`Coin lots for user ${userId} hold less than the balance (short by ${left})`);
};

// Gives `amount` back to the lots that coins for `refId` were taken from
// (latest expiry first). Returns what couldn't be placed (credited as a new lot).
const returnToLots = async (tx: Tx, userId: string, txId: string, refId: string, amount: number) => {
  const moves = await tx.coinLotMove.findMany({
    where: { tx: { userId, refId } },
    select: { lotId: true, amount: true, lot: { select: { expiresAt: true } } },
  });
  const net = new Map<string, { owed: number; expiresAt: Date }>();
  for (const m of moves) {
    const cur = net.get(m.lotId) ?? { owed: 0, expiresAt: m.lot.expiresAt };
    cur.owed -= m.amount; // taken = negative move → owed back
    net.set(m.lotId, cur);
  }
  let left = amount;
  for (const [lotId, { owed }] of [...net.entries()].sort((a, b) => b[1].expiresAt.getTime() - a[1].expiresAt.getTime())) {
    if (left === 0) break;
    if (owed <= 0) continue;
    const give = Math.min(owed, left);
    await tx.coinLot.update({ where: { id: lotId }, data: { remaining: { increment: give } } });
    await tx.coinLotMove.create({ data: { txId, lotId, amount: give } });
    left -= give;
  }
  return left;
};

/**
 * Writes COIN_EXPIRED rows for every lot past its date that still holds
 * coins. The caller holds the user's row lock (lockUser). Returns how many
 * coins expired.
 */
export const expireDueCoinsTx = async (tx: Tx, userId: string, now = new Date()) => {
  const due = await tx.coinLot.findMany({ where: { userId, remaining: { gt: 0 }, expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" } });
  let expired = 0;
  for (const lot of due) {
    const cleared = await tx.coinLot.updateMany({
      where: { id: lot.id, remaining: lot.remaining },
      data: { remaining: 0, expiredAmount: { increment: lot.remaining }, expiryCount: { increment: 1 } },
    });
    if (cleared.count === 0) continue;
    const { coins } = await tx.user.update({ where: { id: userId }, data: { coins: { decrement: lot.remaining } }, select: { coins: true } });
    const row = await tx.coinTransaction.create({
      data: {
        userId,
        delta: -lot.remaining,
        balanceAfter: coins,
        reason: "COIN_EXPIRED",
        refId: `${lot.id}:${lot.expiryCount + 1}`,
        note: `Coins credited on ${dateText(lot.creditedAt)} were valid until ${dateText(lot.expiresAt)}`,
      },
    });
    await tx.coinLotMove.create({ data: { txId: row.id, lotId: lot.id, amount: -lot.remaining } });
    expired += lot.remaining;
  }
  return expired;
};

/**
 * Accounts from before coins expired (6 Nov 2026) have ledger rows but no
 * lots: rebuild them by replaying the ledger (each credit a lot dated when it
 * was credited; spends take the soonest-expiring first; held coins that came
 * back return to their lots). Only when the user has no lots at all.
 */
const rebuildLotsTx = async (tx: Tx, userId: string) => {
  if ((await tx.coinLot.count({ where: { userId } })) > 0) return false;
  const rows = await tx.coinTransaction.findMany({ where: { userId, NOT: { reason: "COIN_EXPIRED" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (rows.length === 0) return false;
  for (const row of rows) {
    if (row.delta > 0) {
      const left = row.reason === "NOTE_DISCOUNT_REFUND" && row.refId ? await returnToLots(tx, userId, row.id, row.refId, row.delta) : row.delta;
      if (left > 0) await newLot(tx, userId, row.id, left, row.createdAt);
    } else {
      await takeFromLots(tx, userId, row.id, -row.delta);
    }
  }
  return true;
};

// Inside a transaction: lock, rebuild lots for an older account, expire due coins.
export const prepareCoinsTx = async (tx: Tx, userId: string) => {
  await lockUser(tx, userId);
  await rebuildLotsTx(tx, userId);
  await expireDueCoinsTx(tx, userId);
};

export const applyCoinChange = async (tx: Tx, change: CoinChange) => {
  if (!Number.isInteger(change.delta) || change.delta === 0) {
    throw new AppError(400, "Coin change must be a non-zero whole number");
  }
  await prepareCoinsTx(tx, change.userId);

  // Atomic change; for deductions the WHERE guard makes an overdraft impossible.
  // Expired coins were removed just above, so they can never be spent.
  const updated = await tx.user.updateMany({
    where: { id: change.userId, ...(change.delta < 0 ? { coins: { gte: -change.delta } } : {}) },
    data: { coins: { increment: change.delta } },
  });
  if (updated.count === 0) throw new AppError(400, "Not enough coins");

  const row = await tx.coinTransaction.create({
    data: {
      userId: change.userId,
      delta: change.delta,
      balanceAfter: await balanceOf(tx, change.userId),
      reason: change.reason,
      refId: change.refId ?? null,
      note: change.note ?? null,
      createdById: change.createdById ?? null,
    },
  });

  if (change.delta < 0) {
    await takeFromLots(tx, change.userId, row.id, -change.delta);
  } else {
    const left = change.restoreRefId ? await returnToLots(tx, change.userId, row.id, change.restoreRefId, change.delta) : change.delta;
    if (left > 0) await newLot(tx, change.userId, row.id, left, row.createdAt);
    // Coins returned to a lot that is already past its date expire now.
    if (change.restoreRefId) await expireDueCoinsTx(tx, change.userId);
  }
  return row;
};

/**
 * Before showing or using a balance: rebuilds lots for an older account and
 * expires due coins. Cheap when there's nothing to do.
 */
export const refreshCoins = async (userId: string) => {
  const [user, lots, due] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { coins: true } }),
    prisma.coinLot.count({ where: { userId } }),
    prisma.coinLot.findFirst({ where: { userId, remaining: { gt: 0 }, expiresAt: { lte: new Date() } }, select: { id: true } }),
  ]);
  if (!user || (!due && (lots > 0 || user.coins === 0))) return;
  await prisma.$transaction((tx) => prepareCoinsTx(tx, userId));
};

/** Maintenance sweep: expire due coins for everyone (a batch per run). */
export const expireAllDueCoins = async (batch = 200) => {
  const users = await prisma.coinLot.findMany({
    where: { remaining: { gt: 0 }, expiresAt: { lte: new Date() } },
    distinct: ["userId"],
    select: { userId: true },
    take: batch,
  });
  for (const { userId } of users) await prisma.$transaction((tx) => prepareCoinsTx(tx, userId));
  return users.length;
};

/** For the profile and the admin: what's left, what expires next, what has expired. */
export const coinSummary = async (userId: string) => {
  const [lots, expired] = await Promise.all([
    prisma.coinLot.findMany({
      where: { userId, remaining: { gt: 0 } },
      orderBy: { expiresAt: "asc" },
      select: { id: true, remaining: true, creditedAt: true, expiresAt: true },
    }),
    prisma.coinLot.aggregate({ where: { userId }, _sum: { expiredAmount: true } }),
  ]);
  const next = lots[0];
  return {
    lots,
    // The next coins to expire (one date; there may be more on later dates)
    nextExpiry: next ? { amount: lots.filter((l) => l.expiresAt.getTime() === next.expiresAt.getTime()).reduce((s, l) => s + l.remaining, 0), expiresAt: next.expiresAt } : null,
    expiredTotal: expired._sum.expiredAmount ?? 0,
  };
};
