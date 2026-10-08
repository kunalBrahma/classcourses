import { z } from "zod";
import { razorpaySettingsSchema, smtpSettingsSchema, storageSettingsSchema } from "../services/settings.service";

// Admin form submissions. Every field is optional here: missing fields keep
// their current value, and a blank secret keeps the stored secret. The merged
// result is validated against the full schema in buildSettingCandidate().
const blankSecret = z.string().nullable().optional();

export const storageSettingsInputSchema = storageSettingsSchema
  .partial()
  .extend({ secretAccessKey: blankSecret });

export const smtpSettingsInputSchema = smtpSettingsSchema.partial().extend({ password: blankSecret });

export const smtpTestInputSchema = smtpSettingsInputSchema.extend({
  // Where to send the test email; defaults to the logged-in admin.
  to: z.string().trim().email().optional(),
});

export type StorageSettingsInput = z.infer<typeof storageSettingsInputSchema>;
export type SmtpSettingsInput = z.infer<typeof smtpSettingsInputSchema>;

export const razorpaySettingsInputSchema = razorpaySettingsSchema
  .partial()
  .extend({ keySecret: blankSecret, webhookSecret: blankSecret });
