import { parse as parseCsv } from "csv-parse/sync";
import { Difficulty, QuestionKind, QuestionSource } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { MAX_OPTIONS, normalizeQuestion, NormalizedQuestion, QuestionInput } from "./question.service";

// Bulk import of chapter questions pasted by the admin as CSV (e.g. exported
// from Excel/Google Sheets) or JSON. The client delivers content as PDFs, so
// this is the main way content gets in. Every row is validated and reported
// with its row number; nothing is written unless every row is valid.
//
// Columns / keys (case-insensitive, spaces or underscores):
//   kind         qa | mcq            (default: mcq if options are present, else qa)
//   source       textbook | extra    (default: textbook; "book", "advanced" accepted)
//   question     required
//   answer       QA only
//   option_a … option_f   MCQ options   (JSON may use "options": [...] instead)
//   correct      MCQ: A–F or 1–6     (JSON may use "correctIndex": 0-based)
//   explanation  optional
//   difficulty   easy | medium | hard (optional)
//   quiz         yes | no            (MCQ: use in quizzes; default yes)

export const MAX_IMPORT_ROWS = 500;

export interface ImportRowResult {
  row: number;
  errors: string[];
  preview: { kind: QuestionKind; source: QuestionSource; question: string; optionCount: number; useInQuiz: boolean } | null;
}

export interface ParsedImport {
  rows: ImportRowResult[];
  valid: NormalizedQuestion[];
  invalidCount: number;
}

const OPTION_LETTERS = ["a", "b", "c", "d", "e", "f"].slice(0, MAX_OPTIONS);

const normalizeKey = (key: string) =>
  key.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Cells from a spreadsheet are plain text: keep their line breaks. Cells that
// already contain HTML are passed through (and sanitised later).
const toHtml = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (/<\/?[a-z][^>]*>/i.test(text)) return text;
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
};

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

const parseKind = (raw: string, hasOptions: boolean): QuestionKind | string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!v) return hasOptions ? "MCQ" : "QA";
  if (["qa", "question", "questionanswer", "short", "long"].includes(v)) return "QA";
  if (["mcq", "multiplechoice", "objective"].includes(v)) return "MCQ";
  return `Unknown kind "${raw}" (use qa or mcq)`;
};

const parseSource = (raw: string): QuestionSource | string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!v || ["textbook", "book", "text"].includes(v)) return "TEXTBOOK";
  if (["extra", "advanced", "extraadvanced", "additional"].includes(v)) return "EXTRA";
  return `Unknown source "${raw}" (use textbook or extra)`;
};

const parseDifficulty = (raw: string): Difficulty | null | string => {
  const v = raw.toLowerCase().trim();
  if (!v) return null;
  if (v === "easy") return "EASY";
  if (v === "medium") return "MEDIUM";
  if (v === "hard") return "HARD";
  return `Unknown difficulty "${raw}" (use easy, medium or hard)`;
};

// "yes"/"no" (and true/false, y/n, 1/0); blank = yes
const parseYesNo = (raw: string): boolean | string => {
  const v = raw.toLowerCase().trim();
  if (!v || ["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return `Unknown quiz value "${raw}" (use yes or no)`;
};

// "B" → 1, "2" → 1 (1-based in spreadsheets), "" → null
const parseCorrect = (raw: string): number | null | string => {
  const v = raw.trim();
  if (!v) return null;
  const letter = OPTION_LETTERS.indexOf(v.toLowerCase().replace(/^option_?/, ""));
  if (letter >= 0) return letter;
  if (/^\d+$/.test(v)) return Number(v) - 1;
  return `Unknown correct answer "${raw}" (use a letter A–F or a number 1–6)`;
};

const rowToInput = (raw: Record<string, unknown>): { input: QuestionInput | null; errors: string[] } => {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) row[normalizeKey(key)] = value;

  const errors: string[] = [];
  const options = Array.isArray(row.options)
    ? (row.options as unknown[]).map(toHtml).filter((o) => o !== "")
    : OPTION_LETTERS.map((l) => toHtml(row[`option_${l}`])).filter((o) => o !== "");

  const kind = parseKind(str(row.kind ?? row.type), options.length > 0);
  const source = parseSource(str(row.source));
  const difficulty = parseDifficulty(str(row.difficulty));
  const useInQuiz = typeof row.useinquiz === "boolean" ? row.useinquiz : parseYesNo(str(row.quiz ?? row.use_in_quiz ?? row.in_quiz));
  if (typeof useInQuiz === "string") errors.push(useInQuiz);

  let correctIndex: number | null | string = null;
  if (typeof row.correctindex === "number") {
    correctIndex = row.correctindex;
  } else {
    correctIndex = parseCorrect(str(row.correct ?? row.correct_answer ?? row.answer_key));
  }

  for (const value of [kind, source, difficulty, correctIndex]) {
    if (typeof value === "string" && !["QA", "MCQ", "TEXTBOOK", "EXTRA", "EASY", "MEDIUM", "HARD"].includes(value)) {
      errors.push(value);
    }
  }
  if (errors.length) return { input: null, errors };

  return {
    input: {
      kind: kind as QuestionKind,
      source: source as QuestionSource,
      question: toHtml(row.question),
      answer: kind === "QA" ? toHtml(row.answer) : str(row.answer) ? toHtml(row.answer) : null,
      options: kind === "MCQ" ? options : options.length ? options : null,
      correctIndex: correctIndex as number | null,
      explanation: toHtml(row.explanation) || null,
      difficulty: difficulty as Difficulty | null,
      useInQuiz: useInQuiz as boolean,
    },
    errors: [],
  };
};

const readRows = (format: "csv" | "json", data: string): Record<string, unknown>[] => {
  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      throw new AppError(400, `Invalid JSON: ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed) || parsed.some((r) => typeof r !== "object" || r === null || Array.isArray(r))) {
      throw new AppError(400, "JSON must be an array of question objects");
    }
    return parsed as Record<string, unknown>[];
  }

  try {
    return parseCsv(data, {
      columns: (header: string[]) => header.map(normalizeKey),
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, unknown>[];
  } catch (err) {
    throw new AppError(400, `Could not read the CSV: ${(err as Error).message}`);
  }
};

export const parseQuestionImport = (format: "csv" | "json", data: string): ParsedImport => {
  const records = readRows(format, data);
  if (records.length === 0) throw new AppError(400, "No rows found");
  if (records.length > MAX_IMPORT_ROWS) {
    throw new AppError(400, `Too many rows (${records.length}). Import at most ${MAX_IMPORT_ROWS} at a time.`);
  }
  if (format === "csv" && !("question" in records[0])) {
    throw new AppError(400, 'The CSV needs a header row with at least a "question" column');
  }

  const rows: ImportRowResult[] = [];
  const valid: NormalizedQuestion[] = [];

  records.forEach((record, i) => {
    // Row numbers match what the admin sees: CSV counts the header as row 1.
    const rowNumber = format === "csv" ? i + 2 : i + 1;
    const { input, errors } = rowToInput(record);
    if (!input) {
      rows.push({ row: rowNumber, errors, preview: null });
      return;
    }
    const result = normalizeQuestion(input);
    if (!result.data) {
      rows.push({ row: rowNumber, errors: result.errors, preview: null });
      return;
    }
    valid.push(result.data);
    rows.push({
      row: rowNumber,
      errors: [],
      preview: {
        kind: result.data.kind,
        source: result.data.source ?? "TEXTBOOK",
        question: result.data.question,
        optionCount: input.options?.length ?? 0,
        useInQuiz: result.data.useInQuiz ?? true,
      },
    });
  });

  return { rows, valid, invalidCount: rows.filter((r) => r.errors.length).length };
};
