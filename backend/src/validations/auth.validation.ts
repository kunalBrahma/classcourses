import { z } from "zod";

// Indian mobile number: accepts spaces, dashes and a +91 / 91 / 0 prefix,
// and is stored as the plain 10 digits.
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, ""))
  .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number");

// Optional mobile number: "" or null = none.
const phoneOrNone = z.union([z.literal("").transform(() => null), z.null(), phoneSchema]);
// At sign-up, missing also means none.
export const optionalPhoneSchema = phoneOrNone.optional().transform((v) => v ?? null);

// The student profile (rules in src/services/profile.service.ts): class,
// district and date of birth ("YYYY-MM-DD"). No school name.
const profileFields = {
  classLevelId: z.string({ required_error: "Please choose your class" }).uuid("Please choose your class"),
  districtId: z.string({ required_error: "Please choose your district" }).uuid("Please choose your district"),
  dateOfBirth: z.string({ required_error: "Please enter your date of birth" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a real date of birth"),
};

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1, "Name is required").max(80),
  phone: optionalPhoneSchema,
  ...profileFields,
});

// "Complete your profile" and later edits. Every field is optional so the
// student can change one thing; the date of birth can only be set once.
// phone: missing = keep, "" or null = remove.
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80).optional(),
  phone: phoneOrNone.optional(),
  classLevelId: profileFields.classLevelId.optional(),
  districtId: profileFields.districtId.optional(),
  dateOfBirth: profileFields.dateOfBirth.optional(),
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const resendCodeSchema = z.object({
  email: z.string().email(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const googleLoginSchema = z.object({
  credential: z.string().min(1, "Google sign-in failed").max(5000),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const sixDigits = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: sixDigits,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const unlockRequestSchema = z.object({ email: z.string().email() });
export const unlockSchema = z.object({ email: z.string().email(), code: sixDigits });
