// Shapes from /api/admin/chapters/:id/content and the question/video routes.

export type QuestionKind = "QA" | "MCQ";
export type QuestionSource = "TEXTBOOK" | "EXTRA";
export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export interface Question {
  id: string;
  chapterId: string;
  kind: QuestionKind;
  source: QuestionSource;
  question: string;
  answer: string | null;
  options: string[] | null;
  correctIndex: number | null;
  explanation: string | null;
  difficulty: Difficulty | null;
  order: number;
  isPublished: boolean;
  // MCQ: may appear in quizzes
  useInQuiz: boolean;
}

export interface Video {
  id: string;
  chapterId: string;
  youtubeId: string;
  title: string;
  order: number;
}

export interface ChapterContent {
  id: string;
  subjectId: string;
  partId: string | null;
  number: number;
  title: string;
  slug: string;
  isPublished: boolean;
  aboutHtml: string | null;
  subject: {
    id: string;
    name: string;
    slug: string;
    medium: { id: string; name: string; slug: string };
    classLevel: { id: string; name: string; slug: string };
  };
  part: { id: string; title: string } | null;
  questions: Question[];
  videos: Video[];
}

export const SECTIONS: { source: QuestionSource; kind: QuestionKind; title: string; hint: string }[] = [
  { source: "TEXTBOOK", kind: "QA", title: "Textbook question-answers", hint: "Questions from the school book." },
  { source: "EXTRA", kind: "QA", title: "Extra question-answers", hint: "Advanced questions beyond the book." },
  { source: "TEXTBOOK", kind: "MCQ", title: "Textbook MCQs", hint: "Also used in chapter quizzes." },
  { source: "EXTRA", kind: "MCQ", title: "Extra MCQs", hint: "Also used in chapter quizzes." },
];

// Plain-text excerpt of stored HTML for list rows.
export const toText = (html: string | null | undefined) => {
  if (!html) return "";
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, " ");
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|li|h\d)>/gi, " "), "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
};

export const LETTERS = ["A", "B", "C", "D", "E", "F"];
