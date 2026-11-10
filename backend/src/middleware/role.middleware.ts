import { NextFunction, Response } from "express";
import { Role } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "./auth.middleware";
import { accessFor } from "../config/adminAccess";
import { assertFullAccess } from "../services/consent.service";

// Use after `authenticate`. Reads the role from the DB (not the JWT) so a
// demoted admin loses access immediately rather than when their token expires.
export const requireRole = (...roles: Role[]) =>
  asyncHandler(async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError(401, "Unauthorized");
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !roles.includes(user.role)) {
      throw new AppError(403, "You do not have permission to do this");
    }

    next();
  });

export interface AdminRequest extends AuthRequest {
  admin?: { id: string; email: string; level: "SUPER" | "HELPER"; permissions: string[] };
}

/**
 * For the whole /api/admin router (after `authenticate`): the user must be an
 * ADMIN; a helper admin also needs the section this route belongs to
 * (config/adminAccess.ts). Read from the DB on every request, so a change of
 * permissions applies at once.
 */
export const requireAdmin = asyncHandler(async (req: AdminRequest, _res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  if (!userId) throw new AppError(401, "Unauthorized");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, adminLevel: true, adminPermissions: true } });
  if (!user || user.role !== "ADMIN") throw new AppError(403, "You do not have permission to do this");
  req.admin = { id: user.id, email: user.email, level: user.adminLevel, permissions: user.adminPermissions };
  if (user.adminLevel === "SUPER") return next();

  const needed = accessFor(req.method, req.path);
  if (needed === "dashboard" || (needed !== "super" && user.adminPermissions.includes(needed))) return next();
  throw new AppError(403, needed === "super" ? "Only the Super Admin can do this" : "Your admin account doesn't have access to this section", "ADMIN_NO_ACCESS");
});

/**
 * Quizzes, coins and purchases (client requirements of 6 Nov 2026): a student
 * under 18 needs a parent's consent first, and every student a date of birth.
 */
export const requireFullAccess = asyncHandler(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  await assertFullAccess(req.user!.userId);
  next();
});
