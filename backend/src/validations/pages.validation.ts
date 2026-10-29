import { z } from "zod";

export const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  bodyHtml: z.string().max(200_000).optional(),
  isPublished: z.boolean().optional(),
});

export const createFaqSchema = z.object({
  // Plain text (tokens like {{site.name}} allowed)
  question: z.string().trim().min(3).max(500),
  answerHtml: z.string().max(20_000),
  isPublished: z.boolean().optional(),
});
export const updateFaqSchema = createFaqSchema.partial();

export const reorderFaqSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

// Home page "Latest news" links. Only http(s) links: they're rendered as <a href>.
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "The link must start with http:// or https://");

export const createNewsSchema = z.object({
  source: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(160),
  url: httpUrl,
  // Card picture: uploaded to the public bucket (absolute URL) or null to remove.
  imageUrl: httpUrl.nullable().optional(),
  isActive: z.boolean().optional(),
});
export const updateNewsSchema = createNewsSchema.partial();

export const reorderNewsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// Contact form. Topics are fixed so the admin can sort messages; the
// frontend shows the same list (frontend/src/lib/contact.ts).
export const CONTACT_TOPICS = ["General question", "Account or sign-in", "Quizzes and coins", "Notes and payments", "Report a mistake", "Other"] as const;

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address").max(160),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "") : null))
    .refine((v) => v === null || /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number, or leave it empty"),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(10, "Please write a little more (at least 10 characters)").max(2000),
  // Spam trap: a hidden field people never fill in.
  website: z.string().max(200).optional(),
});

export const contactStatusSchema = z.object({ status: z.enum(["NEW", "READ", "REPLIED", "ARCHIVED"]) });
