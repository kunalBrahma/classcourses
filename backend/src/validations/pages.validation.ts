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
  isActive: z.boolean().optional(),
});
export const updateNewsSchema = createNewsSchema.partial();

export const reorderNewsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
