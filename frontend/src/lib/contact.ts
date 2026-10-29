import { z } from "zod";

// Same topics and rules as the backend (backend/src/validations/pages.validation.ts
// contactMessageSchema). The server checks everything again.
export const CONTACT_TOPICS = ["General question", "Account or sign-in", "Quizzes and coins", "Notes and payments", "Report a mistake", "Other"] as const;

const normalisePhone = (v: string) => v.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80, "That's a bit long — 80 characters at most"),
  email: z.string().trim().min(1, "Please enter your email").email("That doesn't look like an email address").max(160),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(normalisePhone(v)), "Enter a 10-digit mobile number, or leave it empty"),
  topic: z.enum(CONTACT_TOPICS, { errorMap: () => ({ message: "Please choose what it's about" }) }),
  message: z.string().trim().min(10, "Please write a little more (at least 10 characters)").max(2000, "Please keep it under 2000 characters"),
  // Spam trap (hidden from people).
  website: z.string().max(200).optional(),
});

export type ContactValues = z.infer<typeof contactSchema>;
export const MESSAGE_MAX = 2000;
export const toPayload = (v: ContactValues) => ({ ...v, phone: v.phone ? normalisePhone(v.phone) : undefined });
