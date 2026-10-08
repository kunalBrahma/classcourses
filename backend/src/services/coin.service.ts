import { CoinReason, Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError";

// The only place coin balances change. Always call inside a transaction so the
// ledger row and the cached User.coins can't drift apart.
//
// (reason, refId) is unique in the DB, so a duplicate payout for the same quiz
// attempt / order fails instead of paying twice.

export interface CoinChange {
  userId: string;
  delta: number;
  reason: CoinReason;
  refId?: string | null;
  note?: string | null;
  createdById?: string | null;
}

export const applyCoinChange = async (tx: Prisma.TransactionClient, change: CoinChange) => {
  if (!Number.isInteger(change.delta) || change.delta === 0) {
    throw new AppError(400, "Coin change must be a non-zero whole number");
  }

  // Atomic increment; for deductions the WHERE guard makes an overdraft impossible
  // even with concurrent requests.
  const updated = await tx.user.updateMany({
    where: { id: change.userId, ...(change.delta < 0 ? { coins: { gte: -change.delta } } : {}) },
    data: { coins: { increment: change.delta } },
  });
  if (updated.count === 0) {
    const exists = await tx.user.findUnique({ where: { id: change.userId }, select: { id: true } });
    throw exists ? new AppError(400, "Not enough coins") : new AppError(404, "User not found");
  }

  const { coins } = await tx.user.findUniqueOrThrow({ where: { id: change.userId }, select: { coins: true } });
  return tx.coinTransaction.create({
    data: {
      userId: change.userId,
      delta: change.delta,
      balanceAfter: coins,
      reason: change.reason,
      refId: change.refId ?? null,
      note: change.note ?? null,
      createdById: change.createdById ?? null,
    },
  });
};
