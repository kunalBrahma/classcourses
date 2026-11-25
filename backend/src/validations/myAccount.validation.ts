import { z } from "zod";

// Admin → Settings → My account (rules in services/myAccount.service.ts)
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().trim().email("Enter a real email address").max(200),
  password: z.string().min(1, "Enter your current password"),
});

export const confirmEmailChangeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
