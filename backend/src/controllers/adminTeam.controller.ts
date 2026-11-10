import { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { hashPassword } from "../utils/password";
import { AdminRequest } from "../middleware/role.middleware";
import { noteActivity } from "../middleware/adminActivity";
import { ADMIN_PERMISSIONS } from "../config/adminAccess";
import { assertEmailNotBlocked, signOutEverywhereTx } from "../services/account.service";

// Admin → Team (Super Admin only): helper admins with only some sections, so
// the Founder isn't the only one who can do routine work (client requirements
// of 6 Nov 2026). Super Admins come only from the server (npm run create-admin),
// so no helper can ever give themselves or anyone full access.

const teamSelect = { id: true, email: true, name: true, adminLevel: true, adminPermissions: true, createdAt: true } as const;

export const listTeam = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: { not: "DELETED" } }, orderBy: [{ adminLevel: "asc" }, { createdAt: "asc" }], select: teamSelect });
  res.json({ admins, permissions: Object.entries(ADMIN_PERMISSIONS).map(([key, label]) => ({ key, label })) });
});

// An existing account becomes a helper, or a new one is made (with a password
// the person can change through "Forgot password").
export const addHelper = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { email, name, password, permissions } = req.body as { email: string; name?: string; password?: string; permissions: string[] };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.status === "DELETED" || existing?.status === "BLOCKED") throw new AppError(400, "This account is blocked or erased");
  if (existing?.role === "ADMIN") throw new AppError(409, "This person is already an admin");
  let user;
  if (existing) {
    user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: existing.id }, data: { role: "ADMIN", adminLevel: "HELPER", adminPermissions: permissions, name: name ?? existing.name }, select: teamSelect });
      await signOutEverywhereTx(tx, existing.id); // signs in again with admin access
      return updated;
    });
  } else {
    if (!password) throw new AppError(400, "No account uses this email yet: set a starting password (at least 12 characters)");
    await assertEmailNotBlocked(email);
    user = await prisma.user.create({
      data: { email, name: name ?? null, password: await hashPassword(password), role: "ADMIN", adminLevel: "HELPER", adminPermissions: permissions, emailVerified: true },
      select: teamSelect,
    });
  }
  noteActivity(res, { action: "team.add_helper", targetType: "user", targetId: user.id, summary: `${email} → helper admin`, after: { permissions } });
  res.status(201).json({ admin: user });
});

const requireHelper = async (id: string, req: AdminRequest) => {
  if (id === req.admin!.id) throw new AppError(400, "You can't change your own admin access");
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, adminLevel: true, adminPermissions: true, email: true } });
  if (!user || user.role !== "ADMIN") throw new AppError(404, "Admin not found");
  if (user.adminLevel === "SUPER") throw new AppError(400, "A Super Admin's access can only be changed from the server");
  return user;
};

export const updateHelper = asyncHandler(async (req: AdminRequest, res: Response) => {
  const user = await requireHelper(req.params.id, req);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { adminPermissions: req.body.permissions }, select: teamSelect });
  noteActivity(res, { action: "team.update_helper", targetType: "user", targetId: user.id, before: { permissions: user.adminPermissions }, after: { permissions: updated.adminPermissions } });
  res.json({ admin: updated });
});

// Back to a student account; signed out everywhere so it applies at once.
export const removeHelper = asyncHandler(async (req: AdminRequest, res: Response) => {
  const user = await requireHelper(req.params.id, req);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: "STUDENT", adminPermissions: [], adminLevel: "SUPER" } });
    await signOutEverywhereTx(tx, user.id);
  });
  noteActivity(res, { action: "team.remove_helper", targetType: "user", targetId: user.id, summary: `${user.email}: admin access removed`, before: { permissions: user.adminPermissions } });
  res.json({ message: "Admin access removed" });
});

// ---------------------------------------------------------------------------
// Activity log (Super Admin only)
// ---------------------------------------------------------------------------

const activityQuery = z.object({
  actorId: z.string().uuid().optional(),
  targetId: z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const listActivity = asyncHandler(async (req: Request, res: Response) => {
  const { actorId, targetId, q, page, pageSize } = activityQuery.parse(req.query);
  const where: Prisma.AdminActivityWhereInput = {
    actorId,
    targetId,
    ...(q
      ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { reason: { contains: q, mode: "insensitive" } }, { actorEmail: { contains: q, mode: "insensitive" } }, { path: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [entries, total, actors] = await Promise.all([
    prisma.adminActivity.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.adminActivity.count({ where }),
    prisma.adminActivity.groupBy({ by: ["actorId", "actorEmail"], _count: true }),
  ]);
  res.json({ entries, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), actors: actors.map((a) => ({ id: a.actorId, email: a.actorEmail, count: a._count })) });
});
