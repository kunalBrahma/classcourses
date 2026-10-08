import { z } from "zod";
import { MAX_OPTIONS } from "../services/question.service";

// Shape checks only — content rules (QA needs an answer, MCQ needs 2–6
// distinct options, ...) are in services/question.service.ts so the form and
// the bulk importer share them.

const kind = z.enum(["QA", "MCQ"]);
const source = z.enum(["TEXTBOOK", "EXTRA"]);
const difficulty = z.enum(["EASY", "MEDIUM", "HARD"]).nullable();
const richText = z.string().max(50_000);

export const createQuestionSchema = z.object({
  kind,
  source: source.default("TEXTBOOK"),
  question: richText,
  answer: richText.nullable().optional(),
  options: z.array(z.string().max(5_000)).max(MAX_OPTIONS).nullable().optional(),
  correctIndex: z.number().int().min(0).max(MAX_OPTIONS - 1).nullable().optional(),
  explanation: richText.nullable().optional(),
  difficulty: difficulty.optional(),
  isPublished: z.boolean().optional(),
  // MCQ: may appear in quizzes
  useInQuiz: z.boolean().optional(),
});

// Partial update; the merged result is re-validated as a whole.
export const updateQuestionSchema = createQuestionSchema.partial();

export const reorderQuestionsSchema = z.object({
  source,
  kind,
  ids: z.array(z.string().uuid()).min(1).max(1000),
});

export const importQuestionsSchema = z.object({
  format: z.enum(["csv", "json"]),
  data: z.string().min(1).max(2_000_000),
  // append: add after existing questions; replace: delete ALL of this chapter's questions first
  mode: z.enum(["append", "replace"]).default("append"),
  // true (default) = validate and preview only; false = write
  dryRun: z.boolean().default(true),
});

export const createVideoSchema = z.object({
  url: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(200),
});
export const updateVideoSchema = createVideoSchema.partial();
export const reorderVideosSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const imageUploadSchema = z.object({
  // SVG is deliberately not allowed (it can carry scripts).
  contentType: z.enum(Object.keys(IMAGE_TYPES) as [keyof typeof IMAGE_TYPES, ...(keyof typeof IMAGE_TYPES)[]]),
  size: z.number().int().min(1).max(MAX_IMAGE_BYTES, "Images must be 5 MB or smaller"),
});

export const checkAnswerSchema = z.object({ optionIndex: z.number().int().min(0).max(MAX_OPTIONS - 1) });
