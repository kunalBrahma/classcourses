// Static pages + FAQ, and the {{tokens}} the backend fills from live settings
// (backend/src/services/pages.service.ts — keep labels/values in sync).

export const PAGE_LABELS: Record<string, { title: string; hint: string; legal?: boolean }> = {
  about: { title: "About Us", hint: "Mission, vision and what students get." },
  contact: { title: "Helpline", hint: "Shown beside the Helpline form. Email only, never a phone number." },
  privacy: { title: "Privacy Policy", hint: "The client's own text. Linked in the footer and at checkout.", legal: true },
  terms: { title: "Terms and Conditions", hint: "The client's own text. Linked in the footer and at checkout.", legal: true },
  "refund-policy": { title: "Refund Policy", hint: "The client's own text. Linked at checkout.", legal: true },
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
  { name: "operator.line", label: "Operated by" },
  { name: "operator.address", label: "Address" },
  { name: "operator.grievanceName", label: "Grievance Officer" },
  { name: "operator.grievanceDesignation", label: "Grievance Officer's designation" },
  { name: "operator.grievanceEmail", label: "Grievance Officer email" },
  { name: "operator.replyWithinHours", label: "Reply within (hours)" },
  { name: "operator.resolveWithinDays", label: "Resolve within (days)" },
];

export interface PublicSettings {
  quiz: { questionsPerQuiz: number; secondsPerQuestion: number; passMark: number; dailyLimit: number };
  coins: { perPass: number; coinValuePaise: number; maxDiscountPercent: number };
  contact: { email: string };
  site: { name: string };
  operator: {
    operatorLine: string;
    address: string;
    grievanceName: string;
    grievanceDesignation: string;
    grievanceEmail: string;
    replyWithinHours: number;
    resolveWithinDays: number;
  };
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
  "operator.line": s.operator.operatorLine,
  "operator.address": s.operator.address,
  "operator.grievanceName": s.operator.grievanceName,
  "operator.grievanceDesignation": s.operator.grievanceDesignation,
  "operator.grievanceEmail": s.operator.grievanceEmail,
  "operator.replyWithinHours": String(s.operator.replyWithinHours),
  "operator.resolveWithinDays": String(s.operator.resolveWithinDays),
});

// GET /api/admin/pages/:slug/standard: the standard text (for the legal pages,
// the client's own) to load into the editor. Nothing is saved until Save.
export interface StandardPage {
  standard: { title: string; bodyHtml: string; preview: string };
  matchesCurrent: boolean;
}

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
