import { timingSafeEqual } from "crypto";
import { Request } from "express";
import rateLimit, { ipKeyGenerator, MemoryStore, type Options } from "express-rate-limit";
import { AuthRequest } from "./auth.middleware";
import { env } from "../config/env";

// All limits are in memory, per API process (one instance is assumed; see
// CLAUDE.md "Production"). Keys are the client IP (needs TRUST_PROXY right),
// the signed-in user, or the email an auth request is about.
//
// Many students share one IP (mobile carrier NAT, school Wi-Fi), so IP limits
// are generous and the tight ones follow the account (email) instead.

// Off in tests so the suite can sign in many users; tests/rateLimit.test.ts
// turns them on and starts each case from empty counters.
export const rateLimitSwitch = { enabled: env.NODE_ENV !== "test" };
const stores: MemoryStore[] = [];
export const resetRateLimits = () => stores.forEach((s) => s.resetAll());

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "");
const userOrIpKey = (req: Request) => (req as AuthRequest).user?.userId ?? ipKey(req);
// The email an auth request is about (lower-cased); falls back to the IP for
// a malformed body, which validation rejects anyway.
const emailKey = (prefix: string) => (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return email ? `${prefix}:${email}` : `${prefix}:ip:${ipKey(req)}`;
};

const limiter = (opts: Partial<Options> & { windowMs: number; limit: number; error: string }) => {
  const store = new MemoryStore();
  stores.push(store);
  const { error, ...rest } = opts;
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKey,
    message: { error },
    store,
    skip: () => !rateLimitSwitch.enabled,
    ...rest,
  });
};

// ---------------------------------------------------------------------------
// Sign-in, sign-up and passwords
// ---------------------------------------------------------------------------

// Login, per IP: only FAILED attempts count, so a class signing in correctly
// from one school network never trips it.
export const loginIpLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  error: "Too many failed sign-ins from this network. Please wait 15 minutes and try again.",
});

// Login, per account: stops password guessing on one account even from many
// IPs. Only failed attempts count.
export const loginAccountLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: emailKey("login"),
  error: "Too many wrong passwords for this account. Wait 15 minutes, or use “Forgot password?”.",
});

// New accounts, per IP: room for a classroom signing up together.
export const signupLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  error: "Too many new accounts from this network. Please try again in an hour.",
});

// Forgot password, per IP and per email (stops filling someone's inbox).
export const forgotIpLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  error: "Too many password reset requests. Please wait 15 minutes and try again.",
});
export const forgotAccountLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: emailKey("forgot"),
  error: "We've already sent reset emails to this address. Check your inbox (and spam), or try again in an hour.",
});

// Choosing a new password with a reset link (the token itself is unguessable).
export const resetPasswordLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  error: "Too many attempts, please try again later",
});

// Email code entry / resend: separate from the login limits so typing a wrong
// code a few times doesn't also lock the student out of logging in. Wrong
// guesses are capped per code too (emailVerification.service.ts).
export const otpLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  error: "Too many attempts, please try again later",
});

// ---------------------------------------------------------------------------
// Other public / student endpoints
// ---------------------------------------------------------------------------

// Contact form: a person sends a message or two; this stops floods.
export const contactLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  error: "You've sent several messages already. Please wait an hour, or email us directly.",
});

// Quiz endpoints: generous for real use (a 10-question quiz is ~25 calls),
// tight enough to stop scripted hammering. Keyed per user, not per IP, so a
// class of students on one school Wi-Fi don't throttle each other.
export const quizLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 90,
  keyGenerator: userOrIpKey,
  error: "Too many requests, slow down a little",
});

// Checkout: a real purchase is ~3 calls; this stops scripted order spam.
export const paymentLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: userOrIpKey,
  error: "Too many requests, slow down a little",
});

// Public search runs a few LIKE queries per call; this caps scripted scraping
// while leaving room for search-as-you-type.
export const searchLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 60,
  error: "Too many searches, slow down a little",
});

// Practice "check my answer" reveals an MCQ's answer, and quizzes reuse those
// MCQs: cap it so answers can't be scraped or looked up quickly mid-quiz.
// 40/min is plenty for a student working through a chapter by hand.
export const checkAnswerLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 40,
  error: "You're checking answers very fast. Take a breath and try again in a minute.",
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

export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 600,
  error: "Too many requests. Please slow down and try again in a minute.",
  skip: (req) => !rateLimitSwitch.enabled || isInternalCaller(req),
});
