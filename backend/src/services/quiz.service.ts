import { Prisma, QuizAttempt, QuizStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { istDayEnd, istDayKey } from "../utils/istDate";
import { applyCoinChange } from "./coin.service";
import { requireSetting } from "./settings.service";
import {
  autoPool,
  checkReadiness,
  customPool,
  drawQuestions,
  quizLinksInclude,
  QuizWithLinks,
  resolveRules,
  scheduleStatus,
} from "./quizBuilder.service";

// Server-timed quiz engine. Rules (requirements PDF §4.2 / §5.1):
//   - which questions / how many / timing / pass mark / coins come from
//     quizBuilder.service.ts: the automatic chapter quiz (random quiz-marked
//     MCQs, global settings) or an admin-built custom quiz (own overrides)
//   - a question's clock starts when the server REVEALS it; an answer arriving
//     after the deadline (+ a small network grace) counts as wrong
//   - pausing while a question is on screen forfeits that question — otherwise
//     "pause → search the answer → resume" would defeat the 10-second rule
//   - paused/unfinished attempts can be resumed the same IST day only
//   - daily limit counts quizzes STARTED that IST day
//   - pass = score ≥ passMark → coins, per the coins.awardRule setting
// Every state change is a guarded updateMany (currentIndex + deadline must
// still match), so double-submits and parallel tabs can't answer twice.

export const ANSWER_GRACE_MS = 1500;

const UNFINISHED: QuizStatus[] = ["IN_PROGRESS", "PAUSED"];

export interface AnswerRecord {
  index: number;
  optionIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  // Question was removed by an admin mid-quiz; counted in the student's favour
  removed?: boolean;
  answeredAt: string;
}

type AttemptWithChapter = Prisma.QuizAttemptGetPayload<{ include: typeof attemptInclude }>;

const placeSelect = {
  medium: { select: { slug: true, name: true } },
  classLevel: { select: { id: true, name: true, slug: true } },
} as const;

const attemptInclude = {
  quiz: { select: { id: true, title: true, subjectId: true, chapterId: true, ...placeSelect } },
  chapter: {
    select: {
      id: true,
      title: true,
      slug: true,
      number: true,
      subject: {
        select: {
          name: true,
          nativeName: true,
          slug: true,
          medium: { select: { slug: true, name: true } },
          classLevel: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  },
} as const;

const questionIdsOf = (attempt: QuizAttempt) => attempt.questionIds as string[];
// display position → original option index for question `index` (null = not shuffled)
const optionOrderOf = (attempt: QuizAttempt, index: number) => ((attempt.optionOrders as number[][] | null) ?? null)?.[index] ?? null;
const answersOf = (attempt: QuizAttempt) => attempt.answers as unknown as AnswerRecord[];

// ---------------------------------------------------------------------------
// Visibility, expiry, limits
// ---------------------------------------------------------------------------

export const expireStaleAttempts = async (userId: string) => {
  await prisma.quizAttempt.updateMany({
    where: { userId, status: { in: UNFINISHED }, dayKey: { lt: istDayKey() } },
    data: { status: "EXPIRED", questionDeadline: null, finishedAt: new Date() },
  });
};

// Same as above for every student — used before admin reports so they never show stale "in progress".
export const expireAllStaleAttempts = async () => {
  await prisma.quizAttempt.updateMany({
    where: { status: { in: UNFINISHED }, dayKey: { lt: istDayKey() } },
    data: { status: "EXPIRED", questionDeadline: null, finishedAt: new Date() },
  });
};

export const getDailyUsage = async (userId: string) => {
  const quiz = await requireSetting("quiz");
  const dayKey = istDayKey();
  const used = await prisma.quizAttempt.count({ where: { userId, dayKey } });
  return { dayKey, used, limit: quiz.dailyLimit, remaining: Math.max(0, quiz.dailyLimit - used), resetsAt: istDayEnd(dayKey) };
};

const requirePublicChapter = async (chapterId: string) => {
  const chapter = await prisma.chapter.findFirst({
    where: {
      id: chapterId,
      isPublished: true,
      subject: { isActive: true, medium: { isActive: true }, classLevel: { isActive: true } },
    },
    select: { id: true },
  });
  if (!chapter) throw new AppError(404, "Chapter not found");
  return chapter;
};


// ---------------------------------------------------------------------------
// Public view of an attempt (never contains correct answers of unanswered questions)
// ---------------------------------------------------------------------------

const loadAttempt = async (attemptId: string, userId: string): Promise<AttemptWithChapter> => {
  const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, include: attemptInclude });
  // Someone else's attempt looks exactly like a missing one.
  if (!attempt || attempt.userId !== userId) throw new AppError(404, "Quiz not found");
  return attempt;
};

const isExpired = (attempt: QuizAttempt) => UNFINISHED.includes(attempt.status) && attempt.dayKey < istDayKey();

const markExpired = async (attempt: QuizAttempt) => {
  await prisma.quizAttempt.updateMany({
    where: { id: attempt.id, status: { in: UNFINISHED } },
    data: { status: "EXPIRED", questionDeadline: null, finishedAt: new Date() },
  });
};

const openQuestionView = async (attempt: QuizAttempt) => {
  if (!attempt.questionDeadline || !UNFINISHED.includes(attempt.status)) return null;
  const id = questionIdsOf(attempt)[attempt.currentIndex];
  const question = await prisma.question.findUnique({ where: { id }, select: { question: true, options: true } });
  if (!question) return null;
  const options = question.options as string[];
  const order = optionOrderOf(attempt, attempt.currentIndex);
  return {
    // Position only — no question id, so it can't be looked up elsewhere mid-quiz.
    index: attempt.currentIndex,
    question: question.question,
    options: order ? order.map((i) => options[i]) : options,
    deadline: attempt.questionDeadline.toISOString(),
    remainingMs: Math.max(0, attempt.questionDeadline.getTime() - Date.now()),
  };
};

// After the quiz: every question with the student's pick and the right
// answer (unless the quiz hides answers). Options in the order they saw them.
const reviewOf = async (attempt: QuizAttempt) => {
  const ids = questionIdsOf(attempt);
  const rows = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: { id: true, question: true, options: true, correctIndex: true, explanation: true },
  });
  const byId = new Map(rows.map((q) => [q.id, q]));
  const answers = new Map(answersOf(attempt).map((a) => [a.index, a]));
  return ids.map((id, index) => {
    const q = byId.get(id);
    const a = answers.get(index);
    const order = optionOrderOf(attempt, index);
    const toDisplay = (original: number | null | undefined) =>
      original === null || original === undefined ? null : order ? order.indexOf(original) : original;
    const options = (q?.options as string[] | undefined) ?? [];
    return {
      index,
      question: q?.question ?? null,
      options: order ? order.map((i) => options[i]) : options,
      chosenIndex: toDisplay(a?.optionIndex),
      correctIndex: toDisplay(q?.correctIndex),
      correct: a?.correct ?? false,
      timedOut: a?.timedOut ?? false,
      explanation: q?.explanation ?? null,
    };
  });
};

export const toAttemptView = async (attempt: AttemptWithChapter) => {
  const total = questionIdsOf(attempt).length;
  const finished = !UNFINISHED.includes(attempt.status);
  const subject = attempt.chapter?.subject;
  return {
    id: attempt.id,
    status: attempt.status,
    dayKey: attempt.dayKey,
    // Unfinished attempts can be resumed until this moment (IST midnight).
    resumableUntil: finished ? null : istDayEnd(attempt.dayKey).toISOString(),
    total,
    currentIndex: attempt.currentIndex,
    answered: answersOf(attempt).length,
    // Hidden mid-quiz when answers aren't shown after each question (it would give them away).
    score: finished || attempt.answerReveal === "AFTER_EACH" ? attempt.score : null,
    secondsPerQuestion: attempt.secondsPerQuestion,
    passMark: attempt.passMark,
    answerReveal: attempt.answerReveal,
    passed: finished ? attempt.status === "PASSED" : null,
    coinsAwarded: attempt.coinsAwarded,
    startedAt: attempt.startedAt.toISOString(),
    finishedAt: attempt.finishedAt?.toISOString() ?? null,
    // Custom quiz (null = the automatic chapter quiz)
    quiz: attempt.quizId ? { id: attempt.quizId, title: attempt.quiz?.title ?? attempt.quizTitle ?? "Quiz" } : null,
    title: attempt.quiz?.title ?? attempt.quizTitle ?? (attempt.chapter ? attempt.chapter.title : "Quiz"),
    // Set for chapter quizzes and single-chapter custom quizzes
    chapter:
      attempt.chapter && subject
        ? {
            id: attempt.chapter.id,
            title: attempt.chapter.title,
            slug: attempt.chapter.slug,
            number: attempt.chapter.number,
            subject: { name: subject.name, nativeName: subject.nativeName, slug: subject.slug },
            medium: subject.medium,
            classLevel: subject.classLevel,
          }
        : null,
    medium: subject?.medium ?? attempt.quiz?.medium ?? null,
    classLevel: subject?.classLevel ?? attempt.quiz?.classLevel ?? null,
    question: await openQuestionView(attempt),
    review: finished && attempt.answerReveal !== "NEVER" && attempt.status !== "EXPIRED" ? await reviewOf(attempt) : null,
  };
};

// ---------------------------------------------------------------------------
// Recording answers (shared by answer / timeout / forfeit-on-pause)
// ---------------------------------------------------------------------------

// Decides whether this pass earns coins under the admin's award rule.
// The amount is the attempt's snapshot (quiz override or global); "first
// pass" is counted per custom quiz, or per chapter for automatic quizzes.
const coinsForPass = async (tx: Prisma.TransactionClient, attempt: QuizAttempt) => {
  const coins = await requireSetting("coins");
  const perPass = attempt.coinsPerPass ?? coins.perPass;
  if (perPass <= 0) return 0;
  if (coins.awardRule === "everyPass") return perPass;

  const earlierPaid = await tx.quizAttempt.count({
    where: {
      userId: attempt.userId,
      ...(attempt.quizId ? { quizId: attempt.quizId } : { chapterId: attempt.chapterId, quizId: null }),
      id: { not: attempt.id },
      coinsAwarded: { gt: 0 },
      ...(coins.awardRule === "firstPassPerChapterPerDay" ? { dayKey: attempt.dayKey } : {}),
    },
  });
  return earlierPaid === 0 ? perPass : 0;
};

const recordAndAdvance = async (
  attempt: QuizAttempt,
  record: Omit<AnswerRecord, "index" | "answeredAt">,
  opts: { pauseAfter?: boolean } = {}
) => {
  const index = attempt.currentIndex;
  const answers = [...answersOf(attempt), { ...record, index, answeredAt: new Date().toISOString() }];
  const score = attempt.score + (record.correct ? 1 : 0);
  const nextIndex = index + 1;
  const done = nextIndex >= questionIdsOf(attempt).length;
  const passed = done && score >= attempt.passMark;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.quizAttempt.updateMany({
      // Guard: only succeeds if nobody else answered this question first.
      where: { id: attempt.id, currentIndex: index, questionDeadline: attempt.questionDeadline, status: { in: UNFINISHED } },
      data: {
        answers: answers as unknown as Prisma.InputJsonValue,
        score,
        currentIndex: nextIndex,
        questionDeadline: null,
        ...(done
          ? { status: passed ? "PASSED" : "FAILED", finishedAt: new Date() }
          : opts.pauseAfter
            ? { status: "PAUSED" }
            : {}),
      },
    });
    if (updated.count === 0) throw new AppError(409, "This question was already answered");

    if (passed) {
      const coins = await coinsForPass(tx, attempt);
      if (coins > 0) {
        await applyCoinChange(tx, { userId: attempt.userId, delta: coins, reason: "QUIZ_PASS", refId: attempt.id });
        await tx.quizAttempt.update({ where: { id: attempt.id }, data: { coinsAwarded: coins } });
      }
    }
  });
};

const deadlinePassed = (attempt: QuizAttempt, at = Date.now()) =>
  Boolean(attempt.questionDeadline && at > attempt.questionDeadline.getTime() + ANSWER_GRACE_MS);

// Records an unanswered revealed question as timed out (wrong).
const timeOutOpenQuestion = (attempt: QuizAttempt, opts: { pauseAfter?: boolean } = {}) =>
  recordAndAdvance(attempt, { optionIndex: null, correct: false, timedOut: true }, opts);

const refreshed = (attemptId: string, userId: string) => loadAttempt(attemptId, userId);

const assertNotExpired = async (attempt: QuizAttempt) => {
  if (isExpired(attempt)) {
    await markExpired(attempt);
    throw new AppError(410, "This quiz expired at midnight. Start a new one.");
  }
};

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

export type QuizTarget = { chapterId: string; quizId?: undefined } | { quizId: string; chapterId?: undefined };

// A custom quiz a student may open: published, inside its window, its chapters visible.
const requireOpenQuiz = async (quizId: string): Promise<QuizWithLinks> => {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, medium: { isActive: true }, classLevel: { isActive: true } },
    include: quizLinksInclude,
  });
  if (!quiz || !quiz.isPublished) throw new AppError(404, "Quiz not found");
  const status = scheduleStatus(quiz);
  if (status === "SCHEDULED") throw new AppError(403, "This quiz hasn't opened yet.");
  if (status === "CLOSED") throw new AppError(403, "This quiz has closed.");
  return quiz;
};

// Starts a quiz, or returns today's unfinished attempt of the same quiz.
export const startQuiz = async (userId: string, target: QuizTarget) => {
  await expireStaleAttempts(userId);
  const quiz = target.quizId ? await requireOpenQuiz(target.quizId) : null;
  if (!quiz) {
    await requirePublicChapter(target.chapterId!);
    const [global, chapter] = await Promise.all([
      requireSetting("quiz"),
      prisma.chapter.findUnique({ where: { id: target.chapterId! }, select: { autoQuiz: true } }),
    ]);
    if (!global.autoChapterQuizzes || !chapter?.autoQuiz) throw new AppError(404, "This chapter doesn't have a quiz.");
  }
  const dayKey = istDayKey();
  const same = quiz ? { quizId: quiz.id } : { chapterId: target.chapterId!, quizId: null };

  const existing = await prisma.quizAttempt.findFirst({
    where: { userId, dayKey, status: { in: UNFINISHED }, ...same },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (existing) return { attempt: await refreshed(existing.id, userId), resumed: true };

  const global = await requireSetting("quiz");
  const used = await prisma.quizAttempt.count({ where: { userId, dayKey } });
  if (used >= global.dailyLimit) {
    throw new AppError(429, `You've reached today's limit of ${global.dailyLimit} quizzes. Come back after midnight.`);
  }
  if (quiz?.maxAttemptsPerStudent) {
    const tries = await prisma.quizAttempt.count({ where: { userId, quizId: quiz.id } });
    if (tries >= quiz.maxAttemptsPerStudent) {
      throw new AppError(403, `You've used all ${quiz.maxAttemptsPerStudent} attempts for this quiz.`);
    }
  }

  const pool = quiz ? await customPool(quiz) : await autoPool(target.chapterId!);
  const readiness = await checkReadiness(quiz, pool);
  if (!readiness.ready) {
    throw new AppError(400, quiz ? "This quiz isn't ready yet. Check back soon." : "The quiz for this chapter isn't ready yet. Check back soon.");
  }
  const rules = await resolveRules(quiz, pool.length);
  const { questionIds, optionOrders } = drawQuestions(quiz, pool, rules.count);

  const created = await prisma.quizAttempt.create({
    data: {
      userId,
      chapterId: quiz ? quiz.chapterId : target.chapterId!,
      quizId: quiz?.id ?? null,
      quizTitle: quiz?.title ?? null,
      dayKey,
      questionIds,
      optionOrders: optionOrders ?? Prisma.DbNull,
      secondsPerQuestion: rules.secondsPerQuestion,
      // Never ask for more correct answers than there are questions.
      passMark: Math.min(rules.passMark, questionIds.length),
      coinsPerPass: rules.coinsPerPass,
      answerReveal: quiz?.answerReveal ?? "AFTER_EACH",
    },
  });
  return { attempt: await refreshed(created.id, userId), resumed: false };
};

export const getAttempt = async (attemptId: string, userId: string) => {
  let attempt = await loadAttempt(attemptId, userId);
  if (isExpired(attempt)) {
    await markExpired(attempt);
    attempt = await refreshed(attemptId, userId);
  } else if (attempt.status === "IN_PROGRESS" && deadlinePassed(attempt)) {
    // Question ran out while the student was away: count it and move on.
    await timeOutOpenQuestion(attempt).catch(ignoreRace);
    attempt = await refreshed(attemptId, userId);
  }
  return attempt;
};

// Reveals the next question and starts its clock. Idempotent while a question
// is open (returns it with the remaining time; the clock is NOT restarted).
// Also resumes a PAUSED attempt.
export const revealNext = async (attemptId: string, userId: string): Promise<AttemptWithChapter> => {
  let attempt = await loadAttempt(attemptId, userId);
  await assertNotExpired(attempt);
  if (!UNFINISHED.includes(attempt.status)) throw new AppError(409, "This quiz is already finished");

  if (attempt.questionDeadline) {
    if (!deadlinePassed(attempt)) return attempt;
    await timeOutOpenQuestion(attempt).catch(ignoreRace);
    attempt = await refreshed(attemptId, userId);
    if (!UNFINISHED.includes(attempt.status)) return attempt;
  }

  // A question removed by an admin since the quiz started is skipped in the
  // student's favour rather than breaking the attempt.
  const questionId = questionIdsOf(attempt)[attempt.currentIndex];
  const exists = await prisma.question.count({ where: { id: questionId } });
  if (!exists) {
    await recordAndAdvance(attempt, { optionIndex: null, correct: true, timedOut: false, removed: true });
    return revealNext(attemptId, userId);
  }

  const deadline = new Date(Date.now() + attempt.secondsPerQuestion * 1000);
  const updated = await prisma.quizAttempt.updateMany({
    where: { id: attempt.id, currentIndex: attempt.currentIndex, questionDeadline: null, status: { in: UNFINISHED } },
    data: { questionDeadline: deadline, status: "IN_PROGRESS" },
  });
  if (updated.count === 0) throw new AppError(409, "The quiz changed in another tab. Reload to continue.");
  return refreshed(attemptId, userId);
};

// optionIndex null = the student let the timer run out / skipped.
export const submitAnswer = async (attemptId: string, userId: string, optionIndex: number | null) => {
  const attempt = await loadAttempt(attemptId, userId);
  await assertNotExpired(attempt);
  if (attempt.status !== "IN_PROGRESS" || !attempt.questionDeadline) {
    throw new AppError(409, "No question is open. Ask for the next question first.");
  }

  const questionId = questionIdsOf(attempt)[attempt.currentIndex];
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { options: true, correctIndex: true, explanation: true },
  });

  const timedOut = deadlinePassed(attempt);
  if (question && optionIndex !== null && optionIndex >= (question.options as string[]).length) {
    throw new AppError(400, "That option doesn't exist");
  }
  // The student answers by display position; store and score the original index.
  const order = optionOrderOf(attempt, attempt.currentIndex);
  const original = optionIndex === null ? null : order ? (order[optionIndex] ?? null) : optionIndex;
  const correct = question ? !timedOut && original !== null && original === question.correctIndex : true;

  await recordAndAdvance(attempt, {
    optionIndex: original,
    correct,
    timedOut,
    ...(question ? {} : { removed: true }),
  });

  // Revealed only now that this question is done — and only if the quiz shows
  // answers after each question (AT_END shows them in the final review).
  const reveal = attempt.answerReveal === "AFTER_EACH";
  const correctDisplay =
    question?.correctIndex === null || question?.correctIndex === undefined ? null : order ? order.indexOf(question.correctIndex) : question.correctIndex;
  return {
    // null = the quiz doesn't say until the end (or never)
    correct: reveal ? correct : null,
    timedOut,
    correctIndex: reveal ? correctDisplay : null,
    explanation: reveal ? (question?.explanation ?? null) : null,
    attempt: await refreshed(attemptId, userId),
  };
};

// Leaving mid-quiz. A question that is on screen is forfeited (see file header).
export const pauseQuiz = async (attemptId: string, userId: string) => {
  const attempt = await loadAttempt(attemptId, userId);
  await assertNotExpired(attempt);
  if (attempt.status === "PAUSED") return { attempt, forfeited: false };
  if (attempt.status !== "IN_PROGRESS") throw new AppError(409, "This quiz is already finished");

  if (attempt.questionDeadline) {
    await timeOutOpenQuestion(attempt, { pauseAfter: true });
    return { attempt: await refreshed(attemptId, userId), forfeited: true };
  }

  await prisma.quizAttempt.updateMany({
    where: { id: attempt.id, status: "IN_PROGRESS", questionDeadline: null },
    data: { status: "PAUSED" },
  });
  return { attempt: await refreshed(attemptId, userId), forfeited: false };
};

export const listAttempts = async (userId: string, opts: { today?: boolean; limit?: number }) => {
  await expireStaleAttempts(userId);
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, ...(opts.today ? { dayKey: istDayKey() } : {}) },
    orderBy: { startedAt: "desc" },
    take: opts.limit ?? 20,
    include: attemptInclude,
  });
  return Promise.all(attempts.map(async (a) => ({ ...(await toAttemptView(a)), question: null })));
};

// A concurrent request already recorded this question — the state is fine, just reload it.
const ignoreRace = (err: unknown) => {
  if (!(err instanceof AppError && err.statusCode === 409)) throw err;
};
