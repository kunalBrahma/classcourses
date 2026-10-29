// Static pages + FAQ, and the {{tokens}} the backend fills from live settings
// (backend/src/services/pages.service.ts — keep labels/values in sync).

export const PAGE_LABELS: Record<string, { title: string; hint: string; legal?: boolean }> = {
  about: { title: "About Us", hint: "Mission, vision and what students get." },
  contact: { title: "Contact", hint: "Email only — no phone or address." },
  privacy: { title: "Privacy Policy", hint: "Required by Razorpay.", legal: true },
  terms: { title: "Terms of Service", hint: "Required by Razorpay.", legal: true },
  "refund-policy": { title: "Cancellation & Refund Policy", hint: "Required by Razorpay.", legal: true },
};

export const TOKENS: { name: string; label: string }[] = [
  { name: "site.name", label: "Site name" },
  { name: "contact.email", label: "Contact email" },
  { name: "quiz.questionsPerQuiz", label: "Questions per quiz" },
  { name: "quiz.secondsPerQuestion", label: "Seconds per question" },
  { name: "quiz.passMark", label: "Pass mark" },
  { name: "quiz.dailyLimit", label: "Daily quiz limit" },
  { name: "coins.perPass", label: "Coins per pass" },
  { name: "coins.coinValue", label: "Value of 1 coin (₹)" },
  { name: "coins.maxDiscountPercent", label: "Max coin discount %" },
];

export interface PublicSettings {
  quiz: { questionsPerQuiz: number; secondsPerQuestion: number; passMark: number; dailyLimit: number };
  coins: { perPass: number; coinValuePaise: number; maxDiscountPercent: number };
  contact: { email: string };
  site: { name: string };
}

const rupees = (paise: number) => {
  const r = paise / 100;
  return Number.isInteger(r) ? `₹${r}` : `₹${r.toFixed(2)}`;
};

export const tokenValues = (s: PublicSettings): Record<string, string> => ({
  "site.name": s.site.name,
  "contact.email": s.contact.email,
  "quiz.questionsPerQuiz": String(s.quiz.questionsPerQuiz),
  "quiz.secondsPerQuestion": String(s.quiz.secondsPerQuestion),
  "quiz.passMark": String(s.quiz.passMark),
  "quiz.dailyLimit": String(s.quiz.dailyLimit),
  "coins.perPass": String(s.coins.perPass),
  "coins.coinValue": rupees(s.coins.coinValuePaise),
  "coins.maxDiscountPercent": String(s.coins.maxDiscountPercent),
});

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Same rule as the backend: escaped in HTML, unknown tokens left visible.
export const renderTokens = (text: string, values: Record<string, string>, opts = { html: true }) =>
  text.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (match, name: string) => (name in values ? (opts.html ? escapeHtml(values[name]) : values[name]) : match));

export const unknownTokens = (text: string) =>
  [...text.matchAll(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g)].map((m) => m[1]).filter((n) => !TOKENS.some((t) => t.name === n));

export interface PageRow {
  slug: string;
  title: string | null;
  isPublished: boolean;
  updatedAt: string | null;
}

export interface Page {
  slug: string;
  title: string;
  bodyHtml: string;
  isPublished: boolean;
  updatedAt: string;
}

// Home page "Latest news" link (/api/admin/news).
export interface NewsLink {
  id: string;
  source: string;
  title: string;
  url: string;
  // Card picture (public bucket URL), or null
  imageUrl: string | null;
  order: number;
  isActive: boolean;
}

export interface FaqItem {
  id: string;
  question: string;
  answerHtml: string;
  order: number;
  isPublished: boolean;
}
