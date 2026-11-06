import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { applyCoinChange } from "../services/coin.service";
import { profileStatus } from "../services/profile.service";

// Shapes a user row for the admin: date of birth as "YYYY-MM-DD", age, under 18,
// and whether the profile (class, district, date of birth) is complete.
const withProfile = <T extends { classLevelId: string | null; districtId: string | null; dateOfBirth: Date | null }>(u: T) => {
  const { dateOfBirth: _dob, ...rest } = u;
  return { ...rest, ...profileStatus(u) };
};

// Admin: students & admins, their coins and quiz activity.

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
  classLevelId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  // incomplete = class, district or date of birth missing
  profile: z.enum(["complete", "incomplete"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const listUsersAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { search, role, classLevelId, districtId, profile, page, pageSize } = listQuery.parse(req.query);
  // Every filter is one condition in AND, so none can overwrite another.
  const and: Prisma.UserWhereInput[] = [];
  if (profile === "complete") and.push({ classLevelId: { not: null }, districtId: { not: null }, dateOfBirth: { not: null } });
  if (profile === "incomplete") and.push({ OR: [{ classLevelId: null }, { districtId: null }, { dateOfBirth: null }] });
  if (search) {
    and.push({
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        // Phone: match on digits only, once there are enough to mean something.
        ...(/^[\d\s+-]{3,}$/.test(search) ? [{ phone: { contains: search.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") } }] : []),
      ],
    });
  }
  const where: Prisma.UserWhereInput = { role, classLevelId, districtId, AND: and };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        emailVerified: true,
        role: true,
        coins: true,
        classLevelId: true,
        classLevel: { select: { id: true, name: true, slug: true } },
        districtId: true,
        district: { select: { id: true, name: true } },
        dateOfBirth: true,
        medium: { select: { name: true } },
        createdAt: true,
        _count: { select: { quizAttempts: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({
    users: users.map(({ _count, ...u }) => ({ ...withProfile(u), quizAttempts: _count.quizAttempts })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
});

export const getUserAdmin = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      emailVerified: true,
      role: true,
      coins: true,
      googleId: true,
      classLevelId: true,
      classLevel: { select: { id: true, name: true, slug: true } },
      districtId: true,
      district: { select: { id: true, name: true } },
      dateOfBirth: true,
      medium: { select: { id: true, name: true } },
      createdAt: true,
      coinTxns: { orderBy: { createdAt: "desc" }, take: 50 },
      quizAttempts: {
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          score: true,
          passMark: true,
          coinsAwarded: true,
          dayKey: true,
          startedAt: true,
          finishedAt: true,
          chapter: { select: { title: true, subject: { select: { name: true, classLevel: { select: { id: true, name: true, slug: true } } } } } },
          quizTitle: true,
          quiz: { select: { title: true, classLevel: { select: { id: true, name: true, slug: true } } } },
        },
      },
    },
  });
  if (!user) throw new AppError(404, "User not found");
  // Google's id stays on the server; the admin only sees that Google is linked.
  const { googleId, ...rest } = user;
  res.json({ user: { ...withProfile(rest), signsInWithGoogle: Boolean(googleId) } });
});

export const updateUserAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role, name } = req.body as { role?: "STUDENT" | "ADMIN"; name?: string | null };
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
  if (!target) throw new AppError(404, "User not found");

  if (role && role !== target.role) {
    if (target.id === req.user!.userId) {
      throw new AppError(400, "You can't change your own role");
    }
    if (target.role === "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN" } })) <= 1) {
      throw new AppError(400, "Keep at least one admin");
    }
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { role, name },
    select: { id: true, email: true, name: true, role: true, coins: true },
  });
  if (role && role !== target.role) {
    // Sign the user out everywhere so the new role applies immediately.
    await prisma.refreshToken.deleteMany({ where: { userId: target.id } });
  }
  res.json({ user });
});

// Manual correction (e.g. goodwill credit, fixing a mistake). Recorded in the ledger.
export const adjustUserCoins = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { delta, note } = req.body as { delta: number; note: string };
  const txn = await prisma.$transaction((tx) =>
    applyCoinChange(tx, { userId: req.params.id, delta, reason: "ADMIN_ADJUST", note, createdById: req.user!.userId })
  );
  res.status(201).json({ transaction: txn, balance: txn.balanceAfter });
});
