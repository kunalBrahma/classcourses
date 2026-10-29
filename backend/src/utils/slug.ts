// "Logic & Philosophy" → "logic-and-philosophy". ASCII only: an Assamese-only
// name gives "" — callers fall back to a generic base (see `slugOr`).
export const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// The slug for `name`, or `fallback` when the name has no Latin letters/digits.
export const slugOr = (name: string, fallback: string) => slugify(name) || fallback;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Picks `base`, or `base-2`, `base-3`, ... when taken.
export const uniqueSlug = async (base: string, isTaken: (slug: string) => Promise<boolean>) => {
  const root = base || "item";
  let candidate = root;
  for (let i = 2; await isTaken(candidate); i += 1) {
    candidate = `${root}-${i}`;
  }
  return candidate;
};

// Automatic chapter links are "chapter-<number>" (plus "-2"… on a clash).
export const isAutoChapterSlug = (slug: string, number: number) => new RegExp(`^chapter-${number}(-\\d+)?$`).test(slug);

// Medium links sit at the top of the student site (/<medium>), next to the
// site's own pages. These words are taken by those pages, so a medium can't
// use them (keep in sync with frontend/src/app).
export const RESERVED_TOP_LEVEL = new Set([
  "about", "contact", "faq", "privacy", "terms", "refund-policy",
  "notes", "profile", "quiz", "login", "register", "forgot-password", "reset-password",
  "kit", "search", "videos", "news", "api", "admin", "sitemap.xml", "robots.txt",
]);
