import crypto from "crypto";
import { Difficulty, Prisma, Quiz, QuestionSource } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { requireSetting } from "./settings.service";

// Every quiz rule in one place, shared by the admin builder (live counts,
// readiness warnings, preview) and the student engine (quiz.service.ts):
//   - the AUTOMATIC chapter quiz: random published MCQs marked "Use in quiz"
//     from one chapter, with the global Settings → Quiz & coins rules
//   - CUSTOM quizzes (Quiz model): any chapters of one medium + class, random
//     (filters / difficulty mix) or hand-picked, every rule overridable
// Readiness problems are written for the admin and shown to students as-is,
// so keep them plain English.

export const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];
const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: "easy", MEDIUM: "medium", HARD: "hard" };

export type DifficultyMix = Partial<Record<Difficulty, number>>;

export type QuizWithLinks = Quiz & {
  chapters: { chapterId: string }[];
  questions: { questionId: string; order: number }[];
};

export const quizLinksInclude = {
  chapters: { select: { chapterId: true } },
  questions: { select: { questionId: true, order: true }, orderBy: { order: "asc" } },
} as const satisfies Prisma.QuizInclude;

export interface QuizRules {
  count: number;
  secondsPerQuestion: number;
  passMark: number;
  coinsPerPass: number;
}

export interface PoolQuestion {
  id: string;
  difficulty: Difficulty | null;
  optionCount: number;
}

export interface Readiness {
  ready: boolean;
  // Blocking: students can't start the quiz until these are fixed.
  problems: string[];
  // Worth knowing, not blocking.
  warnings: string[];
  poolSize: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const mixOf = (quiz: Pick<Quiz, "difficultyMix">): DifficultyMix | null => {
  const mix = quiz.difficultyMix as DifficultyMix | null;
  if (!mix) return null;
  const clean = Object.fromEntries(DIFFICULTIES.filter((d) => (mix[d] ?? 0) > 0).map((d) => [d, mix[d]!])) as DifficultyMix;
  return Object.keys(clean).length ? clean : null;
};

const mixTotal = (mix: DifficultyMix) => DIFFICULTIES.reduce((sum, d) => sum + (mix[d] ?? 0), 0);

// ---------------------------------------------------------------------------
// Rules (quiz overrides → global settings)
// ---------------------------------------------------------------------------

// A custom quiz's question count: hand-picked = all picked; random = its own
// count, else the mix total, else the global default.
const countFor = (quiz: QuizWithLinks | null, globalCount: number, fixedPoolSize: number) => {
  if (!quiz) return globalCount;
  if (quiz.pickMode === "FIXED") return fixedPoolSize;
  const mix = mixOf(quiz);
  return quiz.questionCount ?? (mix ? mixTotal(mix) : globalCount);
};

// Default pass mark keeps the global ratio (7 of 10 → 14 of 20), rounded up.
export const defaultPassMark = (count: number, global: { passMark: number; questionsPerQuiz: number }) =>
  Math.max(1, Math.min(count, Math.ceil((count * global.passMark) / global.questionsPerQuiz)));

export const resolveRules = async (quiz: QuizWithLinks | null, fixedPoolSize = 0): Promise<QuizRules> => {
  const [global, coins] = await Promise.all([requireSetting("quiz"), requireSetting("coins")]);
  const count = countFor(quiz, global.questionsPerQuiz, fixedPoolSize);
  return {
    count,
    secondsPerQuestion: quiz?.secondsPerQuestion ?? global.secondsPerQuestion,
    passMark: quiz?.passMark ?? (quiz ? defaultPassMark(count, global) : Math.min(global.passMark, count)),
    coinsPerPass: quiz?.coinsPerPass ?? coins.perPass,
  };
};

// ---------------------------------------------------------------------------
// Question pools
// ---------------------------------------------------------------------------

const toPool = (rows: { id: string; difficulty: Difficulty | null; options: Prisma.JsonValue }[]): PoolQuestion[] =>
  rows.map((q) => ({ id: q.id, difficulty: q.difficulty, optionCount: Array.isArray(q.options) ? q.options.length : 0 }));

const poolSelect = { id: true, difficulty: true, options: true } as const;

export const randomPoolWhere = (
  chapterIds: string[],
  f: { sources?: QuestionSource[]; difficulties?: Difficulty[]; onlyQuizMarked?: boolean }
): Prisma.QuestionWhereInput => ({
  chapterId: { in: chapterIds },
  kind: "MCQ",
  isPublished: true,
  ...(f.sources?.length ? { source: { in: f.sources } } : {}),
  ...(f.difficulties?.length ? { difficulty: { in: f.difficulties } } : {}),
  ...(f.onlyQuizMarked ? { useInQuiz: true } : {}),
});

// The automatic chapter quiz draws from these.
export const autoPool = async (chapterId: string) =>
  toPool(await prisma.question.findMany({ where: randomPoolWhere([chapterId], { onlyQuizMarked: true }), select: poolSelect }));

// Custom quiz pool. Hand-picked quizzes keep the admin's order and skip
// questions that were unpublished since.
export const customPool = async (quiz: QuizWithLinks): Promise<PoolQuestion[]> => {
  if (quiz.pickMode === "FIXED") {
    const ids = quiz.questions.map((q) => q.questionId);
    const rows = await prisma.question.findMany({ where: { id: { in: ids }, kind: "MCQ", isPublished: true }, select: poolSelect });
    const byId = new Map(toPool(rows).map((q) => [q.id, q]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }
  return toPool(
    await prisma.question.findMany({
      where: randomPoolWhere(
        quiz.chapters.map((c) => c.chapterId),
        quiz
      ),
      select: poolSelect,
    })
  );
};

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export const checkReadiness = async (quiz: QuizWithLinks | null, pool: PoolQuestion[]): Promise<Readiness> => {
  const rules = await resolveRules(quiz, pool.length);
  const problems: string[] = [];
  const warnings: string[] = [];

  if (quiz && quiz.chapters.length === 0) problems.push("Choose at least one chapter.");

  if (quiz?.pickMode === "FIXED") {
    if (quiz.questions.length === 0) problems.push("Pick the questions for this quiz.");
    const skipped = quiz.questions.length - pool.length;
    if (quiz.questions.length > 0 && pool.length === 0) problems.push("All the picked questions are unpublished.");
    else if (skipped > 0) warnings.push(`${plural(skipped, "picked question")} ${skipped === 1 ? "is" : "are"} unpublished and will be skipped.`);
  } else {
    const mix = quiz ? mixOf(quiz) : null;
    if (mix) {
      const total = mixTotal(mix);
      if (total !== rules.count) problems.push(`The easy/medium/hard mix adds up to ${total}, but the quiz has ${rules.count} questions.`);
      for (const d of DIFFICULTIES) {
        const want = mix[d] ?? 0;
        const have = pool.filter((q) => q.difficulty === d).length;
        if (want > have) problems.push(`The mix asks for ${want} ${DIFFICULTY_LABEL[d]} but only ${have} matching ${DIFFICULTY_LABEL[d]} ${have === 1 ? "question exists" : "questions exist"}.`);
      }
    } else if (pool.length < rules.count) {
      problems.push(`Only ${plural(pool.length, "matching question")} — needs ${rules.count}.`);
    }
    if (pool.length > 0 && pool.length === rules.count) warnings.push("Every attempt gets the same questions — add more for variety.");
  }

  if (rules.passMark > rules.count) problems.push(`Pass mark ${rules.passMark} is more than the ${plural(rules.count, "question")}.`);
  if (rules.count === 0 && !problems.length) problems.push("This quiz has no questions.");

  return { ready: problems.length === 0, problems, warnings, poolSize: pool.length };
};

// Draft / scheduled / live / closed, from the publish switch and the window.
export type QuizStatusLabel = "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED";
export const scheduleStatus = (quiz: Pick<Quiz, "isPublished" | "availableFrom" | "availableUntil">, now = new Date()): QuizStatusLabel => {
  if (!quiz.isPublished) return "DRAFT";
  if (quiz.availableUntil && quiz.availableUntil <= now) return "CLOSED";
  if (quiz.availableFrom && quiz.availableFrom > now) return "SCHEDULED";
  return "LIVE";
};

// ---------------------------------------------------------------------------
// Drawing an attempt's questions
// ---------------------------------------------------------------------------

export const shuffle = <T>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const drawQuestions = (quiz: QuizWithLinks | null, pool: PoolQuestion[], count: number) => {
  let picked: PoolQuestion[];
  if (quiz?.pickMode === "FIXED") {
    picked = quiz.shuffleQuestions ? shuffle(pool) : pool;
  } else {
    const mix = quiz ? mixOf(quiz) : null;
    picked = mix
      ? shuffle(DIFFICULTIES.flatMap((d) => shuffle(pool.filter((q) => q.difficulty === d)).slice(0, mix[d] ?? 0)))
      : shuffle(pool).slice(0, count);
  }
  // display position → original option index, per question
  const optionOrders = quiz?.shuffleOptions ? picked.map((q) => shuffle(Array.from({ length: q.optionCount }, (_, i) => i))) : null;
  return { questionIds: picked.map((q) => q.id), optionOrders };
};

// ---------------------------------------------------------------------------
// Admin input → validated, normalised quiz data
// ---------------------------------------------------------------------------

export interface QuizInput {
  title: string;
  description?: string | null;
  mediumId: string;
  classId: string;
  chapterIds: string[];
  pickMode: "RANDOM" | "FIXED";
  questionCount?: number | null;
  sources: QuestionSource[];
  difficulties: Difficulty[];
  difficultyMix?: DifficultyMix | null;
  onlyQuizMarked: boolean;
  questionIds: string[];
  secondsPerQuestion?: number | null;
  passMark?: number | null;
  coinsPerPass?: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  answerReveal: "AFTER_EACH" | "AT_END" | "NEVER";
  maxAttemptsPerStudent?: number | null;
  availableFrom?: Date | null;
  availableUntil?: Date | null;
  isPublished: boolean;
}

export const validateQuizInput = async (input: QuizInput) => {
  const [medium, classLevel] = await Promise.all([
    prisma.medium.findUnique({ where: { id: input.mediumId }, select: { id: true } }),
    prisma.classLevel.findUnique({ where: { id: input.classId }, select: { id: true } }),
  ]);
  if (!medium) throw new AppError(400, "Choose a medium.");
  if (!classLevel) throw new AppError(400, "Choose a class.");

  const chapterIds = [...new Set(input.chapterIds)];
  const chapters = await prisma.chapter.findMany({
    where: { id: { in: chapterIds } },
    select: { id: true, subjectId: true, subject: { select: { mediumId: true, classLevelId: true } } },
  });
  if (chapters.length !== chapterIds.length) throw new AppError(400, "Some chosen chapters no longer exist. Reload and try again.");
  if (chapters.some((c) => c.subject.mediumId !== medium.id || c.subject.classLevelId !== classLevel.id)) {
    throw new AppError(400, "All chapters must be from the chosen medium and class.");
  }

  let questionIds: string[] = [];
  if (input.pickMode === "FIXED") {
    questionIds = [...new Set(input.questionIds)];
    const found = await prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, kind: true, chapterId: true } });
    if (found.length !== questionIds.length) throw new AppError(400, "Some picked questions no longer exist. Reload and try again.");
    if (found.some((q) => q.kind !== "MCQ")) throw new AppError(400, "Only MCQs can be used in a quiz.");
    if (found.some((q) => !chapterIds.includes(q.chapterId))) {
      throw new AppError(400, "Every picked question must come from one of the chosen chapters.");
    }
  }

  if (input.availableFrom && input.availableUntil && input.availableFrom >= input.availableUntil) {
    throw new AppError(400, "The closing time must be after the opening time.");
  }

  // Where students find it: one chapter → that chapter; one subject → that subject; else the class page.
  const subjectIds = [...new Set(chapters.map((c) => c.subjectId))];
  const mix = input.pickMode === "RANDOM" && input.difficultyMix ? input.difficultyMix : null;

  const data = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    mediumId: medium.id,
    classLevelId: classLevel.id,
    subjectId: subjectIds.length === 1 ? subjectIds[0] : null,
    chapterId: chapterIds.length === 1 ? chapterIds[0] : null,
    pickMode: input.pickMode,
    questionCount: input.pickMode === "RANDOM" ? (input.questionCount ?? null) : null,
    sources: input.pickMode === "RANDOM" ? input.sources : [],
    difficulties: input.pickMode === "RANDOM" ? input.difficulties : [],
    difficultyMix: mix && Object.values(mix).some((n) => (n ?? 0) > 0) ? (mix as Prisma.InputJsonValue) : Prisma.DbNull,
    onlyQuizMarked: input.onlyQuizMarked,
    secondsPerQuestion: input.secondsPerQuestion ?? null,
    passMark: input.passMark ?? null,
    coinsPerPass: input.coinsPerPass ?? null,
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    answerReveal: input.answerReveal,
    maxAttemptsPerStudent: input.maxAttemptsPerStudent ?? null,
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? null,
    isPublished: input.isPublished,
  };
  return { data, chapterIds, questionIds };
};

// The same quiz shape the services use, built from unsaved input (live
// counter / readiness in the builder before saving).
export const draftQuiz = (v: Awaited<ReturnType<typeof validateQuizInput>>): QuizWithLinks => ({
  id: "draft",
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...v.data,
  difficultyMix: v.data.difficultyMix === Prisma.DbNull ? null : (v.data.difficultyMix as Prisma.JsonValue),
  chapters: v.chapterIds.map((chapterId) => ({ chapterId })),
  questions: v.questionIds.map((questionId, order) => ({ questionId, order })),
});
