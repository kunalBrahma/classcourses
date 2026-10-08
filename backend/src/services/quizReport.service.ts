import { Prisma, QuizStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { AnswerRecord, expireAllStaleAttempts } from "./quiz.service";

// Read-only admin reporting on quiz attempts: list + totals, one attempt
// question by question, and per-chapter / per-question statistics.
// Attempts are never edited from here (coins corrections go through the
// coin ledger on the user's page).

const FINISHED: QuizStatus[] = ["PASSED", "FAILED"];

export interface AttemptFilters {
  status?: QuizStatus | "UNFINISHED";
  mediumId?: string;
  classId?: string;
  subjectId?: string;
  chapterId?: string;
  userId?: string;
  quizId?: string; // a custom quiz, or "auto" = automatic chapter quizzes only
  search?: string; // student name / email
  from?: string; // IST dayKey "YYYY-MM-DD", inclusive
  to?: string;
}

// Medium/class/subject scope works for both kinds of attempt: through the
// attempt's chapter, or (multi-chapter custom quizzes) through the quiz.
const scopeWhere = (f: AttemptFilters): Prisma.QuizAttemptWhereInput | null => {
  if (!f.subjectId && !f.mediumId && !f.classId) return null;
  const subject = {
    ...(f.subjectId ? { id: f.subjectId } : {}),
    ...(f.mediumId ? { mediumId: f.mediumId } : {}),
    ...(f.classId ? { classLevelId: f.classId } : {}),
  };
  return {
    OR: [
      { chapter: { subject } },
      {
        chapterId: null,
        quiz: {
          ...(f.mediumId ? { mediumId: f.mediumId } : {}),
          ...(f.classId ? { classLevelId: f.classId } : {}),
          ...(f.subjectId ? { chapters: { some: { chapter: { subjectId: f.subjectId } } } } : {}),
        },
      },
    ],
  };
};

export const attemptWhere = (f: AttemptFilters): Prisma.QuizAttemptWhereInput => ({
  ...(f.status === "UNFINISHED" ? { status: { in: ["IN_PROGRESS", "PAUSED"] } } : f.status ? { status: f.status } : {}),
  ...(f.userId ? { userId: f.userId } : {}),
  ...(f.chapterId ? { chapterId: f.chapterId } : {}),
  ...(f.quizId ? { quizId: f.quizId === "auto" ? null : f.quizId } : {}),
  ...(f.from || f.to ? { dayKey: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  ...(scopeWhere(f) ?? {}),
  ...(f.search
    ? {
        user: {
          OR: [
            { email: { contains: f.search, mode: "insensitive" } },
            { name: { contains: f.search, mode: "insensitive" } },
          ],
        },
      }
    : {}),
});

const chapterSelect = {
  id: true,
  number: true,
  title: true,
  subject: {
    select: {
      id: true,
      name: true,
      classLevel: { select: { id: true, name: true, slug: true } },
      medium: { select: { id: true, name: true } },
    },
  },
} as const;

const quizSelect = {
  id: true,
  title: true,
  medium: { select: { id: true, name: true } },
  classLevel: { select: { id: true, name: true, slug: true } },
} as const;

const questionCount = (ids: Prisma.JsonValue) => (Array.isArray(ids) ? ids.length : 0);

export const listAttempts = async (filters: AttemptFilters, page: number, pageSize: number) => {
  await expireAllStaleAttempts();
  const where = attemptWhere(filters);

  const [rows, total, byStatus, avg] = await Promise.all([
    prisma.quizAttempt.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        score: true,
        passMark: true,
        coinsAwarded: true,
        dayKey: true,
        startedAt: true,
        finishedAt: true,
        questionIds: true,
        answers: true,
        user: { select: { id: true, name: true, email: true } },
        chapter: { select: chapterSelect },
        quizId: true,
        quizTitle: true,
        quiz: { select: quizSelect },
      },
    }),
    prisma.quizAttempt.count({ where }),
    prisma.quizAttempt.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.quizAttempt.aggregate({ where: { AND: [where, { status: { in: FINISHED } }] }, _avg: { score: true } }),
  ]);

  const count = (s: QuizStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const passed = count("PASSED");
  const failed = count("FAILED");

  return {
    attempts: rows.map(({ questionIds, answers, ...a }) => ({
      ...a,
      totalQuestions: questionCount(questionIds),
      answered: Array.isArray(answers) ? answers.length : 0,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    summary: {
      attempts: total,
      passed,
      failed,
      unfinished: count("IN_PROGRESS") + count("PAUSED"),
      expired: count("EXPIRED"),
      // Pass rate over finished attempts only (unfinished/expired don't count either way).
      passRate: passed + failed > 0 ? Math.round((passed / (passed + failed)) * 1000) / 10 : null,
      averageScore: avg._avg.score === null ? null : Math.round(avg._avg.score * 10) / 10,
    },
  };
};

// One attempt, question by question, in the order the student saw them.
export const getAttemptDetail = async (attemptId: string) => {
  await expireAllStaleAttempts();
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      chapter: { select: chapterSelect },
      quiz: { select: quizSelect },
    },
  });
  if (!attempt) throw new AppError(404, "Quiz attempt not found");

  const ids = (attempt.questionIds as string[]) ?? [];
  const answers = (attempt.answers as unknown as AnswerRecord[]) ?? [];
  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: { id: true, question: true, options: true, correctIndex: true, explanation: true, source: true, chapterId: true },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answerByIndex = new Map(answers.map((a) => [a.index, a]));

  const items = ids.map((id, index) => {
    const q = byId.get(id);
    const a = answerByIndex.get(index);
    const outcome = !a
      ? "NOT_REACHED"
      : a.removed
        ? "REMOVED"
        : a.timedOut
          ? "TIMED_OUT"
          : a.correct
            ? "CORRECT"
            : a.optionIndex === null
              ? "SKIPPED"
              : "WRONG";
    return {
      index,
      questionId: id,
      // null when the question was deleted after the quiz
      question: q ? { html: q.question, options: (q.options as string[]) ?? [], correctIndex: q.correctIndex, explanation: q.explanation, source: q.source } : null,
      chosenIndex: a?.optionIndex ?? null,
      outcome,
      answeredAt: a?.answeredAt ?? null,
    };
  });

  const { questionIds: _ids, answers: _answers, questionDeadline: _deadline, optionOrders: _orders, ...rest } = attempt;
  return { attempt: { ...rest, totalQuestions: ids.length, answered: answers.length }, items };
};

// Per-chapter stats (attempts, pass rate, average score) for the filter;
// with a chapterId, also per-question accuracy — hardest first.
type Tally = { attempts: number; passed: number; failed: number; scoreSum: number; finished: number };

// Sums groupBy rows (key, status) into per-key attempts / pass rate / average score.
const tally = <K extends string>(grouped: { key: K | null; status: QuizStatus; count: number; avg: number | null }[]) => {
  const out = new Map<K, Tally>();
  for (const g of grouped) {
    if (g.key === null) continue;
    const row = out.get(g.key) ?? { attempts: 0, passed: 0, failed: 0, scoreSum: 0, finished: 0 };
    row.attempts += g.count;
    if (g.status === "PASSED") row.passed += g.count;
    if (g.status === "FAILED") row.failed += g.count;
    if (FINISHED.includes(g.status)) {
      row.finished += g.count;
      row.scoreSum += (g.avg ?? 0) * g.count;
    }
    out.set(g.key, row);
  }
  return out;
};

const summarise = (t: Tally) => ({
  attempts: t.attempts,
  passed: t.passed,
  failed: t.failed,
  passRate: t.finished ? Math.round((t.passed / t.finished) * 1000) / 10 : null,
  averageScore: t.finished ? Math.round((t.scoreSum / t.finished) * 10) / 10 : null,
});

// Per-chapter stats (single-chapter attempts) and per-custom-quiz stats for
// the filter; with a chapterId, also per-question accuracy — hardest first,
// counting every quiz that asked that chapter's questions.
export const getQuizStats = async (filters: AttemptFilters) => {
  await expireAllStaleAttempts();
  const where = attemptWhere({ ...filters, status: undefined });

  const [byChapter, byQuiz] = await Promise.all([
    prisma.quizAttempt.groupBy({ by: ["chapterId", "status"], where, _count: { _all: true }, _avg: { score: true } }),
    prisma.quizAttempt.groupBy({
      by: ["quizId", "status"],
      where: { AND: [attemptWhere({ ...filters, status: undefined, chapterId: undefined }), { quizId: { not: null } }] },
      _count: { _all: true },
      _avg: { score: true },
    }),
  ]);

  const perChapter = tally(byChapter.map((g) => ({ key: g.chapterId, status: g.status, count: g._count._all, avg: g._avg.score })));
  const perQuiz = tally(byQuiz.map((g) => ({ key: g.quizId, status: g.status, count: g._count._all, avg: g._avg.score })));

  const [chapters, quizzes] = await Promise.all([
    prisma.chapter.findMany({ where: { id: { in: [...perChapter.keys()] } }, select: chapterSelect }),
    prisma.quiz.findMany({ where: { id: { in: [...perQuiz.keys()] } }, select: { ...quizSelect, isPublished: true } }),
  ]);
  const chapterRows = chapters.map((c) => ({ chapter: c, ...summarise(perChapter.get(c.id)!) })).sort((a, b) => b.attempts - a.attempts);
  const quizRows = quizzes.map((q) => ({ quiz: q, ...summarise(perQuiz.get(q.id)!) })).sort((a, b) => b.attempts - a.attempts);

  let questions: ReturnType<typeof questionStats> | null = null;
  if (filters.chapterId) {
    const attempts = await prisma.quizAttempt.findMany({
      where: {
        AND: [
          attemptWhere({ ...filters, status: undefined, chapterId: undefined }),
          { OR: [{ chapterId: filters.chapterId }, { quiz: { chapters: { some: { chapterId: filters.chapterId } } } }] },
        ],
      },
      select: { questionIds: true, answers: true },
    });
    const qs = await prisma.question.findMany({
      where: { chapterId: filters.chapterId, kind: "MCQ" },
      select: { id: true, question: true, options: true, correctIndex: true, isPublished: true, useInQuiz: true },
    });
    questions = questionStats(attempts, qs);
  }

  return { chapters: chapterRows, quizzes: quizRows, questions };
};

// How each MCQ performed across attempts. The most-picked wrong option is a
// strong hint that the answer key (or the wording) is wrong.
const questionStats = (
  attempts: { questionIds: Prisma.JsonValue; answers: Prisma.JsonValue }[],
  questions: { id: string; question: string; options: Prisma.JsonValue; correctIndex: number | null; isPublished: boolean; useInQuiz: boolean }[]
) => {
  const stats = new Map(questions.map((q) => [q.id, { asked: 0, answered: 0, correct: 0, timedOut: 0, choices: new Map<number, number>() }]));
  for (const a of attempts) {
    const ids = (a.questionIds as string[]) ?? [];
    const answers = (a.answers as unknown as AnswerRecord[]) ?? [];
    for (const ans of answers) {
      const s = stats.get(ids[ans.index]);
      if (!s || ans.removed) continue;
      s.asked += 1;
      if (ans.timedOut) s.timedOut += 1;
      else if (ans.optionIndex !== null) {
        s.answered += 1;
        s.choices.set(ans.optionIndex, (s.choices.get(ans.optionIndex) ?? 0) + 1);
      }
      if (ans.correct) s.correct += 1;
    }
  }

  return questions
    .map((q) => {
      const s = stats.get(q.id)!;
      let topWrong: { index: number; count: number } | null = null;
      for (const [index, count] of s.choices) {
        if (index !== q.correctIndex && (!topWrong || count > topWrong.count)) topWrong = { index, count };
      }
      return {
        questionId: q.id,
        question: q.question,
        options: (q.options as string[]) ?? [],
        correctIndex: q.correctIndex,
        isPublished: q.isPublished,
        useInQuiz: q.useInQuiz,
        asked: s.asked,
        correct: s.correct,
        timedOut: s.timedOut,
        accuracy: s.asked ? Math.round((s.correct / s.asked) * 1000) / 10 : null,
        mostPickedWrong: topWrong,
      };
    })
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.asked - a.asked);
};
