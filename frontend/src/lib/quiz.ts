import { API_URL, apiJson } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { catalogHref, chapterName } from "@/lib/catalog";

// Shapes from the student quiz API (backend/src/services/quiz.service.ts
// toAttemptView). The server owns every rule: timer, scoring, coins.

export type AttemptStatus = "IN_PROGRESS" | "PAUSED" | "PASSED" | "FAILED" | "EXPIRED";
export type AnswerReveal = "AFTER_EACH" | "AT_END" | "NEVER";

export interface OpenQuestion {
  /** Position only: no question id is sent mid-quiz. */
  index: number;
  question: string;
  options: string[];
  deadline: string;
  remainingMs: number;
}

export interface ReviewItem {
  index: number;
  question: string | null;
  options: string[];
  chosenIndex: number | null;
  correctIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  explanation: string | null;
}

export interface Attempt {
  id: string;
  status: AttemptStatus;
  resumableUntil: string | null;
  total: number;
  currentIndex: number;
  answered: number;
  score: number | null;
  secondsPerQuestion: number;
  passMark: number;
  answerReveal: AnswerReveal;
  passed: boolean | null;
  coinsAwarded: number;
  startedAt: string;
  finishedAt: string | null;
  quiz: { id: string; title: string } | null;
  title: string;
  chapter: {
    id: string;
    title: string;
    slug: string;
    number: number;
    subject: { name: string; nativeName: string | null; slug: string };
    medium: { slug: string; name: string };
    classLevel: { name: string; slug: string };
  } | null;
  question: OpenQuestion | null;
  review: ReviewItem[] | null;
}

export interface AnswerResult {
  /** null when the quiz only shows answers at the end (or never). */
  correct: boolean | null;
  timedOut: boolean;
  correctIndex: number | null;
  explanation: string | null;
  attempt: Attempt;
}

export interface AvailableQuiz {
  id: string; // "auto" = the chapter's automatic quiz
  kind: "CHAPTER" | "CUSTOM";
  title: string;
  description: string | null;
  questions: number;
  secondsPerQuestion: number;
  passMark: number;
  coinsPerPass: number;
  answerReveal: AnswerReveal;
  attemptsUsed: number;
  attemptsLeft: number | null;
  resumeAttemptId: string | null;
}

export const FINISHED: AttemptStatus[] = ["PASSED", "FAILED", "EXPIRED"];
export const isFinished = (a: Pick<Attempt, "status">) => FINISHED.includes(a.status);
export const quizHref = (attemptId: string) => `/quiz/${attemptId}`;

export const chapterHrefOf = (a: Pick<Attempt, "chapter">) =>
  a.chapter ? catalogHref(a.chapter.medium.slug, a.chapter.classLevel.slug, a.chapter.subject.slug, a.chapter.slug) : null;

/** What to start: a chapter's automatic quiz or a custom quiz. */
export type QuizTarget = { chapterId: string } | { quizId: string };
export const targetOf = (quiz: Pick<AvailableQuiz, "id">, chapterId?: string): QuizTarget =>
  quiz.id === "auto" ? { chapterId: chapterId! } : { quizId: quiz.id };

// Starts (or resumes today's unfinished attempt of) a quiz.
export const startQuiz = (target: QuizTarget) =>
  apiJson<{ resumed: boolean; attempt: Attempt }>("/api/quiz/start", { method: "POST", json: target });

// Fire-and-forget pause that survives the page closing (pagehide / tab switch).
// Mid-question the server counts that question as wrong (the agreed rule).
export const pauseOnLeave = (attemptId: string) => {
  const token = getAccessToken();
  if (!token) return;
  fetch(`${API_URL}/api/quiz/attempts/${attemptId}/pause`, {
    method: "POST",
    keepalive: true,
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
};

// "Assamese · Chapter 2" for chapter quizzes (a bare "Chapter 2" says nothing
// on its own); a custom quiz keeps its title. `withClass` adds "· Class 3".
export const attemptLabel = (a: Pick<Attempt, "quiz" | "chapter" | "title">, withClass = false) =>
  a.quiz
    ? a.quiz.title
    : a.chapter
      ? `${a.chapter.subject.name} · ${chapterName(a.chapter)}${withClass ? ` · ${a.chapter.classLevel.name}` : ""}`
      : a.title;
