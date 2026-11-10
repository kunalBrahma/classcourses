// Shapes from /api/admin/users and quiz/coin settings.

export type Role = "STUDENT" | "ADMIN";
export type CoinReason = "QUIZ_PASS" | "NOTE_DISCOUNT" | "NOTE_DISCOUNT_REFUND" | "NOTE_DISCOUNT_REAPPLIED" | "ADMIN_ADJUST" | "COIN_EXPIRED" | "REFERRAL_REWARD" | "REFERRAL_BONUS" | "REFERRAL_REVERSED";
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
  // Profile asked at sign-up (6 Nov 2026); null for older and Google accounts
  // until "complete your profile"
  district: { id: string; name: string } | null;
  dateOfBirth: string | null; // "YYYY-MM-DD"
  age: number | null;
  isMinor: boolean | null; // null = no date of birth yet
  profileComplete: boolean;
  missingProfile: ("classLevel" | "district" | "dateOfBirth")[];
  medium: { name: string } | null;
  createdAt: string;
  quizAttempts: number;
  status: AccountStatus;
  suspendedUntil: string | null;
  parentalConsent: { status: ConsentStatus } | null;
}

export type AccountStatus = "ACTIVE" | "SUSPENDED" | "BLOCKED" | "DELETED";

// suspendedUntil is when it ends (midnight after the last day): show the last day.
export const lastDay = (iso: string) => new Date(new Date(iso).getTime() - 1).toISOString();

export const STATUS_BADGE: Record<Exclude<AccountStatus, "ACTIVE">, { label: string; className: string }> = {
  SUSPENDED: { label: "Suspended", className: "border-warning/40 bg-warning/10 text-warning" },
  BLOCKED: { label: "Blocked", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  DELETED: { label: "Erased", className: "text-muted-foreground" },
};

// ---- Parental consent (under 18) ----
export type ConsentStatus = "PENDING" | "GRANTED" | "DECLINED" | "WITHDRAWN";

export interface ConsentAdmin {
  required: boolean;
  fullAccess: boolean;
  block: "NO_DATE_OF_BIRTH" | "CONSENT_REQUIRED" | null;
  record: {
    parentEmail: string;
    status: ConsentStatus;
    expiresAt: string;
    lastSentAt: string;
    sendCount: number;
    parentName: string | null;
    relationship: string | null;
    decidedAt: string | null;
    decidedVia: "parent_link" | "admin" | null;
    decidedIp: string | null;
    decidedUserAgent: string | null;
    adminNote: string | null;
  } | null;
}

export const CONSENT_BADGE: Record<ConsentStatus | "NONE", { label: string; variant: "outline" | "secondary"; className: string }> = {
  NONE: { label: "Not asked", variant: "outline", className: "border-warning/40 bg-warning/10 text-warning" },
  PENDING: { label: "Waiting for parent", variant: "outline", className: "border-warning/40 bg-warning/10 text-warning" },
  GRANTED: { label: "Given", variant: "outline", className: "border-success/30 bg-success/10 text-success" },
  DECLINED: { label: "Declined", variant: "outline", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  WITHDRAWN: { label: "Withdrawn", variant: "outline", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

// "Class 7 · Nagaon · 13 yrs", leaving out what isn't known.
export const profileLine = (u: Pick<UserRow, "classLevel" | "district" | "age">) =>
  [u.classLevel?.name, u.district?.name, u.age !== null ? `${u.age} yrs` : null].filter(Boolean).join(" · ");

export const MISSING_LABEL: Record<UserRow["missingProfile"][number], string> = {
  classLevel: "class",
  district: "district",
  dateOfBirth: "date of birth",
};

export interface CoinTxn {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: CoinReason;
  refId: string | null;
  note: string | null;
  createdAt: string;
  // Credits only: the lot it created (its expiry, what's left, what expired)
  lot?: { expiresAt: string; remaining: number; expiredAmount: number } | null;
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
  // Moderation (Phase 14): warnings sent so far, likes and saves
  warnings: number;
  // One page for everything (client requirements of 6 Nov 2026)
  orders: {
    id: string;
    status: "CREATED" | "PAID" | "CANCELLED" | "REFUNDED";
    listPricePaise: number;
    coinsUsed: number;
    amountPaise: number;
    provider: string;
    paidAt: string | null;
    createdAt: string;
    note: { title: string };
    refunds: { status: "PENDING" | "SUCCESS" | "FAILED"; amountPaise: number }[];
  }[];
  contactMessages: { id: string; topic: string; message: string; status: string; createdAt: string }[];
  savedItems: { id: string; type: "CHAPTER" | "BLOG_POST"; title: string; chapterNumber: number | null; context: string; href: string; available: boolean }[];
  referralsMade: { id: string; status: string; coinsReferrer: number; createdAt: string; referred: { id: string; name: string | null; email: string } }[];
  referredBy: { id: string; status: string; coinsFriend: number; createdAt: string; referrer: { id: string; name: string | null; email: string } } | null;
  likeCount: number;
  savedCount: number;
  email: string;
  name: string | null;
  // 10-digit mobile number from sign-up; null for older accounts
  phone: string | null;
  // false until the student enters the code emailed at sign-up
  emailVerified: boolean;
  role: Role;
  coins: number;
  classLevel: { id: string; name: string; slug: string } | null;
  // Profile asked at sign-up (6 Nov 2026); null for older and Google accounts
  // until "complete your profile"
  district: { id: string; name: string } | null;
  dateOfBirth: string | null; // "YYYY-MM-DD"
  age: number | null;
  isMinor: boolean | null; // null = no date of birth yet
  profileComplete: boolean;
  missingProfile: ("classLevel" | "district" | "dateOfBirth")[];
  signsInWithGoogle: boolean;
  adminLevel: "SUPER" | "HELPER";
  adminPermissions: string[];
  status: AccountStatus;
  suspendedUntil: string | null;
  statusReason: string | null;
  statusChangedAt: string | null;
  // Coins left by expiry date (soonest first), the next to expire, and how many expired
  coinLots: { id: string; remaining: number; creditedAt: string; expiresAt: string }[];
  nextCoinExpiry: { amount: number; expiresAt: string } | null;
  expiredCoins: number;
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
  // Coins expire this many days after they're credited (client: 90)
  validityDays: number;
}

export const COIN_REASON: Record<CoinReason, string> = {
  QUIZ_PASS: "Passed a quiz",
  NOTE_DISCOUNT: "Used for a note discount",
  NOTE_DISCOUNT_REFUND: "Returned — order not completed",
  NOTE_DISCOUNT_REAPPLIED: "Used for a note discount (paid late)",
  ADMIN_ADJUST: "Adjusted by admin",
  COIN_EXPIRED: "Expired (older than the validity period)",
  REFERRAL_REWARD: "Refer and Earn: a friend joined",
  REFERRAL_BONUS: "Refer and Earn: welcome coins",
  REFERRAL_REVERSED: "Refer and Earn: reward taken back",
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
// capped at maxDiscountPercent, never leaving 1–99 paise to pay (the gateways' minimum is ₹1).
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
