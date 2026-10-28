import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";

// Shared catalog logic: slug lookups and the subject's reading order, which
// drives the mandatory Previous / Next Chapter buttons.

interface OrderableChapter {
  order: number;
  part: { order: number } | null;
}

// Reading order across a subject: chapters without a part first, then each
// part by its own order; inside a group, by chapter.order.
export const sortChaptersInReadingOrder = <T extends OrderableChapter>(chapters: T[]): T[] =>
  [...chapters].sort((a, b) => {
    const pa = a.part ? a.part.order : -1;
    const pb = b.part ? b.part.order : -1;
    return pa - pb || a.order - b.order;
  });

// A class's link part from the URL segment. A bare number ("11") is read as
// "class-11" so old/short links keep working.
export const classSlugFrom = (raw: string): string => {
  const v = String(raw ?? "").trim().toLowerCase();
  return /^\d+$/.test(v) ? `class-${Number(v)}` : v;
};

// What the public site may show: active subject in an active medium and class,
// and (for chapters) published. Reuse these instead of re-listing the rules.
export const publicSubjectWhere = {
  isActive: true,
  medium: { isActive: true },
  classLevel: { isActive: true },
} satisfies Prisma.SubjectWhereInput;

export const publicChapterWhere = {
  isPublished: true,
  subject: publicSubjectWhere,
} satisfies Prisma.ChapterWhereInput;

// Site link for a catalog level: /medium[/class[/subject[/chapter]]]
export const catalogHref = (...slugs: string[]) => `/${slugs.join("/")}`;

// The public shape of a class wherever it appears in an API response.
export const classSelect = { id: true, name: true, nativeName: true, slug: true } as const;

// Resolves /:medium/:class/:subject for public routes; inactive anything → 404.
export const findPublicSubject = async (mediumSlug: string, classRaw: string, subjectSlug: string) => {
  const subject = await prisma.subject.findFirst({
    where: {
      slug: subjectSlug,
      isActive: true,
      medium: { slug: mediumSlug, isActive: true },
      classLevel: { slug: classSlugFrom(classRaw), isActive: true },
    },
    include: {
      medium: { select: { id: true, name: true, nativeName: true, slug: true } },
      classLevel: { select: classSelect },
    },
  });
  if (!subject) {
    throw new AppError(404, "Subject not found");
  }
  return subject;
};

// Published chapters of a subject in reading order, with their part.
export const getPublishedChapters = async (subjectId: string) => {
  const chapters = await prisma.chapter.findMany({
    where: { subjectId, isPublished: true },
    select: {
      id: true,
      number: true,
      title: true,
      slug: true,
      order: true,
      part: { select: { id: true, title: true, order: true } },
    },
  });
  return sortChaptersInReadingOrder(chapters);
};

// Next position for a new item appended to a subject's part (or no-part group).
export const nextChapterOrder = async (subjectId: string, partId: string | null) => {
  const last = await prisma.chapter.findFirst({
    where: { subjectId, partId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
};

export const nextChapterNumber = async (subjectId: string) => {
  const last = await prisma.chapter.findFirst({
    where: { subjectId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
};
