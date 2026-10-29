// Shapes from /api/admin/users and quiz/coin settings.

export type Role = "STUDENT" | "ADMIN";
export type CoinReason = "QUIZ_PASS" | "NOTE_DISCOUNT" | "NOTE_DISCOUNT_REFUND" | "ADMIN_ADJUST";
export type QuizStatus = "IN_PROGRESS" | "PAUSED" | "PASSED" | "FAILED" | "EXPIRED";
export type AwardRule = "firstPassPerChapter" | "firstPassPerChapterPerDay" | "everyPass";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  // 10-digit mobile number from sign-up; null for older accounts
  phone: string | null;
  // false until the student enters the code emailed at sign-up
  emailVerified: boolean;
  role: Role;
  coins: number;
  classLevel: { id: string; name: string; slug: string } | null;
  medium: { name: string } | null;
  createdAt: string;
  quizAttempts: number;
}

export interface CoinTxn {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: CoinReason;
  refId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AttemptRow {
  id: string;
  status: QuizStatus;
  score: number;
  passMark: number;
  coinsAwarded: number;
  dayKey: string;
  startedAt: string;
  finishedAt: string | null;
  // null for custom quizzes over several chapters
  chapter: { title: string; subject: { name: string; classLevel: { id: string; name: string; slug: string } } } | null;
  quizTitle: string | null;
  quiz: { title: string; classLevel: { id: string; name: string; slug: string } } | null;
}

export interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  // 10-digit mobile number from sign-up; null for older accounts
  phone: string | null;
  // false until the student enters the code emailed at sign-up
  emailVerified: boolean;
  role: Role;
  coins: number;
  classLevel: { id: string; name: string; slug: string } | null;
  medium: { id: string; name: string } | null;
  createdAt: string;
  coinTxns: CoinTxn[];
  quizAttempts: AttemptRow[];
}

export interface QuizSettings {
  questionsPerQuiz: number;
  secondsPerQuestion: number;
  passMark: number;
  dailyLimit: number;
  autoChapterQuizzes: boolean;
}

export interface CoinSettings {
  perPass: number;
  coinValuePaise: number;
  maxDiscountPercent: number;
  awardRule: AwardRule;
}

export const COIN_REASON: Record<CoinReason, string> = {
  QUIZ_PASS: "Passed a quiz",
  NOTE_DISCOUNT: "Used for a note discount",
  NOTE_DISCOUNT_REFUND: "Returned — order not completed",
  ADMIN_ADJUST: "Adjusted by admin",
};

export const QUIZ_STATUS: Record<QuizStatus, { label: string; className: string }> = {
  PASSED: { label: "Passed", className: "border-success/30 bg-success/10 text-success" },
  FAILED: { label: "Failed", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  IN_PROGRESS: { label: "In progress", className: "border-primary/30 bg-primary/10 text-brand-amber-text" },
  PAUSED: { label: "Paused", className: "border-warning/40 bg-warning/10 text-warning" },
  EXPIRED: { label: "Expired", className: "text-muted-foreground" },
};

export const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);

export const formatDate = (iso: string, withTime = false) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));

export const initials = (name: string | null, email: string) =>
  (name?.trim() || email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

// Same rule as backend order.service quotePrice(): discount = coins × value,
// capped at maxDiscountPercent, never leaving 1–99 paise to pay (Razorpay min ₹1).
export const quoteDiscount = (pricePaise: number, balance: number, c: CoinSettings) => {
  const maxDiscount = Math.floor((pricePaise * c.maxDiscountPercent) / 100);
  if (c.coinValuePaise <= 0 || maxDiscount <= 0 || balance <= 0) return { coinsUsed: 0, amountPaise: pricePaise };
  let coinsUsed = Math.min(balance, Math.floor(maxDiscount / c.coinValuePaise));
  let amountPaise = pricePaise - coinsUsed * c.coinValuePaise;
  if (amountPaise > 0 && amountPaise < 100) {
    const full = Math.ceil(pricePaise / c.coinValuePaise);
    if (c.maxDiscountPercent >= 100 && balance >= full) {
      coinsUsed = full;
      amountPaise = 0;
    } else {
      coinsUsed = Math.max(0, Math.floor((pricePaise - 100) / c.coinValuePaise));
      amountPaise = pricePaise - coinsUsed * c.coinValuePaise;
    }
  }
  return { coinsUsed, amountPaise };
};

// "9876543210" → "+91 98765 43210"
export const formatPhone = (phone: string) => `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
