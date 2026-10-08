import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler";
import { getAttemptDetail, getQuizStats, listAttempts } from "../services/quizReport.service";

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const filters = z.object({
  status: z.enum(["IN_PROGRESS", "PAUSED", "PASSED", "FAILED", "EXPIRED", "UNFINISHED"]).optional(),
  mediumId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  quizId: z.union([z.string().uuid(), z.literal("auto")]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  from: dayKey.optional(),
  to: dayKey.optional(),
});

const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const listQuizAttempts = asyncHandler(async (req: Request, res: Response) => {
  const f = filters.parse(req.query);
  const { page, pageSize } = paging.parse(req.query);
  res.json(await listAttempts(f, page, pageSize));
});

export const getQuizAttempt = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getAttemptDetail(req.params.id));
});

export const getQuizStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getQuizStats(filters.omit({ status: true }).parse(req.query)));
});
