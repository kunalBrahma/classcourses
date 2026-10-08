import { z } from "zod";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { decryptSecret, encryptSecret, maskSecret } from "../utils/crypto";

// Admin-editable app configuration, stored one row per group in `Setting`.
// Resolution order for every group: database row → env fallback → defaults.
//
// To add a group: add a schema + entry to SETTINGS below. Secret fields are
// encrypted at rest, masked in every API response, and a blank value on save
// keeps the stored secret. See CLAUDE.md → "Settings".

const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().url().nullable().default(null)
);
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().nullable().default(null)
);

// ---- Group schemas (the complete, stored shape) ----

export const quizSettingsSchema = z.object({
  questionsPerQuiz: z.coerce.number().int().min(1).max(50),
  secondsPerQuestion: z.coerce.number().int().min(3).max(300),
  passMark: z.coerce.number().int().min(1),
  dailyLimit: z.coerce.number().int().min(1).max(1000),
  // Every chapter gets a quiz of random quiz-marked MCQs (custom quizzes are extra).
  autoChapterQuizzes: z.boolean().default(true),
});

export const coinSettingsSchema = z.object({
  perPass: z.coerce.number().int().min(0).max(100000),
  coinValuePaise: z.coerce.number().int().min(0).max(100000),
  maxDiscountPercent: z.coerce.number().int().min(0).max(100),
  // Which passes earn coins (client decision PENDING — task.md). Guards
  // against farming coins by re-passing the same easy chapter.
  awardRule: z.enum(["firstPassPerChapter", "firstPassPerChapterPerDay", "everyPass"]).default("firstPassPerChapter"),
});

export const socialSettingsSchema = z.object({
  youtube: optionalUrl,
  linkedin: optionalUrl,
  twitter: optionalUrl,
  facebook: optionalUrl,
  instagram: optionalUrl,
});

export const contactSettingsSchema = z.object({
  email: z.string().trim().email(),
});

export const siteSettingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  frontendUrl: z.string().trim().url(),
});

export const storageSettingsSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url("Endpoint must be a URL, e.g. https://<account-id>.r2.cloudflarestorage.com")
    .transform((v) => v.replace(/\/$/, "")),
  accessKeyId: z.string().trim().min(1, "Access key ID is required"),
  secretAccessKey: z
    .string({ invalid_type_error: "Secret access key is required", required_error: "Secret access key is required" })
    .min(1, "Secret access key is required"),
  bucket: z.string().trim().min(3, "Bucket name is required").max(63),
  // Holds premium notes. Paid notes can't be published while this is unset.
  privateBucket: optionalText,
  publicUrl: optionalUrl.transform((v) => (v ? v.replace(/\/$/, "") : v)),
  signedUrlTtlSeconds: z.coerce.number().int().min(60).max(604800).default(300),
});

export const smtpSettingsSchema = z.object({
  host: z.string().trim().min(1, "SMTP host is required"),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  // true = implicit TLS (usually port 465); false = STARTTLS upgrade (587)
  secure: z.boolean().default(false),
  user: optionalText,
  password: z.string().nullable().default(null),
  fromName: z.string().trim().min(1).max(100).default("Class Course"),
  fromEmail: z.string().trim().email("From email must be a valid email"),
  replyTo: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().email().nullable().default(null)
  ),
});

export const razorpaySettingsSchema = z.object({
  keyId: z
    .string()
    .trim()
    .regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, "Key ID looks like rzp_test_… or rzp_live_…"),
  keySecret: z
    .string({ invalid_type_error: "Key secret is required", required_error: "Key secret is required" })
    .min(1, "Key secret is required"),
  // From Razorpay Dashboard → Webhooks. Needed to accept webhook events.
  webhookSecret: z.string().nullable().default(null),
});

export type QuizSettings = z.infer<typeof quizSettingsSchema>;
export type CoinSettings = z.infer<typeof coinSettingsSchema>;
export type SocialSettings = z.infer<typeof socialSettingsSchema>;
export type ContactSettings = z.infer<typeof contactSettingsSchema>;
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type StorageSettings = z.infer<typeof storageSettingsSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type RazorpaySettings = z.infer<typeof razorpaySettingsSchema>;

interface SettingDefinition<T extends Record<string, unknown>> {
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  // Used when there is no database row and no env fallback. null = "not configured".
  defaults: () => T | null;
  fromEnv?: () => T | null;
  secretFields: (keyof T & string)[];
  // Changing the identity field (e.g. access key ID) requires re-entering its secret.
  secretBoundTo?: Partial<Record<keyof T & string, keyof T & string>>;
  // Editable through the generic PUT /api/admin/settings/:key route.
  // Groups needing a live connection test have dedicated routes instead.
  genericAdminEdit: boolean;
  // Included in GET /api/settings/public (never for groups with secrets).
  isPublic: boolean;
}

const SETTINGS = {
  quiz: {
    schema: quizSettingsSchema,
    defaults: () => ({ questionsPerQuiz: 10, secondsPerQuestion: 10, passMark: 7, dailyLimit: 10, autoChapterQuizzes: true }),
    secretFields: [],
    genericAdminEdit: true,
    isPublic: true,
  } satisfies SettingDefinition<QuizSettings>,

  // Client decision PENDING — these are the agreed placeholder defaults.
  coins: {
    schema: coinSettingsSchema,
    defaults: () => ({
      perPass: 10,
      coinValuePaise: 10,
      maxDiscountPercent: 50,
      awardRule: "firstPassPerChapter" as const,
    }),
    secretFields: [],
    genericAdminEdit: true,
    isPublic: true,
  } satisfies SettingDefinition<CoinSettings>,

  social: {
    schema: socialSettingsSchema,
    defaults: () => ({
      youtube: "https://yt.openinapp.co/classcourse",
      linkedin: "https://linkedin.openinapp.co/classcourse",
      twitter: "https://twtr.openinapp.co/classcourse",
      facebook: "https://fb.openinapp.co/classcourse",
      instagram: "https://insta.openinapp.co/classcourse",
    }),
    secretFields: [],
    genericAdminEdit: true,
    isPublic: true,
  } satisfies SettingDefinition<SocialSettings>,

  contact: {
    schema: contactSettingsSchema,
    defaults: () => ({ email: "about.classcourse@gmail.com" }),
    secretFields: [],
    genericAdminEdit: true,
    isPublic: true,
  } satisfies SettingDefinition<ContactSettings>,

  site: {
    schema: siteSettingsSchema,
    defaults: () => ({ name: "Class Course", frontendUrl: env.FRONTEND_URL }),
    secretFields: [],
    genericAdminEdit: true,
    isPublic: true,
  } satisfies SettingDefinition<SiteSettings>,

  storage: {
    schema: storageSettingsSchema,
    defaults: () => null,
    fromEnv: () =>
      env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME
        ? storageSettingsSchema.parse({
            endpoint: env.R2_ENDPOINT,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            bucket: env.R2_BUCKET_NAME,
            privateBucket: env.R2_PRIVATE_BUCKET_NAME,
            publicUrl: env.R2_PUBLIC_URL,
          })
        : null,
    secretFields: ["secretAccessKey"],
    secretBoundTo: { secretAccessKey: "accessKeyId" },
    genericAdminEdit: false,
    isPublic: false,
  } satisfies SettingDefinition<StorageSettings>,

  smtp: {
    schema: smtpSettingsSchema,
    defaults: () => null,
    fromEnv: () =>
      env.SMTP_HOST && env.SMTP_FROM_EMAIL
        ? smtpSettingsSchema.parse({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            user: env.SMTP_USER,
            password: env.SMTP_PASS ?? null,
            fromName: env.SMTP_FROM_NAME,
            fromEmail: env.SMTP_FROM_EMAIL,
          })
        : null,
    secretFields: ["password"],
    secretBoundTo: { password: "user" },
    genericAdminEdit: false,
    isPublic: false,
  } satisfies SettingDefinition<SmtpSettings>,

  razorpay: {
    schema: razorpaySettingsSchema,
    defaults: () => null,
    fromEnv: () =>
      env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
        ? razorpaySettingsSchema.parse({
            keyId: env.RAZORPAY_KEY_ID,
            keySecret: env.RAZORPAY_KEY_SECRET,
            webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? null,
          })
        : null,
    secretFields: ["keySecret", "webhookSecret"],
    secretBoundTo: { keySecret: "keyId" },
    genericAdminEdit: false,
    isPublic: false,
  } satisfies SettingDefinition<RazorpaySettings>,
};

type Settings = typeof SETTINGS;
export type SettingKey = keyof Settings;
export type SettingValue<K extends SettingKey> = z.infer<Settings[K]["schema"]>;
export type SettingSource = "database" | "env" | "default" | "none";

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export const isSettingKey = (key: string): key is SettingKey => key in SETTINGS;

const definition = <K extends SettingKey>(key: K) =>
  SETTINGS[key] as unknown as SettingDefinition<Record<string, unknown>>;

export const isGenericAdminEditable = (key: SettingKey) => definition(key).genericAdminEdit;

// ---- Resolution + cache ----

interface Resolved<K extends SettingKey> {
  value: SettingValue<K> | null;
  source: SettingSource;
}

// Single-process cache; cleared on every save/reset.
const cache = new Map<SettingKey, Resolved<SettingKey>>();

const decryptFields = (key: SettingKey, stored: Record<string, unknown>) => {
  const out = { ...stored };
  for (const field of definition(key).secretFields) {
    const raw = out[field];
    out[field] = typeof raw === "string" && raw.length > 0 ? decryptSecret(raw) : null;
  }
  return out;
};

export const getSettingWithSource = async <K extends SettingKey>(key: K): Promise<Resolved<K>> => {
  const hit = cache.get(key);
  if (hit) return hit as Resolved<K>;

  const def = definition(key);
  let resolved: Resolved<K>;

  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) {
    // Merge over defaults so fields added after the row was saved get a value.
    const merged = { ...(def.defaults() ?? {}), ...decryptFields(key, row.value as Record<string, unknown>) };
    resolved = { value: def.schema.parse(merged) as SettingValue<K>, source: "database" };
  } else {
    const fromEnv = def.fromEnv?.() ?? null;
    if (fromEnv) {
      resolved = { value: fromEnv as SettingValue<K>, source: "env" };
    } else {
      const defaults = def.defaults();
      resolved = { value: defaults as SettingValue<K> | null, source: defaults ? "default" : "none" };
    }
  }

  cache.set(key, resolved);
  return resolved;
};

export const getSetting = async <K extends SettingKey>(key: K): Promise<SettingValue<K> | null> =>
  (await getSettingWithSource(key)).value;

// Like getSetting, but for groups that always have defaults.
export const requireSetting = async <K extends SettingKey>(key: K): Promise<SettingValue<K>> => {
  const value = await getSetting(key);
  if (!value) {
    throw new AppError(503, `The "${key}" setting is not configured`);
  }
  return value;
};

// ---- Building a candidate value from admin input ----

// Merges a (possibly partial) admin submission over the current value and
// validates it. Blank/missing secrets keep the stored secret — unless the
// field the secret belongs to (e.g. access key ID) changed.
export const buildSettingCandidate = async <K extends SettingKey>(
  key: K,
  input: Record<string, unknown>
): Promise<SettingValue<K>> => {
  const def = definition(key);
  const current = ((await getSetting(key)) ?? def.defaults() ?? {}) as Record<string, unknown>;

  const merged: Record<string, unknown> = { ...current };
  for (const [field, value] of Object.entries(input)) {
    if (value !== undefined) merged[field] = value;
  }

  for (const field of def.secretFields) {
    const submitted = input[field];
    const isBlank = submitted === undefined || submitted === null || submitted === "";
    if (!isBlank) continue;

    const boundTo = def.secretBoundTo?.[field];
    if (boundTo && current[field] && input[boundTo] !== undefined && input[boundTo] !== current[boundTo]) {
      throw new AppError(400, `Enter the ${humanize(field)} for the new ${humanize(boundTo)}`);
    }
    merged[field] = current[field] ?? null;
  }

  return def.schema.parse(merged) as SettingValue<K>;
};

const humanize = (field: string) => field.replace(/([A-Z])/g, " $1").toLowerCase();

export const saveSetting = async <K extends SettingKey>(key: K, value: SettingValue<K>) => {
  const def = definition(key);
  const stored: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const field of def.secretFields) {
    const plain = stored[field];
    stored[field] = typeof plain === "string" && plain.length > 0 ? encryptSecret(plain) : null;
  }

  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored as object },
    update: { value: stored as object },
  });
  cache.delete(key);
};

// Removes the database override; env fallback / defaults apply again.
export const resetSetting = async (key: SettingKey) => {
  await prisma.setting.deleteMany({ where: { key } });
  cache.delete(key);
};

export const clearSettingsCache = () => cache.clear();

// ---- Views ----

// Secrets replaced by `<field>Masked` + `has<Field>`; safe for admin responses.
export const maskSettingValue = (key: SettingKey, value: Record<string, unknown> | null) => {
  if (!value) return null;
  const out: Record<string, unknown> = { ...value };
  for (const field of definition(key).secretFields) {
    const plain = out[field];
    delete out[field];
    const hasIt = typeof plain === "string" && plain.length > 0;
    out[`${field}Masked`] = hasIt ? maskSecret(plain as string) : null;
    out[`has${field.charAt(0).toUpperCase()}${field.slice(1)}`] = hasIt;
  }
  return out;
};

export const getSettingAdminView = async (key: SettingKey) => {
  const { value, source } = await getSettingWithSource(key);
  return { key, source, value: maskSettingValue(key, value as Record<string, unknown> | null) };
};

export const getPublicSettings = async () => {
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const def = definition(key);
    if (def.isPublic && def.secretFields.length === 0) {
      out[key] = await getSetting(key);
    }
  }
  return out;
};
