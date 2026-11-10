import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { sanitizeRichText } from "../utils/sanitizeHtml";

// Announcements (client requirements of 6 Nov 2026): text and an optional
// picture, published / unpublished, with a visibility (everyone, or signed-in
// students, optionally one class) and an optional date window.

/** What a visitor sees now: guests get EVERYONE only; students also their class's. */
export const visibleAnnouncements = async (userId?: string) => {
  const now = new Date();
  const viewer = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { classLevelId: true } }) : null;
  const audiences: Prisma.AnnouncementWhereInput[] = [{ audience: "EVERYONE" }];
  if (viewer) audiences.push({ audience: "STUDENTS", OR: [{ classLevelId: null }, ...(viewer.classLevelId ? [{ classLevelId: viewer.classLevelId }] : [])] });
  return prisma.announcement.findMany({
    where: {
      isPublished: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, { OR: audiences }],
    },
    orderBy: { order: "asc" },
    select: { id: true, title: true, bodyHtml: true, imageUrl: true, imageWidth: true, imageHeight: true, link: true, linkLabel: true, createdAt: true },
  });
};

export interface AnnouncementInput {
  title?: string;
  bodyHtml?: string;
  imageUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  link?: string | null;
  linkLabel?: string | null;
  audience?: "EVERYONE" | "STUDENTS";
  classLevelId?: string | null;
  isPublished?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

const toData = (input: AnnouncementInput) => {
  const data: Prisma.AnnouncementUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.bodyHtml !== undefined) data.bodyHtml = sanitizeRichText(input.bodyHtml);
  if (input.imageUrl !== undefined) {
    data.imageUrl = input.imageUrl || null;
    data.imageWidth = input.imageUrl ? (input.imageWidth ?? null) : null;
    data.imageHeight = input.imageUrl ? (input.imageHeight ?? null) : null;
  }
  if (input.link !== undefined) data.link = input.link || null;
  if (input.linkLabel !== undefined) data.linkLabel = input.linkLabel || null;
  if (input.audience !== undefined) data.audience = input.audience;
  if (input.classLevelId !== undefined) data.classLevelId = input.classLevelId;
  if (input.isPublished !== undefined) data.isPublished = input.isPublished;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
  return data;
};

/** Everyone can't be limited to a class; the end must come after the start. */
const check = async (merged: { audience: string; classLevelId: string | null; startsAt: Date | null; endsAt: Date | null }) => {
  if (merged.audience === "EVERYONE" && merged.classLevelId) throw new AppError(400, "Choose “Signed-in students” to show it to one class only");
  if (merged.classLevelId && !(await prisma.classLevel.count({ where: { id: merged.classLevelId } }))) throw new AppError(400, "That class doesn't exist");
  if (merged.startsAt && merged.endsAt && merged.endsAt <= merged.startsAt) throw new AppError(400, "The end must be after the start");
};

const adminInclude = { classLevel: { select: { id: true, name: true } } } as const;

export const listAnnouncementsAdmin = () => prisma.announcement.findMany({ orderBy: { order: "asc" }, include: adminInclude });

export const createAnnouncement = async (input: AnnouncementInput & { title: string }) => {
  const data = toData(input) as Prisma.AnnouncementUncheckedCreateInput;
  await check({ audience: data.audience ?? "EVERYONE", classLevelId: data.classLevelId ?? null, startsAt: (data.startsAt as Date) ?? null, endsAt: (data.endsAt as Date) ?? null });
  // New ones go first: the latest news is usually the most important
  await prisma.announcement.updateMany({ data: { order: { increment: 1 } } });
  return prisma.announcement.create({ data: { ...data, title: input.title, order: 0 }, include: adminInclude });
};

export const updateAnnouncement = async (id: string, input: AnnouncementInput) => {
  const current = await prisma.announcement.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "Announcement not found");
  const data = toData(input);
  // Switching to everyone drops the class
  if (data.audience === "EVERYONE" && input.classLevelId === undefined) data.classLevelId = null;
  const pick = <T>(key: keyof typeof data, fallback: T) => (data[key] !== undefined ? (data[key] as T) : fallback);
  await check({
    audience: pick("audience", current.audience),
    classLevelId: pick("classLevelId", current.classLevelId),
    startsAt: pick("startsAt", current.startsAt),
    endsAt: pick("endsAt", current.endsAt),
  });
  const item = await prisma.announcement.update({ where: { id }, data, include: adminInclude });
  return { item, before: { title: current.title, isPublished: current.isPublished } };
};

export const deleteAnnouncement = async (id: string) => {
  const item = await prisma.announcement.findUnique({ where: { id }, select: { title: true } });
  if (!item) throw new AppError(404, "Announcement not found");
  await prisma.announcement.delete({ where: { id } });
  return item;
};

export const reorderAnnouncements = async (ids: string[]) => {
  const all = await prisma.announcement.findMany({ select: { id: true } });
  const set = new Set(all.map((a) => a.id));
  if (ids.length !== set.size || new Set(ids).size !== ids.length || ids.some((i) => !set.has(i))) {
    throw new AppError(400, "Send every announcement exactly once, in the new order");
  }
  await prisma.$transaction(ids.map((id, order) => prisma.announcement.update({ where: { id }, data: { order } })));
};
