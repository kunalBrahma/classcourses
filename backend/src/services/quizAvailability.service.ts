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
