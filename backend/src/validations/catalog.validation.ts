import { z } from "zod";
import { SLUG_PATTERN } from "../utils/slug";

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(SLUG_PATTERN, "A link may use only lowercase letters (a–z), numbers and single hyphens");

const nativeName = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().max(120).nullable().optional()
);

const id = z.string().uuid();

// ---- Mediums ----
export const createMediumSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nativeName,
  slug: slug.optional(),
  isActive: z.boolean().optional(),
});
export const updateMediumSchema = createMediumSchema.partial();

// ---- Classes (admin-managed: "Class 5", "LKG", "BA 1st Year" …) ----
export const createClassLevelSchema = z.object({
  name: z.string().trim().min(1).max(60),
  nativeName,
  slug: slug.optional(),
  isActive: z.boolean().optional(),
});
export const updateClassLevelSchema = createClassLevelSchema.partial();

// ---- Subjects ----
export const createSubjectSchema = z.object({
  mediumId: id,
  classId: id,
  name: z.string().trim().min(1).max(120),
  nativeName,
  slug: slug.optional(),
  isActive: z.boolean().optional(),
});
export const updateSubjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  nativeName,
  slug: slug.optional(),
  isActive: z.boolean().optional(),
});

// ---- Parts ----
export const createPartSchema = z.object({ title: z.string().trim().min(1).max(120) });
export const updatePartSchema = createPartSchema;

// ---- Chapters ----
export const createChapterSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: slug.optional(),
  number: z.coerce.number().int().min(1).max(1000).optional(),
  partId: id.nullable().optional(),
  isPublished: z.boolean().optional(),
});
export const bulkCreateChaptersSchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
  partId: id.nullable().optional(),
});
export const updateChapterSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: slug.optional(),
  number: z.coerce.number().int().min(1).max(1000).optional(),
  // Moving a chapter to another part (or null = no part) appends it to that group.
  partId: id.nullable().optional(),
  isPublished: z.boolean().optional(),
  // The chapter's automatic quiz on/off
  autoQuiz: z.boolean().optional(),
  // "About the lesson / author" rich text; sanitised before saving. null clears it.
  aboutHtml: z.string().max(100_000).nullable().optional(),
});

// ---- Reorder: full list of sibling ids in the new order ----
export const reorderSchema = z.object({
  ids: z.array(id).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, "Duplicate ids"),
});
export const reorderChaptersSchema = reorderSchema.extend({ partId: id.nullable() });

// ---- Student preferences ----
export const updatePreferencesSchema = z.object({
  mediumId: id.nullable().optional(),
  classLevelId: id.nullable().optional(),
});
