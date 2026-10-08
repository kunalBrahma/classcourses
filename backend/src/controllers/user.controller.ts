import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
  });
  res.json(users);
});

// Student's remembered medium/class (null clears it).
export const updateMyPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { mediumId, classLevelId } = req.body as { mediumId?: string | null; classLevelId?: string | null };
  if (mediumId) {
    const medium = await prisma.medium.findFirst({ where: { id: mediumId, isActive: true }, select: { id: true } });
    if (!medium) throw new AppError(400, "Unknown medium");
  }
  if (classLevelId) {
    const found = await prisma.classLevel.findFirst({ where: { id: classLevelId, isActive: true }, select: { id: true } });
    if (!found) throw new AppError(400, "Unknown class");
  }
  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: { mediumId, classLevelId },
    select: { id: true, mediumId: true, classLevelId: true, classLevel: { select: { id: true, name: true, slug: true } } },
  });
  res.json({ preferences: user });
});

// Student's coin balance + history (newest first). ?before=<ISO date> pages back.
export const getMyCoins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  const [user, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { coins: true } }),
    prisma.coinTransaction.findMany({
      where: { userId: req.user!.userId, ...(before && !isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, delta: true, balanceAfter: true, reason: true, note: true, createdAt: true },
    }),
  ]);
  res.json({ balance: user.coins, transactions });
});
