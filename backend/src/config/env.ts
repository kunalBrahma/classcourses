import "dotenv/config";
import { z } from "zod";

// Treat blank values ("R2_PUBLIC_URL=") as unset.
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

// "*" or a comma-separated list of exact origins, e.g.
// "https://classcourse.in,https://admin.classcourse.in"
const corsOrigins = z
  .string()
  .default("*")
  .transform((v, ctx) => {
    const list = v
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
    if (list.length === 0 || list.includes("*")) return "*" as const;
    for (const origin of list) {
      try {
        const url = new URL(origin);
        if (url.origin !== origin) throw new Error();
      } catch {
        ctx.addIssue({ code: "custom", message: `"${origin}" is not an origin like https://example.com (no path)` });
      }
    }
    return list;
  });

// Express "trust proxy": how many reverse proxies (nginx, Cloudflare, ...) sit
// in front of the API. Needed so rate limits and req.protocol use the real
// client IP / scheme. "false" when the API is exposed directly.
const trustProxy = z
  .string()
  .default("false")
  .transform((v) => (v === "true" ? 1 : v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(30),
    CORS_ORIGIN: corsOrigins,
    TRUST_PROXY: trustProxy,

    // AES-256-GCM key for secrets stored in the Setting table
    SETTINGS_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "SETTINGS_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),

    // Cloudflare R2 — fallback only; the admin-managed `storage` setting wins when present
    STORAGE_TYPE: z.enum(["r2"]).default("r2"),
    R2_ENDPOINT: optionalUrl,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET_NAME: optionalString,
    R2_PUBLIC_URL: optionalUrl,
    R2_PRIVATE_BUCKET_NAME: optionalString,

    // SMTP — fallback only; the admin-managed `smtp` setting wins when present
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: z.preprocess((v) => v === "true" || v === "1", z.boolean()).default(false),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    SMTP_FROM_EMAIL: optionalString,
    SMTP_FROM_NAME: z.string().default("Class Course"),

    // Razorpay — fallback only; the admin-managed `razorpay` setting wins when present
    RAZORPAY_KEY_ID: optionalString,
    RAZORPAY_KEY_SECRET: optionalString,
    RAZORPAY_WEBHOOK_SECRET: optionalString,
    // Only changed by the test suite (points at a local fake Razorpay server)
    RAZORPAY_API_BASE: z.string().url().default("https://api.razorpay.com/v1"),

    // Optional: `npm run seed` creates this admin if no user has this email yet.
    // Development convenience — in production use a long password (or create-admin).
    SEED_ADMIN_EMAIL: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email().optional()),
    SEED_ADMIN_PASSWORD: optionalString,

    // Shared with the student site's server (and its CI build): requests that
    // send it as X-Internal-Key skip the per-IP /api backstop, because every
    // server-side page render comes from that one IP. Unset = nobody skips.
    INTERNAL_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(32, "INTERNAL_API_KEY must be at least 32 characters").optional()),

    // Public student site — used for links in emails (password reset, receipts)
    FRONTEND_URL: z.string().url().default("http://localhost:3100"),
  })
  // Production must not run with development-grade defaults.
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== "production") return;
    if (e.CORS_ORIGIN === "*") {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGIN"], message: 'Set the exact site origins in production (not "*")' });
    }
    if (e.JWT_ACCESS_SECRET.length < 32) {
      ctx.addIssue({ code: "custom", path: ["JWT_ACCESS_SECRET"], message: "Use at least 32 random characters in production" });
    }
    if (/localhost|127\.0\.0\.1/.test(e.FRONTEND_URL)) {
      ctx.addIssue({ code: "custom", path: ["FRONTEND_URL"], message: "Set the real public site URL in production (used in email links)" });
    }
    if (e.RAZORPAY_API_BASE !== "https://api.razorpay.com/v1") {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_API_BASE"], message: "Must not be overridden in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
