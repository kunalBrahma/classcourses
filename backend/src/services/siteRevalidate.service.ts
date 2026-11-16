import { env } from "../config/env";

// Tells the student site to drop its cached copies right after an admin
// changes something, so a new price, chapter or page shows at once (the site
// otherwise keeps them for about a minute and refreshes only when visited).
// The site's side is frontend/src/app/api/revalidate/route.ts; the tags are
// the cacheTag() names in frontend/src/lib/server-api.ts.

export type SiteTag = "catalog" | "pages" | "blog" | "settings";

// First path segment under /api/admin → what the site caches from it.
// Not listed = nothing on the public site (orders, users, reports, …).
const TAGS_BY_SECTION: Record<string, SiteTag[]> = {
  mediums: ["catalog"],
  classes: ["catalog"],
  subjects: ["catalog"],
  parts: ["catalog"],
  chapters: ["catalog"],
  questions: ["catalog"],
  "quiz-questions": ["catalog"],
  videos: ["catalog"],
  quizzes: ["catalog"],
  notes: ["catalog"],
  pages: ["pages"],
  faq: ["pages"],
  news: ["pages"],
  banners: ["pages"],
  announcements: ["pages"],
  blog: ["blog"],
  // Page and FAQ text fill {{tokens}} from settings, so pages follow too.
  settings: ["settings", "pages"],
};

export const siteTagsFor = (adminPath: string): SiteTag[] => TAGS_BY_SECTION[adminPath.split("/")[1] ?? ""] ?? [];

const siteUrl = () => (env.SITE_INTERNAL_URL ?? env.FRONTEND_URL).replace(/\/+$/, "");

// A burst of changes (a reorder, a bulk import) becomes one call.
const pending = new Set<SiteTag>();
let timer: NodeJS.Timeout | null = null;

const flush = async () => {
  timer = null;
  const tags = [...pending];
  pending.clear();
  if (tags.length === 0 || !env.INTERNAL_API_KEY) return;
  try {
    const res = await fetch(`${siteUrl()}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": env.INTERNAL_API_KEY },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`[site refresh] the site answered ${res.status} for ${tags.join(", ")}`);
  } catch (err) {
    // Never fails the admin's change: the site still refreshes on its own within a minute.
    console.warn(`[site refresh] couldn't reach the site (${(err as Error).message})`);
  }
};

/** Asks the site to refresh these cached areas (never throws, never waits). */
export const refreshSite = (tags: SiteTag[]) => {
  if (env.NODE_ENV === "test" || tags.length === 0) return;
  tags.forEach((t) => pending.add(t));
  if (!timer) timer = setTimeout(() => void flush(), 300);
};
