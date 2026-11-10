import { z } from "zod";
import { ADMIN_PERMISSION_NAMES, AdminPermission } from "../config/adminAccess";

// Admin → Users actions. Every action that changes an account asks for a
// written reason (it goes into the activity log; the student sees it for a
// suspension or a block).
const reason = z.string().trim().min(5, "Write the reason (a few words)").max(500);
const optionalReason = z.string().trim().max(500).optional();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const suspendSchema = z.object({
  // Suspended through the end of this day (India time); null = until lifted
  until: dateOnly.nullable(),
  reason,
});
export const reasonSchema = z.object({ reason });
export const optionalReasonSchema = z.object({ reason: optionalReason });

export const eraseSchema = z.object({
  reason,
  // Typed by the admin to confirm which account is erased
  confirmEmail: z.string().trim().toLowerCase().email("Type the student's email to confirm"),
});

// Correcting a student's details at their (or a parent's) request.
export const adminEditDetailsSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    phone: z.union([z.literal("").transform(() => null), z.null(), z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number")]).optional(),
    classLevelId: z.string().uuid().optional(),
    districtId: z.string().uuid().optional(),
    dateOfBirth: dateOnly.optional(),
    reason,
  })
  .refine((v) => Object.keys(v).some((k) => k !== "reason"), "Change at least one detail");

const permissions = z.array(z.enum(ADMIN_PERMISSION_NAMES as [AdminPermission, ...AdminPermission[]])).max(ADMIN_PERMISSION_NAMES.length);

// Team (Super Admin): a helper admin — an existing account by email, or a new one.
export const addHelperSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(80).optional(),
  // Only for a brand-new account (the person can change it with "Forgot password")
  password: z.string().min(12, "Use at least 12 characters").max(200).optional(),
  permissions: permissions.min(1, "Tick at least one section"),
});
export const updateHelperSchema = z.object({ permissions: permissions.min(1, "Tick at least one section") });

// ---- Parental consent ----
const relationship = z.enum(["parent", "guardian"]);
export const requestConsentSchema = z.object({ parentEmail: z.string().trim().toLowerCase().email("Enter your parent's or guardian's email") });
export const decideConsentSchema = z.object({
  decision: z.enum(["grant", "decline"]),
  parentName: z.string().trim().min(2, "Enter your name").max(100),
  relationship,
  // "I am this student's parent or lawful guardian, and 18 or older"
  confirmAdult: z.literal(true, { errorMap: () => ({ message: "Please confirm you are the parent or guardian and 18 or older" }) }),
});
export const recordConsentSchema = z.object({
  parentEmail: z.string().trim().toLowerCase().email(),
  parentName: z.string().trim().min(2).max(100),
  relationship,
  // How the admin knows (e.g. "Parent emailed the Helpline on 12 Nov")
  note: z.string().trim().min(5, "Write how the parent gave permission").max(500),
});
export const withdrawConsentSchema = z.object({ note: z.string().trim().min(5, "Write why (e.g. the parent asked)").max(500) });
