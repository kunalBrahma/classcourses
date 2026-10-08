import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { maskSecret } from "../utils/crypto";
import {
  buildSettingCandidate,
  getPublicSettings,
  getSettingAdminView,
  getSettingWithSource,
  isGenericAdminEditable,
  isSettingKey,
  resetSetting,
  saveSetting,
  SETTING_KEYS,
  SettingKey,
} from "../services/settings.service";
import { testStorageConfig } from "../services/storage.service";
import { testSmtpConfig } from "../services/mail.service";
import { razorpayMode, testRazorpayKeys } from "../services/razorpay.service";

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export const getPublicSettingsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ settings: await getPublicSettings() });
});

// ---------------------------------------------------------------------------
// Generic groups (quiz, coins, social, contact, site)
// ---------------------------------------------------------------------------

const genericKeyParam = (req: Request): SettingKey => {
  const { key } = req.params;
  if (!isSettingKey(key)) {
    throw new AppError(404, `Unknown setting "${key}"`);
  }
  if (!isGenericAdminEditable(key)) {
    throw new AppError(400, `Use /api/admin/settings/${key} dedicated endpoints for this setting`);
  }
  return key;
};

export const listSettings = asyncHandler(async (_req: Request, res: Response) => {
  const settings = await Promise.all(SETTING_KEYS.map((key) => getSettingAdminView(key)));
  res.json({ settings });
});

export const getSettingHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ setting: await getSettingAdminView(genericKeyParam(req)) });
});

// Partial updates are allowed: omitted fields keep their current value.
export const updateSettingHandler = asyncHandler(async (req: Request, res: Response) => {
  const key = genericKeyParam(req);
  const body = z.record(z.unknown()).parse(req.body ?? {});
  const candidate = await buildSettingCandidate(key, body);
  await saveSetting(key, candidate);
  res.json({ message: "Setting saved", setting: await getSettingAdminView(key) });
});

export const resetSettingHandler = asyncHandler(async (req: Request, res: Response) => {
  const key = genericKeyParam(req);
  await resetSetting(key);
  res.json({ message: "Setting reset to defaults", setting: await getSettingAdminView(key) });
});

// ---------------------------------------------------------------------------
// Storage (Cloudflare R2) — response shape is consumed by the admin Storage page
// ---------------------------------------------------------------------------

const storageView = async () => {
  const { value: config, source } = await getSettingWithSource("storage");
  return {
    source,
    provider: "r2" as const,
    endpoint: config?.endpoint ?? "",
    accessKeyId: config?.accessKeyId ?? "",
    secretAccessKeyMasked: config ? maskSecret(config.secretAccessKey) : null,
    hasSecret: Boolean(config?.secretAccessKey),
    bucket: config?.bucket ?? "",
    privateBucket: config?.privateBucket ?? "",
    publicUrl: config?.publicUrl ?? "",
    signedUrlTtlSeconds: config?.signedUrlTtlSeconds ?? 300,
  };
};

export const getStorageSettings = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ storage: await storageView() });
});

// Tests a config from the form without saving it.
export const testStorageSettings = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await buildSettingCandidate("storage", req.body);
  res.json({ result: await testStorageConfig(candidate) });
});

// Saves only after a successful live round trip, so a typo can't break uploads.
export const updateStorageSettings = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await buildSettingCandidate("storage", req.body);
  const result = await testStorageConfig(candidate);
  if (!result.ok) {
    const failed = result.steps.find((s) => !s.ok);
    throw new AppError(400, `Storage check failed at "${failed?.name}": ${failed?.message} Settings not saved.`);
  }
  await saveSetting("storage", candidate);
  res.json({ message: "Storage settings saved", storage: await storageView(), result });
});

// Tests whatever config is currently active (database or env).
export const testActiveStorage = asyncHandler(async (_req: Request, res: Response) => {
  const { value: config } = await getSettingWithSource("storage");
  if (!config) {
    throw new AppError(400, "File storage is not configured");
  }
  res.json({ result: await testStorageConfig(config) });
});

export const resetStorageSettings = asyncHandler(async (_req: Request, res: Response) => {
  await resetSetting("storage");
  res.json({ message: "Storage settings reset to environment defaults", storage: await storageView() });
});

// ---------------------------------------------------------------------------
// Email (SMTP)
// ---------------------------------------------------------------------------

export const getSmtpSettings = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ smtp: await getSettingAdminView("smtp") });
});

// Verifies the form's config and sends a real test email (to `to`, or the admin).
export const testSmtpSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { to, ...form } = req.body as { to?: string } & Record<string, unknown>;
  const candidate = await buildSettingCandidate("smtp", form);
  const recipient = to ?? (await adminEmail(req));
  res.json({ result: await testSmtpConfig(candidate, recipient) });
});

// Saves only after the server accepts the connection + login.
export const updateSmtpSettings = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await buildSettingCandidate("smtp", req.body);
  const result = await testSmtpConfig(candidate);
  if (!result.ok) {
    throw new AppError(400, `SMTP check failed: ${result.steps.find((s) => !s.ok)?.message} Settings not saved.`);
  }
  await saveSetting("smtp", candidate);
  res.json({ message: "Email settings saved", smtp: await getSettingAdminView("smtp"), result });
});

export const testActiveSmtp = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { value: config } = await getSettingWithSource("smtp");
  if (!config) {
    throw new AppError(400, "Email (SMTP) is not configured");
  }
  const to = typeof req.body?.to === "string" && req.body.to ? req.body.to : await adminEmail(req);
  res.json({ result: await testSmtpConfig(config, to) });
});

export const resetSmtpSettings = asyncHandler(async (_req: Request, res: Response) => {
  await resetSetting("smtp");
  res.json({ message: "Email settings reset to environment defaults", smtp: await getSettingAdminView("smtp") });
});

const adminEmail = async (req: AuthRequest) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { email: true } });
  if (!user) throw new AppError(401, "Unauthorized");
  return user.email;
};

// ---------------------------------------------------------------------------
// Payments (Razorpay)
// ---------------------------------------------------------------------------

const razorpayView = async (req: Request) => {
  const view = await getSettingAdminView("razorpay");
  const keyId = (view.value as { keyId?: string } | null)?.keyId;
  return {
    ...view,
    mode: keyId ? razorpayMode(keyId) : null,
    // Paste this into Razorpay Dashboard → Webhooks (events: payment.captured, payment.failed, order.paid).
    webhookUrl: `${req.protocol}://${req.get("host")}/api/payments/webhook/razorpay`,
  };
};

export const getRazorpaySettings = asyncHandler(async (req: Request, res: Response) => {
  res.json({ razorpay: await razorpayView(req) });
});

export const testRazorpaySettings = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await buildSettingCandidate("razorpay", req.body);
  res.json({ result: await testRazorpayKeys(candidate) });
});

// Saves only after Razorpay accepts the keys.
export const updateRazorpaySettings = asyncHandler(async (req: Request, res: Response) => {
  const candidate = await buildSettingCandidate("razorpay", req.body);
  const result = await testRazorpayKeys(candidate);
  if (!result.ok) throw new AppError(400, `${result.message} Settings not saved.`);
  await saveSetting("razorpay", candidate);
  res.json({ message: "Payment settings saved", razorpay: await razorpayView(req), result });
});

export const resetRazorpaySettings = asyncHandler(async (req: Request, res: Response) => {
  await resetSetting("razorpay");
  res.json({ message: "Payment settings reset to environment defaults", razorpay: await razorpayView(req) });
});
