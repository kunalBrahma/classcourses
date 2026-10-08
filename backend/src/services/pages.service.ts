import { requireSetting } from "./settings.service";

// Static pages the site has. Razorpay KYC expects Terms, Privacy, Contact and
// a Cancellation/Refund policy to be live (requirements PDF §1.4).
export const PAGE_SLUGS = ["about", "contact", "privacy", "terms", "refund-policy"] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];
export const isPageSlug = (slug: string): slug is PageSlug => (PAGE_SLUGS as readonly string[]).includes(slug);

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const rupees = (paise: number) => {
  const r = paise / 100;
  return Number.isInteger(r) ? `₹${r}` : `₹${r.toFixed(2)}`;
};

// {{tokens}} usable in page and FAQ text, filled from live settings when
// served — so the FAQ never goes stale when the admin changes quiz or coin rules.
export const getPageTokens = async (): Promise<Record<string, string>> => {
  const [quiz, coins, contact, site] = await Promise.all([
    requireSetting("quiz"),
    requireSetting("coins"),
    requireSetting("contact"),
    requireSetting("site"),
  ]);
  return {
    "site.name": site.name,
    "contact.email": contact.email,
    "quiz.questionsPerQuiz": String(quiz.questionsPerQuiz),
    "quiz.secondsPerQuestion": String(quiz.secondsPerQuestion),
    "quiz.passMark": String(quiz.passMark),
    "quiz.dailyLimit": String(quiz.dailyLimit),
    "coins.perPass": String(coins.perPass),
    "coins.coinValue": rupees(coins.coinValuePaise),
    "coins.maxDiscountPercent": String(coins.maxDiscountPercent),
  };
};

export const PAGE_TOKEN_NAMES = [
  "site.name",
  "contact.email",
  "quiz.questionsPerQuiz",
  "quiz.secondsPerQuestion",
  "quiz.passMark",
  "quiz.dailyLimit",
  "coins.perPass",
  "coins.coinValue",
  "coins.maxDiscountPercent",
];

// Unknown tokens are left as-is so typos are visible, not silently blanked.
// HTML fields get escaped values; plain-text fields (FAQ questions) don't.
export const renderTokens = (text: string, tokens: Record<string, string>, opts: { html: boolean } = { html: true }) =>
  text.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (match, name: string) =>
    name in tokens ? (opts.html ? escapeHtml(tokens[name]) : tokens[name]) : match
  );
