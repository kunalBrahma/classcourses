import { z } from "zod";

// The automatic chapter quiz ({ chapterId }) or a custom quiz ({ quizId }).
export const startQuizSchema = z.union([
  z.object({ chapterId: z.string().uuid(), quizId: z.undefined().optional() }),
  z.object({ quizId: z.string().uuid(), chapterId: z.undefined().optional() }),
]);

// null = no answer (timer ran out / skipped)
export const submitAnswerSchema = z.object({ optionIndex: z.number().int().min(0).max(5).nullable() });

export const adjustCoinsSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((v) => v !== 0, "Enter a positive or negative amount"),
  // Shown in the student's coin history, so a reason is required.
  note: z.string().trim().min(3, "Add a short reason").max(200),
});

export const updateUserAdminSchema = z.object({
  name: z.string().trim().min(1).max(120).nullable().optional(),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
});

// ---- Quiz builder (admin) ----
// No defaults here: create merges QUIZ_INPUT_DEFAULTS, update merges the
// saved quiz, so a partial PATCH (e.g. just isPublished) never resets fields.
const intOrNull = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const dateOrNull = z.coerce.date().nullable();

export const quizInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give the quiz a title").max(160),
    description: z.string().trim().max(1000).nullable(),
    mediumId: z.string().uuid(),
    classId: z.string().uuid(),
    chapterIds: z.array(z.string().uuid()).max(500),
    pickMode: z.enum(["RANDOM", "FIXED"]),
    questionCount: intOrNull(1, 100),
    sources: z.array(z.enum(["TEXTBOOK", "EXTRA"])).max(2),
    difficulties: z.array(z.enum(["EASY", "MEDIUM", "HARD"])).max(3),
    difficultyMix: z
      .object({ EASY: z.number().int().min(0).max(100), MEDIUM: z.number().int().min(0).max(100), HARD: z.number().int().min(0).max(100) })
      .partial()
      .nullable(),
    onlyQuizMarked: z.boolean(),
    questionIds: z.array(z.string().uuid()).max(200),
    secondsPerQuestion: intOrNull(3, 600),
    passMark: intOrNull(1, 200),
    coinsPerPass: intOrNull(0, 100_000),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    answerReveal: z.enum(["AFTER_EACH", "AT_END", "NEVER"]),
    maxAttemptsPerStudent: intOrNull(1, 1000),
    availableFrom: dateOrNull,
    availableUntil: dateOrNull,
    isPublished: z.boolean(),
  })
  .partial();

export const reorderQuizzesSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) });

export const quizFlagSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), useInQuiz: z.boolean() });
