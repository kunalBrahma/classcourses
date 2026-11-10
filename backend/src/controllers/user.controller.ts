import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { coinSummary, refreshCoins } from "../services/coin.service";
import { accessState, requestConsent } from "../services/consent.service";
import { requireSetting } from "../services/settings.service";
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
// Coins are valid `validityDays` (90) from the day they are credited: each
// credit says when it expires, expired coins are their own rows (COIN_EXPIRED),
// and `nextExpiry` warns about the next coins to go.
export const getMyCoins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  await refreshCoins(userId);
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  const [user, transactions, summary, { validityDays }] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
    prisma.coinTransaction.findMany({
      where: { userId, ...(before && !isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        delta: true,
        balanceAfter: true,
        reason: true,
        note: true,
        createdAt: true,
        lot: { select: { expiresAt: true, remaining: true, expiredAmount: true } },
      },
    }),
    coinSummary(userId),
    requireSetting("coins"),
  ]);
  res.json({
    balance: user.coins,
    validityDays,
    nextExpiry: summary.nextExpiry,
    expiredTotal: summary.expiredTotal,
    transactions,
  });
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

// ---- Parental consent (student side) ----

export const getMyConsent = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await accessState(req.user!.userId));
});

export const requestMyConsent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const sent = await requestConsent(req.user!.userId, req.body.parentEmail);
  res.status(201).json({ message: `We've emailed ${sent.parentEmail}. Ask them to open the link.`, ...sent, ...(await accessState(req.user!.userId)) });
});

// Same parent again (the student only sees the masked email).
export const resendMyConsent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const consent = await prisma.parentalConsent.findUnique({ where: { userId: req.user!.userId }, select: { parentEmail: true } });
  if (!consent) throw new AppError(400, "Give your parent's or guardian's email first.");
  const sent = await requestConsent(req.user!.userId, consent.parentEmail);
  res.json({ message: `We've emailed ${sent.parentEmail} again.`, ...sent, ...(await accessState(req.user!.userId)) });
});
