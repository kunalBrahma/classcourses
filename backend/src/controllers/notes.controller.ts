import { Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { classSlugFrom } from "../services/catalog.service";
import { requireSetting } from "../services/settings.service";
import { getSignedDownloadUrl } from "../services/storage.service";
import { hasNoteAccess, publicNoteWhere, quotePrice, requirePublicNote } from "../services/order.service";

// Premium / free notes for students. Files are only ever handed out as
// short-lived signed URLs from the PRIVATE bucket.

export const noteListSelect = {
  id: true,
  title: true,
  description: true,
  pricePaise: true,
  isFree: true,
  fileSize: true,
  chapter: { select: { id: true, title: true, slug: true, number: true } },
  subject: { select: { id: true, name: true, slug: true } },
} as const;

const listQuery = z.object({
  medium: z.string().max(80).optional(),
  classSlug: z.string().max(80).optional(),
  subject: z.string().max(80).optional(),
  chapterId: z.string().uuid().optional(),
});

// Adds `owned` for logged-in students (optional auth).
const withOwned = async <T extends { id: string }>(notes: T[], userId?: string) => {
  if (!userId || notes.length === 0) return notes.map((n) => ({ ...n, owned: false }));
  const owned = await prisma.noteAccess.findMany({
    where: { userId, noteId: { in: notes.map((n) => n.id) } },
    select: { noteId: true },
  });
  const set = new Set(owned.map((o) => o.noteId));
  return notes.map((n) => ({ ...n, owned: set.has(n.id) }));
};

// Store listing, filterable by medium / class / subject slug or a chapter.
export const listNotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = listQuery.parse(req.query);
  const subjectFilter: Prisma.SubjectWhereInput = {
    ...(q.medium ? { medium: { slug: q.medium } } : {}),
    ...(q.classSlug ? { classLevel: { slug: classSlugFrom(q.classSlug) } } : {}),
    ...(q.subject ? { slug: q.subject } : {}),
  };
  const hasSubjectFilter = Object.keys(subjectFilter).length > 0;

  const notes = await prisma.note.findMany({
    where: {
      AND: [
        publicNoteWhere,
        q.chapterId ? { chapterId: q.chapterId } : {},
        hasSubjectFilter ? { OR: [{ subject: subjectFilter }, { chapter: { subject: subjectFilter } }] } : {},
      ],
    },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: noteListSelect,
  });
  res.json({ notes: await withOwned(notes, req.user?.userId) });
});

export const getNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  await requirePublicNote(req.params.id);
  const note = await prisma.note.findUniqueOrThrow({ where: { id: req.params.id }, select: noteListSelect });
  const [withFlag] = await withOwned([note], req.user?.userId);
  res.json({ note: withFlag });
});

// Price breakdown for the checkout screen (with / without coins).
export const quoteNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const note = await requirePublicNote(req.params.id);
  if (note.isFree) throw new AppError(400, "This note is free");
  const [user, coins] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId }, select: { coins: true } }),
    requireSetting("coins"),
  ]);
  res.json({
    withoutCoins: quotePrice(note.pricePaise, user.coins, coins, false),
    withCoins: quotePrice(note.pricePaise, user.coins, coins, true),
  });
});

export const downloadNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const note = await requirePublicNote(req.params.id);
  if (!note.isFree && !(await hasNoteAccess(req.user!.userId, note.id))) {
    throw new AppError(403, "Buy this note to download it");
  }
  const storage = await requireSetting("storage");
  const url = await getSignedDownloadUrl(note.fileKey!, undefined, "private", { downloadName: `${note.title}.pdf` });
  res.json({ url, expiresIn: storage.signedUrlTtlSeconds });
});

// The student's library: every note they can download.
export const myNotes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const access = await prisma.noteAccess.findMany({
    where: { userId: req.user!.userId, note: publicNoteWhere },
    orderBy: { grantedAt: "desc" },
    select: { grantedAt: true, note: { select: noteListSelect } },
  });
  res.json({ notes: access.map((a) => ({ ...a.note, owned: true, grantedAt: a.grantedAt })) });
});
