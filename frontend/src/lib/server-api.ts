import "server-only";
import { cacheLife, cacheTag } from "next/cache";

// Server-side reads of public backend data, cached with Cache Components.
// Tags let a future revalidate hook refresh exactly what an admin changed.
// On API errors we fall back to safe defaults rather than failing the page
// (and the fallback is only cached briefly).

// Inside Docker/production the frontend can reach the API on a private URL.
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// For pages: 404 → null (the page calls notFound()); any other failure throws,
// so an API outage shows the error page instead of a wrong "not found".
async function getJsonOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const seg = encodeURIComponent;

export interface SocialLinks {
  youtube: string | null;
  facebook: string | null;
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
}

export interface PublicSettings {
  site: { name: string; frontendUrl: string };
  contact: { email: string };
  social: SocialLinks;
  quiz: { questionsPerQuiz: number; secondsPerQuestion: number; passMark: number; dailyLimit: number };
  coins: { perPass: number; coinValuePaise: number; maxDiscountPercent: number; awardRule?: "firstPassPerChapter" | "firstPassPerChapterPerDay" | "everyPass" };
}

const FALLBACK_SETTINGS: PublicSettings = {
  site: { name: "Class Course", frontendUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100" },
  contact: { email: "about.classcourse@gmail.com" },
  social: { youtube: null, facebook: null, instagram: null, twitter: null, linkedin: null },
  quiz: { questionsPerQuiz: 10, secondsPerQuestion: 10, passMark: 7, dailyLimit: 10 },
  coins: { perPass: 10, coinValuePaise: 10, maxDiscountPercent: 50, awardRule: "firstPassPerChapter" },
};

export async function getSiteSettings(): Promise<PublicSettings> {
  "use cache";
  cacheTag("settings");
  try {
    const { settings } = await getJson<{ settings: PublicSettings }>("/api/settings/public");
    cacheLife("minutes");
    return settings;
  } catch {
    cacheLife("seconds");
    return FALLBACK_SETTINGS;
  }
}

export interface PageLink {
  slug: string;
  title: string;
  updatedAt: string;
}

// Published static pages, in footer order (About, Contact, Privacy, Terms, Refund).
export async function getPublishedPages(): Promise<PageLink[]> {
  "use cache";
  cacheTag("pages");
  try {
    const { pages } = await getJson<{ pages: PageLink[] }>("/api/content/pages");
    cacheLife("minutes");
    return pages;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

export interface Medium {
  id: string;
  name: string;
  nativeName: string | null;
  slug: string;
}

export async function getMediums(): Promise<Medium[]> {
  "use cache";
  cacheTag("catalog");
  try {
    const { mediums } = await getJson<{ mediums: Medium[] }>("/api/catalog/mediums");
    cacheLife("minutes");
    return mediums;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

// ---- Static pages & FAQ (published only; {{tokens}} already filled in) -----

export interface SitePage {
  slug: string;
  title: string;
  bodyHtml: string;
  updatedAt: string;
}

export async function getPage(slug: string): Promise<SitePage | null> {
  "use cache";
  cacheTag("pages");
  cacheLife("minutes");
  const data = await getJsonOrNull<{ page: SitePage }>(`/api/content/pages/${seg(slug)}`);
  return data?.page ?? null;
}

export interface FaqItem {
  id: string;
  question: string;
  answerHtml: string;
}

export async function getFaq(): Promise<FaqItem[]> {
  "use cache";
  cacheTag("pages");
  try {
    const { items } = await getJson<{ items: FaqItem[] }>("/api/content/faq");
    cacheLife("minutes");
    return items;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

// ---- Catalog (Medium → Class → Subject → Chapter) -------------------------
// Cached for minutes and tagged "catalog"; a missing/hidden item is null.

export interface ClassLevel {
  id: string;
  name: string;
  nativeName: string | null;
  slug: string;
}

export interface ChapterLink {
  id: string;
  number: number;
  title: string;
  slug: string;
}

/** Chapters in reading order; `part: null` = chapters outside any part (first). */
export interface ChapterGroup {
  part: { id: string; title: string } | null;
  chapters: ChapterLink[];
}

export interface MediumClasses {
  medium: Medium;
  classes: (ClassLevel & { subjectCount: number })[];
}

export async function getMediumClasses(medium: string): Promise<MediumClasses | null> {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  return getJsonOrNull<MediumClasses>(`/api/catalog/mediums/${seg(medium)}`);
}

export interface ClassSubjects {
  medium: Medium;
  classLevel: ClassLevel;
  subjects: { id: string; name: string; nativeName: string | null; slug: string; chapterCount: number; groups: ChapterGroup[] }[];
}

export async function getClassSubjects(medium: string, classSlug: string): Promise<ClassSubjects | null> {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  return getJsonOrNull<ClassSubjects>(`/api/catalog/mediums/${seg(medium)}/classes/${seg(classSlug)}`);
}

export interface SubjectDetail {
  id: string;
  name: string;
  nativeName: string | null;
  slug: string;
  medium: Medium;
  classLevel: ClassLevel;
  chapterCount: number;
  groups: ChapterGroup[];
}

export async function getSubject(medium: string, classSlug: string, subject: string): Promise<SubjectDetail | null> {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  const data = await getJsonOrNull<{ subject: SubjectDetail }>(
    `/api/catalog/mediums/${seg(medium)}/classes/${seg(classSlug)}/subjects/${seg(subject)}`
  );
  return data?.subject ?? null;
}

export interface NeighbourChapter {
  number: number;
  title: string;
  slug: string;
  partTitle: string | null;
}

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | null;

/** Rich text is HTML, already sanitised by the backend (sanitizeHtml.ts). */
export interface QaItem {
  id: string;
  question: string;
  answer: string;
  difficulty: Difficulty;
}

/** No correct answer here: practice checks via POST /api/catalog/questions/:id/check. */
export interface McqItem {
  id: string;
  question: string;
  options: string[];
  difficulty: Difficulty;
}

export interface ChapterContent {
  textbook: { qa: QaItem[]; mcq: McqItem[] };
  extra: { qa: QaItem[]; mcq: McqItem[] };
}

export interface ChapterPage {
  chapter: { id: string; number: number; title: string; slug: string; aboutHtml: string | null; part: { id: string; title: string } | null; updatedAt: string };
  content: ChapterContent;
  subject: { id: string; name: string; nativeName: string | null; slug: string };
  medium: Medium;
  classLevel: ClassLevel;
  videos: { id: string; youtubeId: string; format: "LANDSCAPE" | "SHORT"; title: string }[];
  /** This chapter's notes + whole-subject notes. */
  notes: { id: string; title: string; description: string | null; pricePaise: number; isFree: boolean; scope: "chapter" | "subject" }[];
  /** null on the first / last chapter → that button is disabled. */
  prev: NeighbourChapter | null;
  next: NeighbourChapter | null;
  position: { index: number; total: number };
}

export async function getChapter(medium: string, classSlug: string, subject: string, chapter: string): Promise<ChapterPage | null> {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  return getJsonOrNull<ChapterPage>(
    `/api/catalog/mediums/${seg(medium)}/classes/${seg(classSlug)}/subjects/${seg(subject)}/chapters/${seg(chapter)}`
  );
}

// Quizzes a guest can see on a chapter page (public list; the signed-in
// student's attempts are fetched in the browser).
export interface PublicQuiz {
  id: string;
  kind: "CHAPTER" | "CUSTOM";
  title: string;
  description: string | null;
  questions: number;
  secondsPerQuestion: number;
  passMark: number;
  coinsPerPass: number;
}

export async function getChapterQuizzes(chapterId: string): Promise<PublicQuiz[]> {
  "use cache";
  cacheTag("catalog");
  try {
    const { quizzes } = await getJson<{ quizzes: PublicQuiz[] }>(`/api/catalog/quizzes?chapterId=${seg(chapterId)}`);
    cacheLife("minutes");
    return quizzes;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

// ---- Notes (public store list; ownership is checked in the browser) --------

export interface StoreNote {
  id: string;
  title: string;
  description: string | null;
  pricePaise: number;
  isFree: boolean;
  place: {
    medium: { name: string; slug: string };
    classLevel: { name: string; slug: string };
    subject: { name: string; nativeName: string | null; slug: string };
    chapter: { number: number; title: string; slug: string } | null;
    href: string;
  } | null;
}

export async function getStoreNotes(): Promise<StoreNote[]> {
  "use cache";
  cacheTag("catalog");
  try {
    const { notes } = await getJson<{ notes: StoreNote[] }>("/api/notes");
    cacheLife("minutes");
    return notes;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

// ---- Home page rows ---------------------------------------------------------

export interface FeaturedVideo {
  id: string;
  youtubeId: string;
  format: "LANDSCAPE" | "SHORT";
  title: string;
  createdAt: string;
  chapter: { title: string; number: number; href: string };
  subject: { name: string; nativeName: string | null };
  classLevel: { name: string; slug: string };
}

export interface VideoPage {
  videos: FeaturedVideo[];
  total: number;
  page: number;
  totalPages: number;
  classes: { name: string; slug: string }[];
}

export const EMPTY_VIDEO_PAGE: VideoPage = { videos: [], total: 0, page: 1, totalPages: 1, classes: [] };

// First page of /videos (all mediums and classes); the page filters further in the browser.
export async function getVideoPage(format: "LANDSCAPE" | "SHORT"): Promise<VideoPage> {
  "use cache";
  cacheTag("catalog");
  try {
    const page = await getJson<VideoPage>(`/api/catalog/videos?format=${format}`);
    cacheLife("minutes");
    return page;
  } catch {
    cacheLife("seconds");
    return EMPTY_VIDEO_PAGE;
  }
}

export async function getFeaturedVideos(): Promise<FeaturedVideo[]> {
  "use cache";
  cacheTag("catalog");
  try {
    const { videos } = await getJson<{ videos: FeaturedVideo[] }>("/api/catalog/videos/featured");
    cacheLife("minutes");
    return videos;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

export interface CatalogStats {
  classes: number;
  subjects: number;
  chapters: number;
  qa: number;
  mcq: number;
  videos: number;
}

// Totals for the About page (visible content only).
export async function getCatalogStats(): Promise<CatalogStats | null> {
  "use cache";
  cacheTag("catalog");
  try {
    const { stats } = await getJson<{ stats: CatalogStats }>("/api/catalog/stats");
    cacheLife("minutes");
    return stats;
  } catch {
    cacheLife("seconds");
    return null;
  }
}

export interface NewsLink {
  id: string;
  source: string;
  title: string;
  url: string;
  imageUrl?: string | null;
}

export async function getNews(): Promise<NewsLink[]> {
  "use cache";
  cacheTag("pages");
  try {
    const { items } = await getJson<{ items: NewsLink[] }>("/api/content/news");
    cacheLife("minutes");
    return items;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

// Reading the clock during prerender must be cached under Cache Components.
export async function getCurrentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
