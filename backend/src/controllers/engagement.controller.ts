import { Request, Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { listSaved, reactionState, ReactionTarget, removeSaved, setLike, setSaved } from "../services/reaction.service";
import { getPublicPost, listPublicPosts, publicPostSlugs } from "../services/blog.service";
import { visibleAnnouncements } from "../services/announcement.service";
import { listInbox, markRead, unreadCount } from "../services/notification.service";
import { reactionQuerySchema } from "../validations/engagement.validation";

// Phase 14, public and student side: Like / Save, blog, announcements, the
// notification inbox.

const pageQuery = (max = 50, size = 20) =>
  z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(1).max(max).default(size) });

const asTarget = (t: { chapterId?: string; blogPostId?: string }): ReactionTarget => (t.chapterId ? { chapterId: t.chapterId } : { blogPostId: t.blogPostId! });

// ---- Like / Save ----
export const getReactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await reactionState(asTarget(reactionQuerySchema.parse(req.query)), req.user?.userId));
});

export const putLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await setLike(req.user!.userId, asTarget(req.body), req.body.on));
});

export const putSave = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await setSaved(req.user!.userId, asTarget(req.body), req.body.on));
});

export const getMySaved = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, pageSize } = pageQuery(50, 20).parse(req.query);
  res.json(await listSaved(req.user!.userId, page, pageSize));
});

export const deleteMySaved = asyncHandler(async (req: AuthRequest, res: Response) => {
  await removeSaved(req.user!.userId, req.params.id);
  res.json({ message: "Removed from Saved" });
});

// ---- Blog ----
const blogQuery = pageQuery(24, 12).extend({ category: z.string().trim().max(80).optional() });

export const getBlog = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listPublicPosts(blogQuery.parse(req.query)));
});

// Sitemap and static pages
export const getBlogSlugs = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ posts: await publicPostSlugs() });
});

export const getBlogPost = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getPublicPost(req.params.slug));
});

// ---- Announcements (guests get "everyone" ones; students also their own) ----
export const getAnnouncements = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ items: await visibleAnnouncements(req.user?.userId) });
});

// ---- Notifications ----
export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, pageSize } = pageQuery(50, 20).parse(req.query);
  res.json(await listInbox(req.user!.userId, page, pageSize));
});

export const getUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ unread: await unreadCount(req.user!.userId) });
});

export const postMarkRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ unread: await markRead(req.user!.userId, "all" in req.body ? "all" : req.body.ids) });
});
