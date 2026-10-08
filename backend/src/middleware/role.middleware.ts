import { NextFunction, Response } from "express";
import { Role } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "./auth.middleware";

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
