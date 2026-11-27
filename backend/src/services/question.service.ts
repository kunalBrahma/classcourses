import { Difficulty, Prisma, QuestionKind, QuestionSource } from "@prisma/client";
import { hasVisibleContent, sanitizeOptional, sanitizeRichText } from "../utils/sanitizeHtml";

// Normalises and validates a question (from the admin form or a bulk-import
// row) into DB-ready data. Business rules live here so the form and the
// importer can never disagree:
//   QA  → needs an answer; no options
//   MCQ → 2–6 non-empty, distinct options and a correctIndex inside them
// Returns a list of human-readable problems instead of throwing, so the
// importer can report every bad row at once.

export const MAX_OPTIONS = 6;

// Interactive figures: stored as pasted (NOT sanitised: it never enters the
// page, only a sandboxed iframe's srcdoc with a no-network CSP).
export const FIGURE_MAX_BYTES = 100 * 1024;
export const FIGURE_MIN_HEIGHT = 120;
export const FIGURE_MAX_HEIGHT = 720;
export const FIGURE_DEFAULT_HEIGHT = 320;

export interface QuestionInput {
  kind: QuestionKind;
  source: QuestionSource;
  question: string;
  answer?: string | null;
  options?: string[] | null;
  correctIndex?: number | null;
  explanation?: string | null;
  difficulty?: Difficulty | null;
  isPublished?: boolean;
  // Scheduled publishing: hidden from students until then (null = no schedule)
  publishAt?: string | Date | null;
  // Interactive figure: raw HTML shown only in a sandboxed iframe (see FIGURE_*)
  figureHtml?: string | null;
  figureHeight?: number | null;
  figureAlt?: string | null;
  useInQuiz?: boolean;
}

export type NormalizedQuestion = Omit<Prisma.QuestionUncheckedCreateInput, "chapterId" | "order">;

export const normalizeQuestion = (
  input: QuestionInput
): { data: NormalizedQuestion; errors: [] } | { data: null; errors: string[] } => {
  const errors: string[] = [];
  const question = sanitizeRichText(input.question ?? "");
  if (!hasVisibleContent(question)) errors.push("Question text is empty");

  const explanation = sanitizeOptional(input.explanation);
  let answer: string | null = null;
  let options: string[] | null = null;
  let correctIndex: number | null = null;

  if (input.kind === "QA") {
    answer = sanitizeOptional(input.answer);
    if (!answer || !hasVisibleContent(answer)) errors.push("A question-answer needs an answer");
    if (input.options?.length) errors.push("A question-answer can't have options (use kind MCQ)");
  } else {
    options = (input.options ?? []).map((o) => sanitizeRichText(o ?? ""));
    if (options.length < 2 || options.length > MAX_OPTIONS) {
      errors.push(`An MCQ needs between 2 and ${MAX_OPTIONS} options`);
    }
    if (options.some((o) => !hasVisibleContent(o))) errors.push("MCQ options can't be empty");
    const lowered = options.map((o) => o.toLowerCase());
    if (new Set(lowered).size !== lowered.length) errors.push("MCQ options must be different from each other");

    correctIndex = input.correctIndex ?? null;
    if (correctIndex === null || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      errors.push("Mark which option is correct");
    }
    if (input.answer) errors.push("An MCQ uses options + correct answer, not an answer text");
  }

  if (input.publishAt && Number.isNaN(new Date(input.publishAt).getTime())) errors.push("The publish time isn't a real date");

  const figureHtml = input.figureHtml?.trim() ? input.figureHtml.trim() : null;
  if (figureHtml) {
    if (Buffer.byteLength(figureHtml, "utf8") > FIGURE_MAX_BYTES) errors.push(`The figure is too big (max ${FIGURE_MAX_BYTES / 1024} KB)`);
    if (!/<[a-z!][\s\S]*>/i.test(figureHtml)) errors.push("The figure must be HTML (e.g. a <div>, <svg> or <canvas>)");
  }
  const figureHeight = figureHtml
    ? Math.min(FIGURE_MAX_HEIGHT, Math.max(FIGURE_MIN_HEIGHT, Math.round(input.figureHeight ?? FIGURE_DEFAULT_HEIGHT)))
    : null;
  const figureAlt = figureHtml && input.figureAlt?.trim() ? input.figureAlt.trim().slice(0, 300) : null;

  if (errors.length) return { data: null, errors };

  return {
    data: {
      kind: input.kind,
      source: input.source,
      question,
      answer,
      options: options ?? Prisma.DbNull,
      correctIndex,
      explanation,
      difficulty: input.difficulty ?? null,
      isPublished: input.isPublished ?? true,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      figureHtml,
      figureHeight,
      figureAlt,
      useInQuiz: input.useInQuiz ?? true,
    },
    errors: [],
  };
};
