// Phase 14 (client requirements of 6 Nov 2026): blog, announcements, notices,
// likes and saves. Shapes match backend/src/services/{blog,announcement,
// notification,reaction}.service.ts.

export type BlogStatus = "DRAFT" | "PUBLISHED";

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  order: number;
  isActive: boolean;
  _count: { posts: number };
}

export interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  coverAlt: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  status: BlogStatus;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { likes: number; savedBy: number };
}

export interface BlogPost extends BlogPostRow {
  bodyHtml: string;
}

/** Published, but with a date still to come. */
export const isScheduled = (p: Pick<BlogPostRow, "status" | "publishedAt">) => p.status === "PUBLISHED" && p.publishedAt !== null && new Date(p.publishedAt) > new Date();

export interface Announcement {
  id: string;
  title: string;
  bodyHtml: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  link: string | null;
  linkLabel: string | null;
  audience: "EVERYONE" | "STUDENTS";
  classLevelId: string | null;
  classLevel: { id: string; name: string } | null;
  isPublished: boolean;
  startsAt: string | null;
  endsAt: string | null;
  order: number;
}

/** "Live" / "Starts 12 Nov" / "Ended" / "Hidden" */
export const announcementState = (a: Pick<Announcement, "isPublished" | "startsAt" | "endsAt">): { label: string; live: boolean } => {
  if (!a.isPublished) return { label: "Hidden", live: false };
  const now = Date.now();
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return { label: "Ended", live: false };
  if (a.startsAt && new Date(a.startsAt).getTime() > now) return { label: `Starts ${shortDate(a.startsAt)}`, live: false };
  return { label: "Live", live: true };
};

export const audienceLabel = (a: Pick<Announcement, "audience" | "classLevel">) =>
  a.audience === "EVERYONE" ? "Everyone" : a.classLevel ? `Signed-in students of ${a.classLevel.name}` : "Signed-in students";

export type NoticeKind = "NOTICE" | "WARNING" | "ACCOUNT";

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  link: string | null;
  emailNote: string | null;
  createdAt: string;
  reads: number;
  user: { id: string; name: string | null; email: string } | null;
  sentBy: { id: string; name: string | null; email: string } | null;
}

export const NOTICE_KIND: Record<NoticeKind, { label: string; className: string }> = {
  NOTICE: { label: "Notice", className: "border-primary/40 bg-primary/10 text-brand-amber-text" },
  WARNING: { label: "Warning", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  ACCOUNT: { label: "From the site", className: "text-muted-foreground" },
};

export interface ReactionRow {
  id: string;
  type: "CHAPTER" | "BLOG_POST";
  savedAt: string;
  title: string;
  chapterNumber: number | null;
  context: string;
  href: string;
  available: boolean;
  user: { id: string; name: string | null; email: string };
}

export interface TopItem {
  targetId: string;
  count: number;
  title: string;
  context: string;
  type: "CHAPTER" | "BLOG_POST";
  chapterNumber: number | null;
}

export const itemTitle = (i: { type: "CHAPTER" | "BLOG_POST"; chapterNumber: number | null; title: string }) =>
  i.type === "CHAPTER" && i.chapterNumber !== null ? `Chapter ${i.chapterNumber}: ${i.title}` : i.title;

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

// <input type="datetime-local"> works in local time; the API wants ISO.
export const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
