import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { AuthRequest } from "./auth.middleware";
import { env } from "../config/env";

// Tighter limit for auth endpoints (login/register/password-reset) to slow
// down credential-stuffing and brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
  // The API test suite registers/logs in many users from one IP.
  skip: () => env.NODE_ENV === "test",
});

// Quiz endpoints: generous for real use (a 10-question quiz is ~25 calls),
// tight enough to stop scripted hammering. Keyed per user, not per IP, so a
// class of students on one school Wi-Fi don't throttle each other.
export const quizLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: { error: "Too many requests, slow down a little" },
  skip: () => env.NODE_ENV === "test",
});

// Checkout: a real purchase is ~3 calls; this stops scripted order spam.
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: { error: "Too many requests, slow down a little" },
  skip: () => env.NODE_ENV === "test",
});
