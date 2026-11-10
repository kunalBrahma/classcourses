// Helper admins (client requirements of 6 Nov 2026): the Founder is the
// Super Admin with full access; helper admins get only the sections ticked
// for them. Every /api/admin route belongs to exactly one section below, by
// its first path segment; anything not listed is Super Admin only.

export const ADMIN_PERMISSIONS = {
  content: "Content: classes, subjects, chapters, questions, videos, quizzes, pages, FAQ, news, banners, blog, announcements",
  quiz_reports: "Quiz reports: attempts and statistics",
  notes_orders: "Notes and orders: premium notes, orders, refunds",
  users: "Students: view, edit details, suspend, sign out, coins, notices and warnings, likes and saves",
  support: "Helpline: read and answer messages",
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;
export const ADMIN_PERMISSION_NAMES = Object.keys(ADMIN_PERMISSIONS) as AdminPermission[];

// First path segment under /api/admin → section. "dashboard" = every admin.
const SECTIONS: Record<string, AdminPermission | "dashboard"> = {
  stats: "dashboard",
  mediums: "content",
  classes: "content",
  districts: "content",
  subjects: "content",
  parts: "content",
  chapters: "content",
  questions: "content",
  videos: "content",
  uploads: "content",
  quizzes: "content",
  "quiz-questions": "content",
  pages: "content",
  faq: "content",
  news: "content",
  banners: "content",
  blog: "content",
  announcements: "content",
  quiz: "quiz_reports",
  notes: "notes_orders",
  orders: "notes_orders",
  users: "users",
  notices: "users",
  reactions: "users",
  messages: "support",
};

// Within "users", these stay with the Super Admin: blocking, deleting an
// account, changing someone's role, and recording / withdrawing consent.
const SUPER_ONLY: { method: string; pattern: RegExp }[] = [
  // Recording or withdrawing a parent's consent is a legal record
  { method: "POST", pattern: /^\/users\/[^/]+\/consent\/(record|withdraw)$/ },
  { method: "POST", pattern: /^\/users\/[^/]+\/(block|unblock)$/ },
  { method: "DELETE", pattern: /^\/users\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/users\/[^/]+$/ },
];

/** What a request needs: a section (helpers with it may), "dashboard" (any admin) or "super". */
export const accessFor = (method: string, path: string): AdminPermission | "dashboard" | "super" => {
  if (SUPER_ONLY.some((r) => r.method === method && r.pattern.test(path))) return "super";
  const segment = path.split("/")[1] ?? "";
  return SECTIONS[segment] ?? "super";
};
