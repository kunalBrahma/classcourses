import { Request, Response } from "express";
import { z } from "zod";
import { AdminLoginResult, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { accountStatus, clearAccount } from "../services/loginThrottle.service";
import { LOGIN_DEFAULTS, REQUEST_LIMIT_NAMES, REQUEST_LIMITS } from "../config/limits";

// Admin → Security: every sign-in attempt on an admin account, and helping a
// student whose sign-in is paused.

const logQuery = z.object({
  result: z.nativeEnum(AdminLoginResult).optional(),
  email: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const listAdminLogins = asyncHandler(async (req: Request, res: Response) => {
  const { result, email, page, pageSize } = logQuery.parse(req.query);
  const where: Prisma.AdminLoginAttemptWhereInput = { result, ...(email ? { email: { contains: email, mode: "insensitive" } } : {}) };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [attempts, total, failedToday] = await Promise.all([
    prisma.adminLoginAttempt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, email: true, result: true, ip: true, userAgent: true, createdAt: true, user: { select: { id: true, name: true } } },
    }),
    prisma.adminLoginAttempt.count({ where }),
    prisma.adminLoginAttempt.count({ where: { createdAt: { gte: since }, result: { in: ["WRONG_PASSWORD", "LOCKED"] } } }),
  ]);
  res.json({ attempts, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), failedToday });
});

// Is this user's sign-in paused right now?
export const getUserSignInStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { email: true } });
  if (!user) throw new AppError(404, "User not found");
  res.json({ signIn: await accountStatus(user.email) });
});

// Ends the pause and forgets the failed sign-ins (e.g. a student who forgot
// their password and asked the Helpline). The password stays the same.
export const clearUserSignInLock = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { email: true } });
  if (!user) throw new AppError(404, "User not found");
  await clearAccount(user.email);
  res.json({ message: "Sign-in unpaused", signIn: await accountStatus(user.email) });
});

// What each limit in the `security` setting means, for Settings → Security
// (one list, src/config/limits.ts, so the page never drifts from the API).
export const securityLimitsMeta = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    requestLimits: REQUEST_LIMIT_NAMES.map((name) => ({ name, ...REQUEST_LIMITS[name] })),
    loginDefaults: LOGIN_DEFAULTS,
  });
});
