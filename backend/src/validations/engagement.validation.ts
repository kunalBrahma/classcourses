import { z } from "zod";
import { SLUG_PATTERN } from "../utils/slug";
import { httpUrl, siteOrHttpLink } from "./pages.validation";

// Phase 14: Like / Save, blog, announcements, notifications.

const id = z.string().uuid();

// ---- Like / Save: exactly one of chapterId / blogPostId ----
const target = z
  .object({ chapterId: id.optional(), blogPostId: id.optional() })
  .refine((t) => Boolean(t.chapterId) !== Boolean(t.blogPostId), "Send a chapterId or a blogPostId");
export const reactionSchema = target.and(z.object({ on: z.boolean() }));
export const reactionQuerySchema = target;

// ---- Blog ----
const imageSize = z.number().int().positive().max(20000);
const dateTime = z.string().datetime({ offset: true });

const postFields = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(160),
  slug: z.string().trim().regex(SLUG_PATTERN, "Links use small letters, numbers and dashes").max(80).optional(),
  excerpt: z.string().trim().max(300).optional(),
  bodyHtml: z.string().max(200_000).optional(),
  coverImageUrl: httpUrl.nullable().optional(),
  coverWidth: imageSize.nullable().optional(),
  coverHeight: imageSize.nullable().optional(),
  coverAlt: z.string().trim().max(160).optional(),
  categoryId: id.nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  publishedAt: dateTime.nullable().optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(160).nullable().optional(),
});
export const createPostSchema = postFields;
export const updatePostSchema = postFields.partial();

export const createBlogCategorySchema = z.object({ name: z.string().trim().min(1).max(60) });
export const updateBlogCategorySchema = z.object({ name: z.string().trim().min(1).max(60).optional(), isActive: z.boolean().optional() });
export const reorderIdsSchema = z.object({ ids: z.array(id).min(1).max(500) });

// ---- Announcements ----
const announcementFields = z.object({
  title: z.string().trim().min(1, "Give it a title").max(120),
  bodyHtml: z.string().max(20_000).optional(),
  imageUrl: httpUrl.nullable().optional(),
  imageWidth: imageSize.nullable().optional(),
  imageHeight: imageSize.nullable().optional(),
  link: siteOrHttpLink.nullable().optional(),
  linkLabel: z.string().trim().max(40).nullable().optional(),
  audience: z.enum(["EVERYONE", "STUDENTS"]).optional(),
  classLevelId: id.nullable().optional(),
  isPublished: z.boolean().optional(),
  startsAt: dateTime.nullable().optional(),
  endsAt: dateTime.nullable().optional(),
});
export const createAnnouncementSchema = announcementFields;
export const updateAnnouncementSchema = announcementFields.partial();

// ---- Refer and Earn (admin review): a written reason ----
export const referralNoteSchema = z.object({ note: z.string().trim().min(5, "Write a short reason").max(500) });

// ---- Notifications ----
export const sendNoticeSchema = z.object({
  to: z.union([z.literal("all"), id]),
  kind: z.enum(["NOTICE", "WARNING"]),
  title: z.string().trim().min(3, "Write a short title").max(120),
  body: z.string().trim().min(5, "Write the message").max(2000),
  link: siteOrHttpLink.nullable().optional(),
  email: z.boolean().optional(),
});
export const markReadSchema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(id).min(1).max(100) })]);
