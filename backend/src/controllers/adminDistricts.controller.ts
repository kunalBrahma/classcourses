import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { assertSameSet } from "./adminCatalog.controller";

// Admin → Catalog → Districts: the list students pick from at sign-up.
// A district students have chosen can be hidden, never deleted.

const view = <T extends { _count: { users: number } }>({ _count, ...d }: T) => ({ ...d, students: _count.users });

const sameNameTaken = async (name: string, exceptId?: string) =>
  prisma.district.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });

export const listDistrictsAdmin = asyncHandler(async (_req: Request, res: Response) => {
  const districts = await prisma.district.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });
  res.json({ districts: districts.map(view) });
});

export const createDistrict = asyncHandler(async (req: Request, res: Response) => {
  const { name, nativeName } = req.body as { name: string; nativeName?: string | null };
  if (await sameNameTaken(name)) throw new AppError(409, `"${name}" is already in the list`);
  const last = await prisma.district.aggregate({ _max: { order: true } });
  const district = await prisma.district.create({
    data: { name, nativeName: nativeName || null, order: (last._max.order ?? -1) + 1 },
    include: { _count: { select: { users: true } } },
  });
  res.status(201).json({ district: view(district) });
});

export const updateDistrict = asyncHandler(async (req: Request, res: Response) => {
  const { name, nativeName, isActive } = req.body as { name?: string; nativeName?: string | null; isActive?: boolean };
  const existing = await prisma.district.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) throw new AppError(404, "District not found");
  if (name && (await sameNameTaken(name, existing.id))) throw new AppError(409, `"${name}" is already in the list`);
  const district = await prisma.district.update({
    where: { id: existing.id },
    data: { name, nativeName: nativeName === undefined ? undefined : nativeName || null, isActive },
    include: { _count: { select: { users: true } } },
  });
  res.json({ district: view(district) });
});

export const reorderDistricts = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  const all = await prisma.district.findMany({ select: { id: true } });
  assertSameSet(ids, all.map((d) => d.id), "district");
  await prisma.$transaction(ids.map((id, order) => prisma.district.update({ where: { id }, data: { order } })));
  res.json({ message: "Order saved" });
});

export const deleteDistrict = asyncHandler(async (req: Request, res: Response) => {
  const district = await prisma.district.findUnique({ where: { id: req.params.id }, include: { _count: { select: { users: true } } } });
  if (!district) throw new AppError(404, "District not found");
  if (district._count.users > 0) {
    const n = district._count.users;
    throw new AppError(409, `${n} student${n === 1 ? " has" : "s have"} chosen ${district.name}. Hide it instead, so new students can't pick it.`);
  }
  await prisma.district.delete({ where: { id: district.id } });
  res.json({ message: "District deleted" });
});
