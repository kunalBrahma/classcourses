import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { parseDateOfBirth, profileStatus, requireActiveClass, requireActiveDistrict } from "../services/profile.service";

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

// "Complete your profile" (Google sign-ups, older accounts) and later edits:
// name, phone, class, district, date of birth. The date of birth can be set
// once by the student; changing it goes through the Helpline, because it
// decides whether parental consent is needed.
export const updateMyProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { name?: string; phone?: string | null; classLevelId?: string; districtId?: string; dateOfBirth?: string };
  const current = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { dateOfBirth: true } });

  let dateOfBirth: Date | undefined;
  if (body.dateOfBirth !== undefined) {
    const parsed = parseDateOfBirth(body.dateOfBirth);
    if (current.dateOfBirth && current.dateOfBirth.getTime() !== parsed.getTime()) {
      throw new AppError(400, "Your date of birth is already saved. To correct it, write to us from the Helpline.");
    }
    dateOfBirth = parsed;
  }

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: {
      name: body.name,
      phone: body.phone,
      classLevelId: body.classLevelId === undefined ? undefined : await requireActiveClass(body.classLevelId),
      districtId: body.districtId === undefined ? undefined : await requireActiveDistrict(body.districtId),
      dateOfBirth,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      classLevelId: true,
      classLevel: { select: { id: true, name: true, slug: true } },
      districtId: true,
      district: { select: { id: true, name: true, nativeName: true } },
      dateOfBirth: true,
    },
  });
  const { dateOfBirth: _dob, ...rest } = user;
  res.json({ user: { ...rest, ...profileStatus(user) } });
});
