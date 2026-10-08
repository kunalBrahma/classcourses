import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { requireSetting } from "../services/settings.service";
import { availableQuizzes } from "../services/quizAvailability.service";
import { classSlugFrom } from "../services/catalog.service";
import { AppError } from "../utils/AppError";
import {
  getAttempt,
  getDailyUsage,
  listAttempts,
  pauseQuiz,
  revealNext,
  startQuiz,
  submitAnswer,
  toAttemptView,
} from "../services/quiz.service";

// Student quiz API. All rules live in services/quiz.service.ts.

const userId = (req: AuthRequest) => req.user!.userId;

// Rules for the guidelines screen + today's usage.
export const getQuizInfo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const quiz = await requireSetting("quiz");
  const coins = await requireSetting("coins");
  res.json({
    rules: {
      questionsPerQuiz: quiz.questionsPerQuiz,
      secondsPerQuestion: quiz.secondsPerQuestion,
      passMark: quiz.passMark,
      dailyLimit: quiz.dailyLimit,
      coinsPerPass: coins.perPass,
      coinAwardRule: coins.awardRule,
      pausedQuizzesExpire: "midnight (India time)",
    },
    today: await getDailyUsage(userId(req)),
  });
});

export const start = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { attempt, resumed } = await startQuiz(userId(req), req.body);
  res.status(resumed ? 200 : 201).json({ resumed, attempt: await toAttemptView(attempt) });
});

export const show = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ attempt: await toAttemptView(await getAttempt(req.params.id, userId(req))) });
});

export const next = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ attempt: await toAttemptView(await revealNext(req.params.id, userId(req))) });
});

export const answer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await submitAnswer(req.params.id, userId(req), req.body.optionIndex);
  res.json({ ...result, attempt: await toAttemptView(result.attempt) });
});

export const pause = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { attempt, forfeited } = await pauseQuiz(req.params.id, userId(req));
  res.json({ forfeited, attempt: await toAttemptView(attempt) });
});

// Today's attempts (the profile's "paused quizzes") + usage.
export const today = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ attempts: await listAttempts(userId(req), { today: true, limit: 50 }), usage: await getDailyUsage(userId(req)) });
});

export const history = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  res.json({ attempts: await listAttempts(userId(req), { limit }) });
});

// Quizzes a student can take on a chapter / subject / class page. Public
// (/api/catalog/quizzes) and logged-in (/api/quiz/available, adds attempts used).
export const available = asyncHandler(async (req: AuthRequest, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const classSlug = q.classSlug ? classSlugFrom(q.classSlug) : undefined;
  if (!q.chapterId && !q.subjectId && !(q.mediumId && (q.classId || classSlug))) {
    throw new AppError(400, "Pass chapterId, subjectId, or mediumId + classId (or classSlug)");
  }
  res.json({ quizzes: await availableQuizzes(req.user?.userId ?? null, { chapterId: q.chapterId, subjectId: q.subjectId, mediumId: q.mediumId, classId: q.classId, classSlug }) });
});
