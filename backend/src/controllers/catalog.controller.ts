import { Request, Response } from "express";
import { QuestionKind, QuestionSource } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import {
  findPublicSubject,
  getPublishedChapters,
  classSelect,
  classSlugFrom,
  sortChaptersInReadingOrder,
} from "../services/catalog.service";
import { publicNoteWhere } from "../services/order.service";

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
      select: { id: true, youtubeId: true, title: true },
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
