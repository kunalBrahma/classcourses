// Every rate limit the API applies, with its default. The `security` setting
// (Admin → Settings → Security) can change each one, so none is a fixed
// number in the code (client requirements of 6 Nov 2026). Keep the labels
// plain: the admin page shows them.

export interface RequestLimitDef {
  limit: number;
  windowMinutes: number;
  label: string;
  // Who it counts: the network (IP), the signed-in student, or the email asked about
  per: "network" | "student" | "email";
}

// Request limits (in memory, per API process; see middleware/rateLimiter.ts).
export const REQUEST_LIMITS = {
  signup: { limit: 15, windowMinutes: 60, per: "network", label: "New accounts" },
  forgotPassword: { limit: 10, windowMinutes: 15, per: "network", label: "Password reset requests" },
  forgotPasswordEmail: { limit: 3, windowMinutes: 60, per: "email", label: "Password reset codes to one email" },
  resetPassword: { limit: 10, windowMinutes: 15, per: "network", label: "Password reset code entries" },
  emailCode: { limit: 20, windowMinutes: 15, per: "network", label: "Sign-up code entries and resends" },
  googleSignIn: { limit: 30, windowMinutes: 15, per: "network", label: "Google sign-ins" },
  unlockCode: { limit: 10, windowMinutes: 15, per: "network", label: "Unlock code requests and entries" },
  contact: { limit: 5, windowMinutes: 60, per: "network", label: "Helpline messages" },
  quiz: { limit: 90, windowMinutes: 1, per: "student", label: "Quiz requests" },
  payments: { limit: 30, windowMinutes: 1, per: "student", label: "Payment and order requests" },
  search: { limit: 60, windowMinutes: 1, per: "network", label: "Searches" },
  checkAnswer: { limit: 40, windowMinutes: 1, per: "network", label: "Practice answer checks" },
  api: { limit: 600, windowMinutes: 1, per: "network", label: "All API requests (backstop)" },
} satisfies Record<string, RequestLimitDef>;

export type RequestLimitName = keyof typeof REQUEST_LIMITS;
export const REQUEST_LIMIT_NAMES = Object.keys(REQUEST_LIMITS) as RequestLimitName[];

// Failed sign-ins (stored in the database, so a restart, a refresh or another
// browser doesn't reset them). After `max` failures within `windowMinutes`
// the account (or network) waits `lockMinutes`; each further lock doubles the
// wait, up to the cap. Admin accounts have their own rule and a short cap, so
// nobody can lock the Founder out for long, and an unlock code can be emailed.
export const LOGIN_DEFAULTS = {
  loginAccountMax: 5,
  loginIpMax: 20,
  loginWindowMinutes: 15,
  loginLockMinutes: 15,
  loginLockMaxHours: 24,
  adminLoginMax: 5,
  adminLockMaxMinutes: 60,
};

// One-time codes for "forgot password" and "unlock my account" (client:
// exactly 5 minutes; a new code cancels the old one).
export const AUTH_CODE_TTL_SECONDS = 5 * 60;
export const AUTH_CODE_MAX_ATTEMPTS = 5;
export const AUTH_CODE_RESEND_SECONDS = 60;
