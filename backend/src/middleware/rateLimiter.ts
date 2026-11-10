import { timingSafeEqual } from "crypto";
import { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { ipKeyGenerator, MemoryStore } from "express-rate-limit";
import { AuthRequest } from "./auth.middleware";
import { env } from "../config/env";
import { RequestLimitName } from "../config/limits";
import { requireSetting, securityDefaults, SecuritySettings } from "../services/settings.service";

// Request limits, in memory per API process (one instance is assumed; see
// CLAUDE.md "Production"). Keys are the client IP (needs TRUST_PROXY right),
// the signed-in user, or the email an auth request is about.
//
// Every number comes from the `security` setting (Admin → Settings →
// Security; defaults in src/config/limits.ts), read on each request, so a
// change applies at once. Changing a window starts that limit's count afresh.
//
// Many students share one IP (mobile carrier NAT, school Wi-Fi), so IP limits
// are generous and the tight ones follow the account (email) instead.
// Failed sign-ins are NOT counted here: services/loginThrottle.service.ts
// keeps them in the database.

// Off in tests so the suite can sign in many users; tests/rateLimit.test.ts
// turns them on and starts each case from empty counters.
export const rateLimitSwitch = { enabled: env.NODE_ENV !== "test" };

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "");
const userOrIpKey = (req: Request) => (req as AuthRequest).user?.userId ?? ipKey(req);
// The email an auth request is about (lower-cased); falls back to the IP for
// a malformed body, which validation rejects anyway.
const emailKey = (prefix: string) => (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return email ? `${prefix}:${email}` : `${prefix}:ip:${ipKey(req)}`;
};

const minutes = (n: number) => (n === 1 ? "a minute" : n < 60 ? `${n} minutes` : n % 60 === 0 ? `${n / 60} hour${n === 60 ? "" : "s"}` : `${n} minutes`);

interface Instance {
  windowMs: number;
  store: MemoryStore;
  handler: RequestHandler;
}
const instances = new Map<string, Instance>();
export const resetRateLimits = () => instances.forEach((i) => i.store.resetAll());

const readSecurity = async (): Promise<SecuritySettings> => {
  try {
    return await requireSetting("security");
  } catch {
    return securityDefaults();
  }
};

/**
 * A limit named in src/config/limits.ts. Its count and window are read from
 * the `security` setting each time; `error` gets the window in plain words.
 */
const limiter = (
  name: RequestLimitName,
  opts: { error: (window: string) => string; keyGenerator?: (req: Request) => string; skip?: (req: Request) => boolean }
): RequestHandler => {
  const id = `${name}:${opts.keyGenerator ? "custom" : "ip"}`;
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!rateLimitSwitch.enabled || opts.skip?.(req)) return next();
    const security = await readSecurity();
    const limit = security[`${name}Limit`];
    const windowMinutes = security[`${name}WindowMinutes`];
    const windowMs = windowMinutes * 60_000;

    let instance = instances.get(id);
    if (!instance || instance.windowMs !== windowMs) {
      const store = new MemoryStore();
      instance = {
        windowMs,
        store,
        handler: rateLimit({
          windowMs,
          // The current setting, passed per request (see below)
          limit: (_req, r) => r.locals.rateLimitMax as number,
          standardHeaders: true,
          legacyHeaders: false,
          keyGenerator: opts.keyGenerator ?? ipKey,
          message: (_req: Request, r: Response) => ({ error: r.locals.rateLimitError as string }),
          store,
          // Made on the first request (the window comes from a setting)
          validate: { creationStack: false },
        }),
      };
      instances.set(id, instance);
    }
    res.locals.rateLimitMax = limit;
    res.locals.rateLimitError = opts.error(minutes(windowMinutes));
    return instance.handler(req, res, next);
  };
};

// ---------------------------------------------------------------------------
// Sign-up, sign-in codes and passwords
// ---------------------------------------------------------------------------

// New accounts, per IP: room for a classroom signing up together.
export const signupLimiter = limiter("signup", { error: (w) => `Too many new accounts from this network. Please try again in ${w}.` });

// Google sign-in, per IP (bad or replayed tokens; the token itself is checked by Google's keys).
export const googleLimiter = limiter("googleSignIn", { error: (w) => `Too many Google sign-ins from this network. Please wait ${w} and try again.` });

// Forgot password, per IP and per email (stops filling someone's inbox).
export const forgotIpLimiter = limiter("forgotPassword", { error: (w) => `Too many password reset requests. Please wait ${w} and try again.` });
export const forgotAccountLimiter = limiter("forgotPasswordEmail", {
  keyGenerator: emailKey("forgot"),
  error: (w) => `We've already sent several codes to this address. Check your inbox (and spam), or try again in ${w}.`,
});

// Entering the emailed reset code (wrong guesses are also capped per code).
export const resetPasswordLimiter = limiter("resetPassword", { error: (w) => `Too many attempts. Please wait ${w} and try again.` });

// Sign-up email code entry / resend: separate from sign-in, so typing a wrong
// code a few times doesn't also lock the student out of logging in.
export const otpLimiter = limiter("emailCode", { error: (w) => `Too many attempts. Please wait ${w} and try again.` });

// "Email me an unlock code" and entering it.
export const unlockLimiter = limiter("unlockCode", { error: (w) => `Too many attempts. Please wait ${w} and try again.` });

// A student asking a parent for consent (each send emails the parent).
export const parentConsentLimiter = limiter("parentConsent", { keyGenerator: userOrIpKey, error: (w) => `You've sent several emails to your parent. Please wait ${w} and try again.` });
// The parent's consent page (view + answer), per network.
export const consentLinkLimiter = limiter("consentLink", { error: (w) => `Too many attempts. Please wait ${w} and try again.` });

// ---------------------------------------------------------------------------
// Other public / student endpoints
// ---------------------------------------------------------------------------

// Helpline: a person sends a message or two; this stops floods.
export const contactLimiter = limiter("contact", { error: (w) => `You've sent several messages already. Please wait ${w}, or email us directly.` });

// Quiz endpoints: generous for real use (a 10-question quiz is ~25 calls),
// tight enough to stop scripted hammering. Per user, not per IP, so a class
// on one school Wi-Fi don't throttle each other.
export const quizLimiter = limiter("quiz", { keyGenerator: userOrIpKey, error: () => "Too many requests, slow down a little" });

// Checkout: a real purchase is ~3 calls; this stops scripted order spam.
export const paymentLimiter = limiter("payments", { keyGenerator: userOrIpKey, error: () => "Too many requests, slow down a little" });

// Refer and Earn: checking an invite code (the sign-up page); stops code guessing.
export const referralLinkLimiter = limiter("referralLink", { error: (w) => `Too many attempts. Please wait ${w} and try again.` });

// Like / Save: a student taps a few times; this stops scripted floods.
export const likeLimiter = limiter("likes", { keyGenerator: userOrIpKey, error: () => "Too many likes, slow down a little" });
export const saveLimiter = limiter("saves", { keyGenerator: userOrIpKey, error: () => "Too many saves, slow down a little" });

// Public search runs a few LIKE queries per call; this caps scripted scraping
// while leaving room for search-as-you-type.
export const searchLimiter = limiter("search", { error: () => "Too many searches, slow down a little" });

// Practice "check my answer" reveals an MCQ's answer, and quizzes reuse those
// MCQs: cap it so answers can't be scraped or looked up quickly mid-quiz.
export const checkAnswerLimiter = limiter("checkAnswer", {
  error: (w) => `You're checking answers very fast. Take a breath and try again in ${w}.`,
});

// Backstop for the whole API (scraping, runaway clients), per IP. Generous:
// a page makes several calls and a whole classroom may share one IP.
// The student site's server (SSR and its build) sends INTERNAL_API_KEY: all of
// its renders share one IP, so it skips this backstop (only this one).
const internalKey = env.INTERNAL_API_KEY ? Buffer.from(env.INTERNAL_API_KEY) : null;
export const isInternalCaller = (req: Request) => {
  const sent = req.get("x-internal-key");
  if (!internalKey || !sent) return false;
  const buf = Buffer.from(sent);
  return buf.length === internalKey.length && timingSafeEqual(buf, internalKey);
};

export const apiLimiter = limiter("api", {
  error: (w) => `Too many requests. Please slow down and try again in ${w}.`,
  skip: isInternalCaller,
});
