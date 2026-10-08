import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { requireSetting } from "../services/settings.service";
import {
  autoPool,
  checkReadiness,
  customPool,
  draftQuiz,
  drawQuestions,
  QuizInput,
  quizLinksInclude,
  QuizWithLinks,
  resolveRules,
  scheduleStatus,
  validateQuizInput,
} from "../services/quizBuilder.service";

// Admin quiz builder. All quiz rules live in services/quizBuilder.service.ts;
// this file only loads, saves and describes quizzes for the admin UI.

export const QUIZ_INPUT_DEFAULTS: Omit<QuizInput, "title" | "mediumId" | "classId"> = {
  description: null,
  chapterIds: [],
  pickMode: "RANDOM",
  questionCount: null,
  sources: [],
  difficulties: [],
  difficultyMix: null,
  onlyQuizMarked: true,
  questionIds: [],
  secondsPerQuestion: null,
  passMark: null,
  coinsPerPass: null,
  shuffleQuestions: true,
  shuffleOptions: false,
  answerReveal: "AFTER_EACH",
  maxAttemptsPerStudent: null,
  availableFrom: null,
  availableUntil: null,
  isPublished: false,
};

const adminInclude = {
  ...quizLinksInclude,
  medium: { select: { id: true, name: true, slug: true } },
  classLevel: { select: { id: true, name: true, slug: true } },
  subject: { select: { id: true, name: true, slug: true } },
  chapter: { select: { id: true, number: true, title: true } },
} as const satisfies Prisma.QuizInclude;

type AdminQuiz = Prisma.QuizGetPayload<{ include: typeof adminInclude }>;

// Saved quiz → the builder's input shape (so PATCH can merge onto it).
const toInput = (q: AdminQuiz): QuizInput => ({
  title: q.title,
  description: q.description,
  mediumId: q.mediumId,
  classId: q.classLevelId,
  chapterIds: q.chapters.map((c) => c.chapterId),
  pickMode: q.pickMode,
  questionCount: q.questionCount,
  sources: q.sources,
  difficulties: q.difficulties,
  difficultyMix: (q.difficultyMix as QuizInput["difficultyMix"]) ?? null,
  onlyQuizMarked: q.onlyQuizMarked,
  questionIds: q.questions.map((x) => x.questionId),
  secondsPerQuestion: q.secondsPerQuestion,
  passMark: q.passMark,
  coinsPerPass: q.coinsPerPass,
  shuffleQuestions: q.shuffleQuestions,
  shuffleOptions: q.shuffleOptions,
  answerReveal: q.answerReveal,
  maxAttemptsPerStudent: q.maxAttemptsPerStudent,
  availableFrom: q.availableFrom,
  availableUntil: q.availableUntil,
  isPublished: q.isPublished,
});

const requireInput = (body: Partial<QuizInput>): QuizInput => {
  if (!body.title?.trim()) throw new AppError(400, "Give the quiz a title.");
  if (!body.mediumId) throw new AppError(400, "Choose a medium.");
  if (!body.classId) throw new AppError(400, "Choose a class.");
  return { ...QUIZ_INPUT_DEFAULTS, ...body } as QuizInput;
};

const loadQuiz = async (id: string) => {
  const quiz = await prisma.quiz.findUnique({ where: { id }, include: adminInclude });
  if (!quiz) throw new AppError(404, "Quiz not found");
  return quiz;
};

// Live rules + readiness + where students find it, for one quiz.
const describe = async (quiz: QuizWithLinks) => {
  const pool = await customPool(quiz);
  const [readiness, rules] = await Promise.all([checkReadiness(quiz, pool), resolveRules(quiz, pool.length)]);
  return { readiness, rules, status: scheduleStatus(quiz) };
};

const placement = (q: AdminQuiz) =>
  q.chapter
    ? { level: "CHAPTER" as const, label: `Chapter ${q.chapter.number} page` }
    : q.subject
      ? { level: "SUBJECT" as const, label: `${q.subject.name} page` }
      : { level: "CLASS" as const, label: `${q.classLevel.name} page` };

const serialize = async (q: AdminQuiz, stats?: { attempts: number; passRate: number | null }) => {
  const { readiness, rules, status } = await describe(q);
  const { chapters, questions, ...rest } = q;
  return {
    ...rest,
    classId: q.classLevelId,
    chapterIds: chapters.map((c) => c.chapterId),
    questionIds: questions.map((x) => x.questionId),
    placement: placement(q),
    status,
    readiness,
    rules,
    stats: stats ?? null,
  };
};

// Refuses to publish a quiz students couldn't start.
const assertPublishable = async (quiz: QuizWithLinks) => {
  if (!quiz.isPublished) return;
  const readiness = await checkReadiness(quiz, await customPool(quiz));
  if (!readiness.ready) throw new AppError(400, `Fix this before publishing: ${readiness.problems.join(" ")}`);
};

const saveLinks = async (tx: Prisma.TransactionClient, quizId: string, chapterIds: string[], questionIds: string[]) => {
  await tx.quizChapter.deleteMany({ where: { quizId } });
  await tx.quizQuestion.deleteMany({ where: { quizId } });
  if (chapterIds.length) await tx.quizChapter.createMany({ data: chapterIds.map((chapterId) => ({ quizId, chapterId })) });
  if (questionIds.length) await tx.quizQuestion.createMany({ data: questionIds.map((questionId, order) => ({ quizId, questionId, order })) });
};

const passStats = async (quizIds: string[]) => {
  const grouped = await prisma.quizAttempt.groupBy({ by: ["quizId", "status"], where: { quizId: { in: quizIds } }, _count: { _all: true } });
  const out = new Map<string, { attempts: number; passed: number; finished: number }>();
  for (const g of grouped) {
    const row = out.get(g.quizId!) ?? { attempts: 0, passed: 0, finished: 0 };
    row.attempts += g._count._all;
    if (g.status === "PASSED") row.passed += g._count._all;
    if (g.status === "PASSED" || g.status === "FAILED") row.finished += g._count._all;
    out.set(g.quizId!, row);
  }
  return (id: string) => {
    const s = out.get(id);
    return { attempts: s?.attempts ?? 0, passRate: s?.finished ? Math.round((s.passed / s.finished) * 1000) / 10 : null };
  };
};

// ---------------------------------------------------------------------------

export const listQuizzes = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Prisma.QuizWhereInput = {
    ...(q.mediumId ? { mediumId: q.mediumId } : {}),
    ...(q.classId ? { classLevelId: q.classId } : {}),
    ...(q.subjectId ? { chapters: { some: { chapter: { subjectId: q.subjectId } } } } : {}),
    ...(q.chapterId ? { chapters: { some: { chapterId: q.chapterId } } } : {}),
    ...(q.search ? { title: { contains: q.search, mode: "insensitive" } } : {}),
  };
  const quizzes = await prisma.quiz.findMany({ where, include: adminInclude, orderBy: [{ order: "asc" }, { createdAt: "desc" }] });
  const stats = await passStats(quizzes.map((x) => x.id));
  let rows = await Promise.all(quizzes.map((x) => serialize(x, stats(x.id))));

  const counts = {
    all: rows.length,
    LIVE: rows.filter((r) => r.status === "LIVE").length,
    DRAFT: rows.filter((r) => r.status === "DRAFT").length,
    SCHEDULED: rows.filter((r) => r.status === "SCHEDULED").length,
    CLOSED: rows.filter((r) => r.status === "CLOSED").length,
    ATTENTION: rows.filter((r) => !r.readiness.ready).length,
  };
  if (q.status === "ATTENTION") rows = rows.filter((r) => !r.readiness.ready);
  else if (q.status && q.status !== "all") rows = rows.filter((r) => r.status === q.status);
  res.json({ quizzes: rows, counts });
});

export const getQuiz = asyncHandler(async (req: Request, res: Response) => {
  const quiz = await loadQuiz(req.params.id);
  const stats = await passStats([quiz.id]);
  res.json({ quiz: await serialize(quiz, stats(quiz.id)) });
});

export const createQuiz = asyncHandler(async (req: Request, res: Response) => {
  const v = await validateQuizInput(requireInput(req.body));
  await assertPublishable(draftQuiz(v));
  const last = await prisma.quiz.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const id = await prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.create({ data: { ...v.data, order: (last?.order ?? -1) + 1 } });
    await saveLinks(tx, quiz.id, v.chapterIds, v.questionIds);
    return quiz.id;
  });
  res.status(201).json({ quiz: await serialize(await loadQuiz(id)) });
});

export const updateQuiz = asyncHandler(async (req: Request, res: Response) => {
  const existing = await loadQuiz(req.params.id);
  const v = await validateQuizInput({ ...toInput(existing), ...req.body });
  await assertPublishable(draftQuiz(v));
  await prisma.$transaction(async (tx) => {
    await tx.quiz.update({ where: { id: existing.id }, data: v.data });
    await saveLinks(tx, existing.id, v.chapterIds, v.questionIds);
  });
  const stats = await passStats([existing.id]);
  res.json({ quiz: await serialize(await loadQuiz(existing.id), stats(existing.id)) });
});

// Attempts are kept (they hold the quiz title), so reports still make sense.
export const deleteQuiz = asyncHandler(async (req: Request, res: Response) => {
  await loadQuiz(req.params.id);
  await prisma.quiz.delete({ where: { id: req.params.id } });
  res.json({ message: "Quiz deleted" });
});

export const duplicateQuiz = asyncHandler(async (req: Request, res: Response) => {
  const source = await loadQuiz(req.params.id);
  const v = await validateQuizInput({ ...toInput(source), title: `${source.title} (copy)`.slice(0, 160), isPublished: false });
  const id = await prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.create({ data: { ...v.data, order: source.order } });
    await saveLinks(tx, quiz.id, v.chapterIds, v.questionIds);
    return quiz.id;
  });
  res.status(201).json({ quiz: await serialize(await loadQuiz(id)) });
});

export const reorderQuizzes = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  await prisma.$transaction(ids.map((id, order) => prisma.quiz.update({ where: { id }, data: { order } })));
  res.json({ message: "Order saved" });
});

// Builder live panel: counts in the chosen chapters, what matches the
// filters, the resolved rules and readiness — before anything is saved.
export const quizPool = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Partial<QuizInput>;
  const v = await validateQuizInput(requireInput({ title: "draft", ...body }));
  const quiz = draftQuiz(v);
  const all = await prisma.question.findMany({
    where: { chapterId: { in: v.chapterIds }, kind: "MCQ" },
    select: { source: true, difficulty: true, useInQuiz: true, isPublished: true },
  });
  const published = all.filter((q) => q.isPublished);
  const pool = await customPool(quiz);
  const [readiness, rules] = await Promise.all([checkReadiness(quiz, pool), resolveRules(quiz, pool.length)]);
  res.json({
    counts: {
      total: all.length,
      published: published.length,
      quizMarked: published.filter((q) => q.useInQuiz).length,
      bySource: { TEXTBOOK: published.filter((q) => q.source === "TEXTBOOK").length, EXTRA: published.filter((q) => q.source === "EXTRA").length },
      byDifficulty: {
        EASY: published.filter((q) => q.difficulty === "EASY").length,
        MEDIUM: published.filter((q) => q.difficulty === "MEDIUM").length,
        HARD: published.filter((q) => q.difficulty === "HARD").length,
        NONE: published.filter((q) => q.difficulty === null).length,
      },
      matching: pool.length,
      matchingByDifficulty: {
        EASY: pool.filter((q) => q.difficulty === "EASY").length,
        MEDIUM: pool.filter((q) => q.difficulty === "MEDIUM").length,
        HARD: pool.filter((q) => q.difficulty === "HARD").length,
      },
    },
    rules,
    readiness,
  });
});

// One example draw (exactly what a student could get), for "Preview".
export const previewQuiz = asyncHandler(async (req: Request, res: Response) => {
  const v = await validateQuizInput(requireInput({ title: "draft", ...(req.body as Partial<QuizInput>) }));
  const quiz = draftQuiz(v);
  const pool = await customPool(quiz);
  const [readiness, rules] = await Promise.all([checkReadiness(quiz, pool), resolveRules(quiz, pool.length)]);
  const { questionIds, optionOrders } = drawQuestions(quiz, pool, rules.count);
  const rows = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, question: true, options: true, correctIndex: true, source: true, difficulty: true, chapter: { select: { number: true, title: true, subject: { select: { name: true } } } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const questions = questionIds.map((id, i) => {
    const q = byId.get(id)!;
    const options = q.options as string[];
    const order = optionOrders?.[i] ?? null;
    return {
      id,
      question: q.question,
      options: order ? order.map((o) => options[o]) : options,
      correctIndex: q.correctIndex === null ? null : order ? order.indexOf(q.correctIndex) : q.correctIndex,
      source: q.source,
      difficulty: q.difficulty,
      chapter: q.chapter,
    };
  });
  res.json({ questions, rules, readiness });
});

// MCQs of the chosen chapters, for hand-picking.
export const listQuizQuestions = asyncHandler(async (req: Request, res: Response) => {
  const ids = String(req.query.chapterIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500);
  if (!ids.length) return res.json({ questions: [] });
  const search = String(req.query.q ?? "").trim();
  const questions = await prisma.question.findMany({
    where: { chapterId: { in: ids }, kind: "MCQ", ...(search ? { question: { contains: search, mode: "insensitive" } } : {}) },
    select: {
      id: true,
      question: true,
      options: true,
      correctIndex: true,
      source: true,
      difficulty: true,
      isPublished: true,
      useInQuiz: true,
      order: true,
      chapterId: true,
      chapter: { select: { number: true, title: true, order: true, subject: { select: { id: true, name: true } } } },
    },
    orderBy: [{ chapter: { subject: { order: "asc" } } }, { chapter: { order: "asc" } }, { source: "asc" }, { order: "asc" }],
    take: 2000,
  });
  res.json({ questions });
});

// Mark / unmark many MCQs of a chapter as "Use in quiz".
export const flagQuizQuestions = asyncHandler(async (req: Request, res: Response) => {
  const { ids, useInQuiz } = req.body as { ids: string[]; useInQuiz: boolean };
  const result = await prisma.question.updateMany({ where: { id: { in: ids }, chapterId: req.params.chapterId, kind: "MCQ" }, data: { useInQuiz } });
  res.json({ updated: result.count });
});

// The chapter page's quiz panel: its automatic quiz and the custom quizzes using it.
export const chapterQuizOverview = asyncHandler(async (req: Request, res: Response) => {
  const chapter = await prisma.chapter.findUnique({ where: { id: req.params.chapterId }, select: { id: true, autoQuiz: true } });
  if (!chapter) throw new AppError(404, "Chapter not found");
  const global = await requireSetting("quiz");
  const pool = await autoPool(chapter.id);
  const [readiness, rules] = await Promise.all([checkReadiness(null, pool), resolveRules(null)]);
  const quizzes = await prisma.quiz.findMany({
    where: { chapters: { some: { chapterId: chapter.id } } },
    include: adminInclude,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
  const stats = await passStats(quizzes.map((x) => x.id));
  res.json({
    auto: { enabledGlobally: global.autoChapterQuizzes, enabled: chapter.autoQuiz, quizMarked: pool.length, rules, readiness },
    quizzes: await Promise.all(quizzes.map((x) => serialize(x, stats(x.id)))),
  });
});

