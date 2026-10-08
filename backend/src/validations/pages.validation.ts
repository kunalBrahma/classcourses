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
