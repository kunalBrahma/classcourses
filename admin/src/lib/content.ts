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

export type VideoFormat = "LANDSCAPE" | "SHORT";

export interface Video {
  id: string;
  chapterId: string;
  youtubeId: string;
  format: VideoFormat;
  // Set = shown in the home page "Videos" row.
  featuredAt: string | null;
  title: string;
  order: number;
}

export const VIDEO_FORMATS: { value: VideoFormat; label: string; hint: string }[] = [
  { value: "LANDSCAPE", label: "Long video", hint: "Wide 16:9" },
  { value: "SHORT", label: "Short", hint: "Tall 9:16" },
];

// Preview-only copy of backend/src/utils/youtube.ts (the server is the
// authority and re-checks every link). isShort only for /shorts/ links.
export const parseYouTubeLink = (input: string): { id: string; isShort: boolean } | null => {
  const value = input.trim();
  const ID = /^[A-Za-z0-9_-]{11}$/;
  if (ID.test(value)) return { id: value, isShort: false };
  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : (/^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null);
  }
  return id && ID.test(id) ? { id, isShort: url.pathname.startsWith("/shorts/") } : null;
};

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youtubeWatchUrl = (v: Pick<Video, "youtubeId" | "format">) =>
  v.format === "SHORT" ? `https://www.youtube.com/shorts/${v.youtubeId}` : `https://www.youtube.com/watch?v=${v.youtubeId}`;

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
