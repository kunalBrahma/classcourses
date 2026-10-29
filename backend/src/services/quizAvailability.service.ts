import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { istDayKey } from "../utils/istDate";
import { requireSetting } from "./settings.service";
import { autoPool, checkReadiness, customPool, quizLinksInclude, QuizWithLinks, resolveRules, scheduleStatus } from "./quizBuilder.service";

// Which quizzes a student sees on a page. A custom quiz lives on the most
// specific page that holds all its chapters: its one chapter, its one
// subject, or the class page of its medium. Quizzes that aren't ready (too
// few questions etc.) or have closed are left out; scheduled ones are listed
// with their opening time.

export interface Place {
  chapterId?: string;
  subjectId?: string;
  mediumId?: string;
  classId?: string;
  classSlug?: string;
}

const visibleScope = { medium: { isActive: true }, classLevel: { isActive: true } } as const;

export const availableQuizzes = async (userId: string | null, place: Place) => {
  const where: Prisma.QuizWhereInput = place.chapterId
    ? { chapterId: place.chapterId }
    : place.subjectId
      ? { subjectId: place.subjectId, chapterId: null }
      : { mediumId: place.mediumId, ...(place.classId ? { classLevelId: place.classId } : { classLevel: { slug: place.classSlug } }), subjectId: null };

  const custom = await prisma.quiz.findMany({
    where: { ...where, ...visibleScope, isPublished: true },
    include: quizLinksInclude,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const dayKey = istDayKey();
  const usage = async (match: Prisma.QuizAttemptWhereInput) => {
    if (!userId) return { used: 0, resumeAttemptId: null };
    const [used, open] = await Promise.all([
      prisma.quizAttempt.count({ where: { userId, ...match } }),
      prisma.quizAttempt.findFirst({ where: { userId, dayKey, status: { in: ["IN_PROGRESS", "PAUSED"] }, ...match }, select: { id: true } }),
    ]);
    return { used, resumeAttemptId: open?.id ?? null };
  };

  const describe = async (quiz: QuizWithLinks | null, chapterId?: string) => {
    const pool = quiz ? await customPool(quiz) : await autoPool(chapterId!);
    const readiness = await checkReadiness(quiz, pool);
    if (!readiness.ready) return null;
    const rules = await resolveRules(quiz, pool.length);
    const status = quiz ? scheduleStatus(quiz) : "LIVE";
    if (status === "CLOSED" || status === "DRAFT") return null;
    const u = await usage(quiz ? { quizId: quiz.id } : { chapterId, quizId: null });
    const max = quiz?.maxAttemptsPerStudent ?? null;
    return {
      id: quiz?.id ?? "auto",
      kind: quiz ? ("CUSTOM" as const) : ("CHAPTER" as const),
      title: quiz?.title ?? "Chapter quiz",
      description: quiz?.description ?? null,
      chapterCount: quiz ? quiz.chapters.length : 1,
      questions: rules.count,
      secondsPerQuestion: rules.secondsPerQuestion,
      passMark: Math.min(rules.passMark, rules.count),
      coinsPerPass: rules.coinsPerPass,
      answerReveal: quiz?.answerReveal ?? "AFTER_EACH",
      status,
      opensAt: quiz?.availableFrom?.toISOString() ?? null,
      closesAt: quiz?.availableUntil?.toISOString() ?? null,
      attemptsUsed: u.used,
      attemptsLeft: max === null ? null : Math.max(0, max - u.used),
      resumeAttemptId: u.resumeAttemptId,
    };
  };

  const out = [];
  if (place.chapterId) {
    const [global, chapter] = await Promise.all([
      requireSetting("quiz"),
      prisma.chapter.findFirst({
        where: {
          id: place.chapterId,
          isPublished: true,
          subject: { isActive: true, medium: { isActive: true }, classLevel: { isActive: true } },
        },
        select: { autoQuiz: true },
      }),
    ]);
    if (!chapter) return [];
    if (global.autoChapterQuizzes && chapter.autoQuiz) {
      const auto = await describe(null, place.chapterId);
      if (auto) out.push(auto);
    }
  }
  for (const quiz of custom) {
    const row = await describe(quiz);
    if (row) out.push(row);
  }
  return out;
};

// Every quiz a student can start in one medium + class, for the home page
// "Start Quiz" picker: class tests, subject quizzes and chapter quizzes,
// grouped by subject. Readiness and visibility come from availableQuizzes()
// above; the chapter query only narrows down which chapters to ask about.
export const classQuizCatalog = async (mediumSlug: string, classSlug: string) => {
  const [medium, classLevel] = await Promise.all([
    prisma.medium.findFirst({ where: { slug: mediumSlug, isActive: true }, select: { id: true, slug: true, name: true } }),
    prisma.classLevel.findFirst({ where: { slug: classSlug, isActive: true }, select: { id: true, slug: true, name: true } }),
  ]);
  if (!medium || !classLevel) return null;

  const subjects = await prisma.subject.findMany({
    where: { mediumId: medium.id, classLevelId: classLevel.id, isActive: true },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      nativeName: true,
      slug: true,
      chapters: {
        // Chapters with at least one quiz MCQ, or a custom quiz of their own.
        where: {
          isPublished: true,
          OR: [{ questions: { some: { kind: "MCQ", isPublished: true, useInQuiz: true } } }, { homeQuizzes: { some: { isPublished: true } } }],
        },
        orderBy: [{ number: "asc" }, { order: "asc" }],
        select: { id: true, number: true, title: true, slug: true },
      },
    },
  });

  const classQuizzes = await availableQuizzes(null, { mediumId: medium.id, classId: classLevel.id });
  const groups = [];
  for (const subject of subjects) {
    const subjectQuizzes = await availableQuizzes(null, { subjectId: subject.id });
    const chapters = [];
    for (const chapter of subject.chapters) {
      const quizzes = await availableQuizzes(null, { chapterId: chapter.id });
      if (quizzes.length) chapters.push({ id: chapter.id, number: chapter.number, title: chapter.title, slug: chapter.slug, quizzes });
    }
    if (subjectQuizzes.length || chapters.length) {
      groups.push({ id: subject.id, name: subject.name, nativeName: subject.nativeName, slug: subject.slug, quizzes: subjectQuizzes, chapters });
    }
  }
  return { medium, classLevel, quizzes: classQuizzes, subjects: groups };
};
