// Shapes from /api/admin/quiz/* (backend/src/services/quizReport.service.ts).
import type { QuizStatus } from "@/lib/people";

export interface ChapterRef {
  id: string;
  number: number;
  title: string;
  subject: { id: string; name: string; classLevel: { id: string; name: string; slug: string }; medium: { id: string; name: string } };
}

export interface AttemptRow {
  id: string;
  status: QuizStatus;
  score: number;
  passMark: number;
  coinsAwarded: number;
  dayKey: string;
  startedAt: string;
  finishedAt: string | null;
  totalQuestions: number;
  answered: number;
  user: { id: string; name: string | null; email: string };
  // null for custom quizzes over several chapters
  chapter: ChapterRef | null;
  quizId: string | null;
  quizTitle: string | null;
  quiz: QuizRef | null;
}

// A custom quiz on a report row (null = the automatic chapter quiz)
export interface QuizRef {
  id: string;
  title: string;
  medium: { id: string; name: string };
  classLevel: { id: string; name: string; slug: string };
}

// "Chapter quiz" or the custom quiz's title (kept after the quiz is deleted).
export const attemptTitle = (a: { quiz: QuizRef | null; quizTitle: string | null; quizId: string | null }) =>
  a.quiz?.title ?? a.quizTitle ?? "Chapter quiz";

// "English Medium · Class 9 · Science · 1. Chapter 1", or the quiz's medium + class.
export const attemptScope = (a: { chapter: ChapterRef | null; quiz: QuizRef | null }) =>
  a.chapter
    ? `${a.chapter.subject.medium.name} · ${a.chapter.subject.classLevel.name} · ${a.chapter.subject.name} · ${a.chapter.number}. ${a.chapter.title}`
    : a.quiz
      ? `${a.quiz.medium.name} · ${a.quiz.classLevel.name} · several chapters`
      : "Several chapters";

export interface AttemptsPage {
  attempts: AttemptRow[];
  total: number;
  page: number;
  totalPages: number;
  summary: { attempts: number; passed: number; failed: number; unfinished: number; expired: number; passRate: number | null; averageScore: number | null };
}

export type Outcome = "CORRECT" | "WRONG" | "SKIPPED" | "TIMED_OUT" | "NOT_REACHED" | "REMOVED";

export interface AttemptItem {
  index: number;
  questionId: string;
  question: { html: string; options: string[]; correctIndex: number | null; explanation: string | null; source: "TEXTBOOK" | "EXTRA" } | null;
  chosenIndex: number | null;
  outcome: Outcome;
  answeredAt: string | null;
}

export interface AttemptDetail {
  attempt: {
    id: string;
    status: QuizStatus;
    score: number;
    passMark: number;
    coinsAwarded: number;
    secondsPerQuestion: number;
    dayKey: string;
    startedAt: string;
    finishedAt: string | null;
    totalQuestions: number;
    answered: number;
    user: { id: string; name: string | null; email: string };
    chapter: ChapterRef | null;
    quizId: string | null;
    quizTitle: string | null;
    quiz: QuizRef | null;
    answerReveal: AnswerReveal;
  };
  items: AttemptItem[];
}

export interface ChapterStat {
  chapter: ChapterRef;
  attempts: number;
  passed: number;
  failed: number;
  passRate: number | null;
  averageScore: number | null;
}

export interface QuizStat {
  quiz: QuizRef & { isPublished: boolean };
  attempts: number;
  passed: number;
  failed: number;
  passRate: number | null;
  averageScore: number | null;
}

export interface QuestionStat {
  questionId: string;
  question: string;
  options: string[];
  correctIndex: number | null;
  isPublished: boolean;
  useInQuiz: boolean;
  asked: number;
  correct: number;
  timedOut: number;
  accuracy: number | null;
  mostPickedWrong: { index: number; count: number } | null;
}

export const OUTCOME: Record<Outcome, { label: string; className: string }> = {
  CORRECT: { label: "Correct", className: "border-success/30 bg-success/10 text-success" },
  WRONG: { label: "Wrong", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  SKIPPED: { label: "Skipped", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  TIMED_OUT: { label: "Time ran out", className: "border-warning/40 bg-warning/10 text-warning" },
  NOT_REACHED: { label: "Not reached", className: "text-muted-foreground" },
  REMOVED: { label: "Question removed (counted correct)", className: "text-muted-foreground" },
};

// IST calendar day, matching the backend's dayKey ("YYYY-MM-DD").
export const istDayKey = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const DATE_RANGES = [
  { value: "today", label: "Today", days: 0 },
  { value: "7d", label: "Last 7 days", days: 6 },
  { value: "30d", label: "Last 30 days", days: 29 },
  { value: "all", label: "All time", days: null },
] as const;

export const rangeToDays = (range: string): Record<string, string> => {
  const r = DATE_RANGES.find((x) => x.value === range);
  if (!r || r.days === null) return {};
  return { from: istDayKey(new Date(Date.now() - r.days * 86_400_000)), to: istDayKey() };
};

// ---------------------------------------------------------------------------
// Quiz builder (/api/admin/quizzes — backend quizBuilder.service.ts)
// ---------------------------------------------------------------------------

export type PickMode = "RANDOM" | "FIXED";
export type AnswerReveal = "AFTER_EACH" | "AT_END" | "NEVER";
export type Level = "EASY" | "MEDIUM" | "HARD";
export type ScheduleStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "CLOSED";

export interface QuizRules {
  count: number;
  secondsPerQuestion: number;
  passMark: number;
  coinsPerPass: number;
}

export interface Readiness {
  ready: boolean;
  problems: string[];
  warnings: string[];
  poolSize: number;
}

// What the builder edits and sends (null = use the global default).
export interface QuizForm {
  title: string;
  description: string;
  mediumId: string;
  classId: string;
  chapterIds: string[];
  pickMode: PickMode;
  questionCount: number | null;
  sources: ("TEXTBOOK" | "EXTRA")[];
  difficulties: Level[];
  useMix: boolean;
  mix: Record<Level, number>;
  onlyQuizMarked: boolean;
  questionIds: string[];
  secondsPerQuestion: number | null;
  passMark: number | null;
  coinsPerPass: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  answerReveal: AnswerReveal;
  maxAttemptsPerStudent: number | null;
  availableFrom: string; // "YYYY-MM-DDTHH:mm" in India time, "" = none
  availableUntil: string;
  isPublished: boolean;
}

export interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  mediumId: string;
  medium: { id: string; name: string; slug: string };
  classId: string;
  classLevel: { id: string; name: string; slug: string };
  subject: { id: string; name: string; slug: string } | null;
  chapter: { id: string; number: number; title: string } | null;
  chapterIds: string[];
  questionIds: string[];
  pickMode: PickMode;
  questionCount: number | null;
  sources: ("TEXTBOOK" | "EXTRA")[];
  difficulties: Level[];
  difficultyMix: Partial<Record<Level, number>> | null;
  onlyQuizMarked: boolean;
  secondsPerQuestion: number | null;
  passMark: number | null;
  coinsPerPass: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  answerReveal: AnswerReveal;
  maxAttemptsPerStudent: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  isPublished: boolean;
  placement: { level: "CHAPTER" | "SUBJECT" | "CLASS"; label: string };
  status: ScheduleStatus;
  readiness: Readiness;
  rules: QuizRules;
  stats: { attempts: number; passRate: number | null } | null;
}

export interface PoolInfo {
  counts: {
    total: number;
    published: number;
    quizMarked: number;
    bySource: { TEXTBOOK: number; EXTRA: number };
    byDifficulty: Record<Level | "NONE", number>;
    matching: number;
    matchingByDifficulty: Record<Level, number>;
  };
  rules: QuizRules;
  readiness: Readiness;
}

export interface PickableQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  source: "TEXTBOOK" | "EXTRA";
  difficulty: Level | null;
  isPublished: boolean;
  useInQuiz: boolean;
  chapterId: string;
  chapter: { number: number; title: string; subject: { id: string; name: string } };
}

export const SCHEDULE_STATUS: Record<ScheduleStatus, { label: string; className: string }> = {
  LIVE: { label: "Live", className: "border-success/30 bg-success/10 text-success" },
  DRAFT: { label: "Draft", className: "text-muted-foreground" },
  SCHEDULED: { label: "Scheduled", className: "border-primary/30 bg-primary/10 text-brand-amber-text" },
  CLOSED: { label: "Closed", className: "border-warning/40 bg-warning/10 text-warning" },
};

export const REVEAL_LABEL: Record<AnswerReveal, string> = {
  AFTER_EACH: "Right answer after each question",
  AT_END: "Answers shown at the end",
  NEVER: "Score only — answers never shown",
};

export const LEVELS: { value: Level; label: string }[] = [
  { value: "EASY", label: "Easy" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HARD", label: "Hard" },
];

// India time <-> the backend's UTC instants, for <input type="datetime-local">.
const IST_MS = 5.5 * 3600_000;
export const istInputFromIso = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 16) : "");
export const isoFromIstInput = (value: string) => (value ? new Date(new Date(`${value}:00Z`).getTime() - IST_MS).toISOString() : null);
export const formatIst = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export const emptyQuizForm = (prefill: Partial<QuizForm> = {}): QuizForm => ({
  title: "",
  description: "",
  mediumId: "",
  classId: "",
  chapterIds: [],
  pickMode: "RANDOM",
  questionCount: null,
  sources: [],
  difficulties: [],
  useMix: false,
  mix: { EASY: 0, MEDIUM: 0, HARD: 0 },
  onlyQuizMarked: true,
  questionIds: [],
  secondsPerQuestion: null,
  passMark: null,
  coinsPerPass: null,
  shuffleQuestions: true,
  shuffleOptions: false,
  answerReveal: "AFTER_EACH",
  maxAttemptsPerStudent: null,
  availableFrom: "",
  availableUntil: "",
  isPublished: false,
  ...prefill,
});

export const formFromQuiz = (q: QuizRow): QuizForm => ({
  title: q.title,
  description: q.description ?? "",
  mediumId: q.mediumId,
  classId: q.classId,
  chapterIds: q.chapterIds,
  pickMode: q.pickMode,
  questionCount: q.questionCount,
  sources: q.sources,
  difficulties: q.difficulties,
  useMix: Boolean(q.difficultyMix && Object.values(q.difficultyMix).some((n) => (n ?? 0) > 0)),
  mix: { EASY: q.difficultyMix?.EASY ?? 0, MEDIUM: q.difficultyMix?.MEDIUM ?? 0, HARD: q.difficultyMix?.HARD ?? 0 },
  onlyQuizMarked: q.onlyQuizMarked,
  questionIds: q.questionIds,
  secondsPerQuestion: q.secondsPerQuestion,
  passMark: q.passMark,
  coinsPerPass: q.coinsPerPass,
  shuffleQuestions: q.shuffleQuestions,
  shuffleOptions: q.shuffleOptions,
  answerReveal: q.answerReveal,
  maxAttemptsPerStudent: q.maxAttemptsPerStudent,
  availableFrom: istInputFromIso(q.availableFrom),
  availableUntil: istInputFromIso(q.availableUntil),
  isPublished: q.isPublished,
});

// Form → API body. Only meaningful fields for the chosen mode are sent.
export const bodyFromForm = (f: QuizForm) => ({
  title: f.title.trim() || "Untitled quiz",
  description: f.description.trim() || null,
  mediumId: f.mediumId,
  classId: f.classId || undefined,
  chapterIds: f.chapterIds,
  pickMode: f.pickMode,
  // With a mix, the count is the mix total.
  questionCount: f.pickMode === "RANDOM" && !f.useMix ? f.questionCount : null,
  sources: f.sources,
  difficulties: f.difficulties,
  difficultyMix: f.pickMode === "RANDOM" && f.useMix ? f.mix : null,
  onlyQuizMarked: f.onlyQuizMarked,
  questionIds: f.pickMode === "FIXED" ? f.questionIds : [],
  secondsPerQuestion: f.secondsPerQuestion,
  passMark: f.passMark,
  coinsPerPass: f.coinsPerPass,
  shuffleQuestions: f.shuffleQuestions,
  shuffleOptions: f.shuffleOptions,
  answerReveal: f.answerReveal,
  maxAttemptsPerStudent: f.maxAttemptsPerStudent,
  availableFrom: isoFromIstInput(f.availableFrom),
  availableUntil: isoFromIstInput(f.availableUntil),
  isPublished: f.isPublished,
});
