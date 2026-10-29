import { Request, Response } from "express";
import { Prisma, QuestionKind, QuestionSource } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { z } from "zod";
import {
  findPublicSubject,
  getPublishedChapters,
  catalogHref,
  classSelect,
  classSlugFrom,
  publicChapterWhere,
  publicSubjectWhere,
  sortChaptersInReadingOrder,
} from "../services/catalog.service";
import { publicNoteWhere } from "../services/order.service";
import { classQuizCatalog } from "../services/quizAvailability.service";

// Public, read-only catalog for the student site. Anything inactive or
// unpublished is invisible here (404), never partially shown.

const mediumSelect = { id: true, name: true, nativeName: true, slug: true } as const;

export const listMediums = asyncHandler(async (_req: Request, res: Response) => {
  const mediums = await prisma.medium.findMany({
    where: { isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: mediumSelect,
  });
  res.json({ mediums });
});

// A class is listed for a medium only if that medium has an active subject in it.
export const getMediumClasses = asyncHandler(async (req: Request, res: Response) => {
  const medium = await prisma.medium.findFirst({
    where: { slug: req.params.medium, isActive: true },
    select: mediumSelect,
  });
  if (!medium) {
    throw new AppError(404, "Medium not found");
  }

  const classes = await prisma.classLevel.findMany({
    where: { isActive: true, subjects: { some: { mediumId: medium.id, isActive: true } } },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      ...classSelect,
      _count: { select: { subjects: { where: { mediumId: medium.id, isActive: true } } } },
    },
  });

  res.json({
    medium,
    classes: classes.map(({ _count, ...c }) => ({ ...c, subjectCount: _count.subjects })),
  });
});

// Subjects of a class with their chapters grouped by part — feeds the
// "tap a subject → dropdown of chapters" UI in one request.
export const getClassSubjects = asyncHandler(async (req: Request, res: Response) => {
  const medium = await prisma.medium.findFirst({
    where: { slug: req.params.medium, isActive: true },
    select: mediumSelect,
  });
  const classLevel = await prisma.classLevel.findFirst({ where: { slug: classSlugFrom(req.params.classSlug), isActive: true }, select: classSelect });
  if (!medium || !classLevel) {
    throw new AppError(404, "Class not found");
  }

  const subjects = await prisma.subject.findMany({
    where: { mediumId: medium.id, classLevelId: classLevel.id, isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nativeName: true,
      slug: true,
      parts: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true } },
      chapters: {
        where: { isPublished: true },
        select: {
          id: true,
          number: true,
          title: true,
          slug: true,
          order: true,
          partId: true,
          part: { select: { order: true } },
        },
      },
    },
  });

  if (subjects.length === 0) {
    throw new AppError(404, "Class not found");
  }

  res.json({
    medium,
    classLevel,
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      nativeName: s.nativeName,
      slug: s.slug,
      chapterCount: s.chapters.length,
      groups: groupByPart(s.parts, s.chapters),
    })),
  });
});

export const getSubject = asyncHandler(async (req: Request, res: Response) => {
  const subject = await findPublicSubject(req.params.medium, req.params.classSlug, req.params.subject);
  const [parts, chapters] = await Promise.all([
    prisma.subjectPart.findMany({
      where: { subjectId: subject.id },
      orderBy: { order: "asc" },
      select: { id: true, title: true, order: true },
    }),
    prisma.chapter.findMany({
      where: { subjectId: subject.id, isPublished: true },
      select: {
        id: true,
        number: true,
        title: true,
        slug: true,
        order: true,
        partId: true,
        part: { select: { order: true } },
      },
    }),
  ]);

  res.json({
    subject: {
      id: subject.id,
      name: subject.name,
      nativeName: subject.nativeName,
      slug: subject.slug,
      medium: subject.medium,
      classLevel: subject.classLevel,
      chapterCount: chapters.length,
      groups: groupByPart(parts, chapters),
    },
  });
});

// A chapter page, with the mandatory Previous / Next Chapter links.
export const getChapter = asyncHandler(async (req: Request, res: Response) => {
  const subject = await findPublicSubject(req.params.medium, req.params.classSlug, req.params.subject);
  const chapter = await prisma.chapter.findFirst({
    where: { subjectId: subject.id, slug: req.params.chapter, isPublished: true },
    select: {
      id: true,
      number: true,
      title: true,
      slug: true,
      aboutHtml: true,
      part: { select: { id: true, title: true } },
      updatedAt: true,
    },
  });
  if (!chapter) {
    throw new AppError(404, "Chapter not found");
  }

  const [ordered, questions, videos, notes] = await Promise.all([
    getPublishedChapters(subject.id),
    prisma.question.findMany({
      where: { chapterId: chapter.id, isPublished: true },
      orderBy: { order: "asc" },
      // correctIndex and explanation are deliberately NOT selected for MCQs:
      // the quiz reuses these questions. Use POST /questions/:id/check to reveal.
      select: { id: true, kind: true, source: true, question: true, answer: true, options: true, difficulty: true },
    }),
    prisma.video.findMany({
      where: { chapterId: chapter.id },
      orderBy: { order: "asc" },
      select: { id: true, youtubeId: true, format: true, title: true },
    }),
    prisma.note.findMany({
      where: { AND: [publicNoteWhere, { OR: [{ chapterId: chapter.id }, { subjectId: subject.id, chapterId: null }] }] },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      select: { id: true, title: true, description: true, pricePaise: true, isFree: true, chapterId: true },
    }),
  ]);
  const index = ordered.findIndex((c) => c.id === chapter.id);
  const link = (c: (typeof ordered)[number] | undefined) =>
    c ? { number: c.number, title: c.title, slug: c.slug, partTitle: c.part?.title ?? null } : null;

  res.json({
    chapter,
    subject: { id: subject.id, name: subject.name, nativeName: subject.nativeName, slug: subject.slug },
    medium: subject.medium,
    classLevel: subject.classLevel,
    // null on the first / last chapter → the client disables that button
    content: groupContent(questions),
    videos,
    // Chapter notes + whole-subject notes. Ownership: GET /api/notes?chapterId=… (with login)
    notes: notes.map(({ chapterId, ...n }) => ({ ...n, scope: chapterId ? "chapter" : "subject" })),
    prev: link(ordered[index - 1]),
    next: link(ordered[index + 1]),
    position: { index: index + 1, total: ordered.length },
  });
});

type PublicQuestion = {
  id: string;
  kind: QuestionKind;
  source: QuestionSource;
  question: string;
  answer: string | null;
  options: unknown;
  difficulty: string | null;
};

// { textbook: { qa, mcq }, extra: { qa, mcq } } — the sections of the chapter page.
const groupContent = (questions: PublicQuestion[]) => {
  const pick = (source: QuestionSource, kind: QuestionKind) =>
    questions
      .filter((q) => q.source === source && q.kind === kind)
      .map((q) =>
        kind === "QA"
          ? { id: q.id, question: q.question, answer: q.answer, difficulty: q.difficulty }
          : { id: q.id, question: q.question, options: q.options as string[], difficulty: q.difficulty }
      );
  return {
    textbook: { qa: pick("TEXTBOOK", "QA"), mcq: pick("TEXTBOOK", "MCQ") },
    extra: { qa: pick("EXTRA", "QA"), mcq: pick("EXTRA", "MCQ") },
  };
};

// "Tap to reveal" for practice MCQs: answers one question at a time.
export const checkAnswer = asyncHandler(async (req: Request, res: Response) => {
  const question = await prisma.question.findFirst({
    where: {
      id: req.params.id,
      kind: "MCQ",
      isPublished: true,
      chapter: {
        isPublished: true,
        subject: { isActive: true, medium: { isActive: true }, classLevel: { isActive: true } },
      },
    },
    select: { options: true, correctIndex: true, explanation: true },
  });
  if (!question) throw new AppError(404, "Question not found");

  const { optionIndex } = req.body as { optionIndex: number };
  if (optionIndex >= (question.options as string[]).length) {
    throw new AppError(400, "That option doesn't exist");
  }
  res.json({
    correct: optionIndex === question.correctIndex,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
  });
});

interface PartLite {
  id: string;
  title: string;
  order: number;
}
interface ChapterLite {
  id: string;
  number: number;
  title: string;
  slug: string;
  order: number;
  partId: string | null;
  part: { order: number } | null;
}

// Chapters without a part come first as a group with `part: null`, then one
// group per part (empty parts are skipped for students).
const groupByPart = (parts: PartLite[], chapters: ChapterLite[]) => {
  const sorted = sortChaptersInReadingOrder(chapters);
  const strip = (c: ChapterLite) => ({ id: c.id, number: c.number, title: c.title, slug: c.slug });
  const groups: { part: { id: string; title: string } | null; chapters: ReturnType<typeof strip>[] }[] = [];

  const loose = sorted.filter((c) => !c.partId);
  if (loose.length) groups.push({ part: null, chapters: loose.map(strip) });

  for (const part of [...parts].sort((a, b) => a.order - b.order)) {
    const inPart = sorted.filter((c) => c.partId === part.id);
    if (inPart.length) groups.push({ part: { id: part.id, title: part.title }, chapters: inPart.map(strip) });
  }
  return groups;
};

// ===========================================================================
// Home page videos
// ===========================================================================

// Videos the admin put on the home page, newest first, from visible chapters only.
const videoSelect = {
  id: true,
  youtubeId: true,
  format: true,
  title: true,
  createdAt: true,
  chapter: {
    select: {
      title: true,
      number: true,
      slug: true,
      subject: {
        select: {
          name: true,
          nativeName: true,
          slug: true,
          medium: { select: { slug: true } },
          classLevel: { select: { name: true, slug: true } },
        },
      },
    },
  },
} satisfies Prisma.VideoSelect;

const videoView = ({ chapter: { subject, ...chapter }, ...v }: Prisma.VideoGetPayload<{ select: typeof videoSelect }>) => ({
  ...v,
  chapter: {
    title: chapter.title,
    number: chapter.number,
    href: catalogHref(subject.medium.slug, subject.classLevel.slug, subject.slug, chapter.slug),
  },
  subject: { name: subject.name, nativeName: subject.nativeName },
  classLevel: { name: subject.classLevel.name, slug: subject.classLevel.slug },
});

export const featuredVideos = asyncHandler(async (_req: Request, res: Response) => {
  const videos = await prisma.video.findMany({
    where: { featuredAt: { not: null }, chapter: publicChapterWhere },
    orderBy: { featuredAt: "desc" },
    take: 12,
    select: videoSelect,
  });
  res.json({ videos: videos.map(videoView) });
});

// The /videos page: every video on a public chapter, newest first, optionally
// for one medium, class and shape (Shorts / long videos). Also returns the
// classes that have videos, for the class filter.
const videoListQuery = z.object({
  medium: z.string().trim().max(80).optional(),
  classSlug: z.string().trim().max(80).optional(),
  format: z.enum(["LANDSCAPE", "SHORT"]).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
const VIDEOS_PER_PAGE = 24;

export const listVideos = asyncHandler(async (req: Request, res: Response) => {
  const q = videoListQuery.parse(req.query);
  const mediumWhere: Prisma.ChapterWhereInput = q.medium ? { subject: { medium: { slug: q.medium } } } : {};
  const where: Prisma.VideoWhereInput = {
    format: q.format,
    chapter: {
      AND: [
        publicChapterWhere,
        mediumWhere,
        q.classSlug ? { subject: { classLevel: { slug: classSlugFrom(q.classSlug) } } } : {},
      ],
    },
  };
  const [videos, total, classRows] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (q.page - 1) * VIDEOS_PER_PAGE,
      take: VIDEOS_PER_PAGE,
      select: videoSelect,
    }),
    prisma.video.count({ where }),
    prisma.classLevel.findMany({
      where: { subjects: { some: { chapters: { some: { AND: [publicChapterWhere, mediumWhere, { videos: { some: {} } }] } } } } },
      orderBy: { order: "asc" },
      select: { name: true, slug: true },
    }),
  ]);
  res.json({
    videos: videos.map(videoView),
    total,
    page: q.page,
    totalPages: Math.max(1, Math.ceil(total / VIDEOS_PER_PAGE)),
    classes: classRows,
  });
});

// Home page "Start Quiz" picker: every quiz in one medium + class.
const quizPickerQuery = z.object({ medium: z.string().trim().min(1).max(80), classSlug: z.string().trim().min(1).max(80) });

export const quizPicker = asyncHandler(async (req: Request, res: Response) => {
  const q = quizPickerQuery.parse(req.query);
  const catalog = await classQuizCatalog(q.medium, classSlugFrom(q.classSlug));
  if (!catalog) throw new AppError(404, "Class not found");
  res.json({
    ...catalog,
    subjects: catalog.subjects.map((s) => ({
      ...s,
      chapters: s.chapters.map(({ slug, ...c }) => ({ ...c, href: catalogHref(catalog.medium.slug, catalog.classLevel.slug, s.slug, slug) })),
    })),
  });
});

// Site-wide totals for the About page ("920 chapters · 600 MCQs …"): only
// what students can actually see.
export const catalogStats = asyncHandler(async (_req: Request, res: Response) => {
  const visibleQuestion = { isPublished: true, chapter: publicChapterWhere };
  const [classes, subjects, chapters, qa, mcq, videos] = await Promise.all([
    prisma.classLevel.count({ where: { isActive: true, subjects: { some: publicSubjectWhere } } }),
    prisma.subject.count({ where: publicSubjectWhere }),
    prisma.chapter.count({ where: publicChapterWhere }),
    prisma.question.count({ where: { ...visibleQuestion, kind: "QA" } }),
    prisma.question.count({ where: { ...visibleQuestion, kind: "MCQ" } }),
    prisma.video.count({ where: { chapter: publicChapterWhere } }),
  ]);
  res.json({ stats: { classes, subjects, chapters, qa, mcq, videos } });
});

// ===========================================================================
// Search
// ===========================================================================

const searchQuery = z.object({ q: z.string().trim().min(2).max(60) });
const SEARCH_LIMIT = 20;

type SearchResult = {
  type: "medium" | "class" | "subject" | "chapter";
  label: string;
  nativeLabel: string | null;
  context: string;
  href: string;
};

// Names in English or Assamese, broad matches first (medium → class → subject → chapter).
export const search = asyncHandler(async (req: Request, res: Response) => {
  const { q } = searchQuery.parse(req.query);
  const match = { contains: q, mode: "insensitive" } as const;
  const named = { OR: [{ name: match }, { nativeName: match }] };

  const [mediums, classes, subjects, chapters] = await Promise.all([
    prisma.medium.findMany({
      where: { isActive: true, ...named },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      take: SEARCH_LIMIT,
      select: { name: true, nativeName: true, slug: true },
    }),
    // A class appears once per medium that teaches it (the class page is per medium).
    prisma.subject.findMany({
      where: { ...publicSubjectWhere, classLevel: { isActive: true, ...named } },
      distinct: ["mediumId", "classLevelId"],
      orderBy: [{ medium: { order: "asc" } }, { classLevel: { order: "asc" } }],
      take: SEARCH_LIMIT,
      select: {
        medium: { select: { name: true, slug: true } },
        classLevel: { select: { name: true, nativeName: true, slug: true } },
      },
    }),
    prisma.subject.findMany({
      where: { ...publicSubjectWhere, ...named },
      orderBy: [{ medium: { order: "asc" } }, { classLevel: { order: "asc" } }, { order: "asc" }],
      take: SEARCH_LIMIT,
      select: {
        name: true,
        nativeName: true,
        slug: true,
        medium: { select: { name: true, slug: true } },
        classLevel: { select: { name: true, slug: true } },
      },
    }),
    prisma.chapter.findMany({
      where: { ...publicChapterWhere, title: match },
      orderBy: [{ subject: { medium: { order: "asc" } } }, { subject: { classLevel: { order: "asc" } } }, { number: "asc" }],
      take: SEARCH_LIMIT,
      select: {
        number: true,
        title: true,
        slug: true,
        subject: {
          select: {
            name: true,
            slug: true,
            medium: { select: { name: true, slug: true } },
            classLevel: { select: { name: true, slug: true } },
          },
        },
      },
    }),
  ]);

  const results: SearchResult[] = [
    ...mediums.map((m) => ({ type: "medium" as const, label: m.name, nativeLabel: m.nativeName, context: "Medium", href: catalogHref(m.slug) })),
    ...classes.map(({ medium, classLevel }) => ({
      type: "class" as const,
      label: classLevel.name,
      nativeLabel: classLevel.nativeName,
      context: medium.name,
      href: catalogHref(medium.slug, classLevel.slug),
    })),
    ...subjects.map((s) => ({
      type: "subject" as const,
      label: s.name,
      nativeLabel: s.nativeName,
      context: `${s.medium.name} · ${s.classLevel.name}`,
      href: catalogHref(s.medium.slug, s.classLevel.slug, s.slug),
    })),
    ...chapters.map(({ subject: s, ...c }) => ({
      type: "chapter" as const,
      label: `Chapter ${c.number}: ${c.title}`,
      nativeLabel: null,
      context: `${s.medium.name} · ${s.classLevel.name} · ${s.name}`,
      href: catalogHref(s.medium.slug, s.classLevel.slug, s.slug, c.slug),
    })),
  ];

  res.json({ q, results: results.slice(0, SEARCH_LIMIT) });
});
