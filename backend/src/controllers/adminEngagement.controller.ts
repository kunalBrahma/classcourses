import { Response } from "express";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth.middleware";
import { noteActivity } from "../middleware/adminActivity";
import { asyncHandler } from "../utils/asyncHandler";
import * as blog from "../services/blog.service";
import * as announcements from "../services/announcement.service";
import { deleteNotice, listSentAdmin, sendNotice } from "../services/notification.service";
import { clearUserLikes, deleteLikeAdmin, deleteSavedAdmin, listReactionsAdmin, topReactions } from "../services/reaction.service";

// Phase 14, admin side: blog, announcements, notices, likes and saves.

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const optionalId = z.string().uuid().optional();

// ---- Blog posts ----
const postListQuery = pageQuery.extend({ status: z.enum(["DRAFT", "PUBLISHED"]).optional(), categoryId: optionalId, search: z.string().trim().max(100).optional() });

export const listPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await blog.listPostsAdmin(postListQuery.parse(req.query)));
});

export const getPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ post: await blog.getPostAdmin(req.params.id) });
});

export const createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const post = await blog.createPost(req.body);
  noteActivity(res, { action: "blog.create", targetType: "blog_post", targetId: post.id, summary: `Blog post “${post.title}” (${post.status === "PUBLISHED" ? "published" : "draft"})` });
  res.status(201).json({ post });
});

export const updatePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { post, before } = await blog.updatePost(req.params.id, req.body);
  const action = req.body.status && req.body.status !== before.status ? (req.body.status === "PUBLISHED" ? "blog.publish" : "blog.unpublish") : "blog.update";
  noteActivity(res, { action, targetType: "blog_post", targetId: post.id, summary: `Blog post “${post.title}”`, before, after: { status: post.status, title: post.title } });
  res.json({ post });
});

export const deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const post = await blog.deletePost(req.params.id);
  noteActivity(res, { action: "blog.delete", targetType: "blog_post", targetId: req.params.id, summary: `Deleted blog post “${post.title}”` });
  res.json({ message: "Post deleted" });
});

// ---- Blog categories ----
export const listCategories = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ categories: await blog.listCategoriesAdmin() });
});

export const createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.status(201).json({ category: await blog.createCategory(req.body.name) });
});

export const updateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ category: await blog.updateCategory(req.params.id, req.body) });
});

export const deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const c = await blog.deleteCategory(req.params.id);
  noteActivity(res, { action: "blog.category.delete", targetType: "blog_category", targetId: req.params.id, summary: `Deleted blog category “${c.name}”` });
  res.json({ message: "Category deleted. Its posts are kept, without a category." });
});

export const reorderCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  await blog.reorderCategories(req.body.ids);
  res.json({ message: "Categories reordered" });
});

// ---- Announcements ----
export const listAnnouncements = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ items: await announcements.listAnnouncementsAdmin() });
});

export const createAnnouncement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const item = await announcements.createAnnouncement(req.body);
  noteActivity(res, { action: "announcement.create", targetType: "announcement", targetId: item.id, summary: `Announcement “${item.title}”${item.isPublished ? " (published)" : ""}` });
  res.status(201).json({ item });
});

export const updateAnnouncement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { item, before } = await announcements.updateAnnouncement(req.params.id, req.body);
  const action = req.body.isPublished !== undefined && req.body.isPublished !== before.isPublished ? (item.isPublished ? "announcement.publish" : "announcement.unpublish") : "announcement.update";
  noteActivity(res, { action, targetType: "announcement", targetId: item.id, summary: `Announcement “${item.title}”`, before, after: { title: item.title, isPublished: item.isPublished } });
  res.json({ item });
});

export const deleteAnnouncement = asyncHandler(async (req: AuthRequest, res: Response) => {
  const item = await announcements.deleteAnnouncement(req.params.id);
  noteActivity(res, { action: "announcement.delete", targetType: "announcement", targetId: req.params.id, summary: `Removed announcement “${item.title}”` });
  res.json({ message: "Announcement removed" });
});

export const reorderAnnouncements = asyncHandler(async (req: AuthRequest, res: Response) => {
  await announcements.reorderAnnouncements(req.body.ids);
  res.json({ message: "Announcements reordered" });
});

// ---- Notices ----
const noticeListQuery = pageQuery.extend({ userId: optionalId, to: z.enum(["all", "one"]).optional(), kind: z.enum(["NOTICE", "WARNING", "ACCOUNT"]).optional() });

export const listNotices = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await listSentAdmin(noticeListQuery.parse(req.query)));
});

export const postNotice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { notification, recipient } = await sendNotice(req.user!.userId, req.body);
  const what = notification.kind === "WARNING" ? "Warning" : "Notice";
  noteActivity(res, {
    action: notification.kind === "WARNING" ? "notice.warn" : "notice.send",
    targetType: recipient ? "user" : "notification",
    targetId: recipient?.id ?? notification.id,
    summary: `${what} “${notification.title}” to ${recipient ? recipient.email : "everyone"}${notification.emailNote ? ` (email: ${notification.emailNote})` : ""}`,
  });
  res.status(201).json({
    notification,
    message: recipient
      ? `${what} sent to ${recipient.name || recipient.email}${notification.emailNote === "sent" ? " and emailed" : notification.emailNote ? `. ${notification.emailNote}` : ""}`
      : "Notice sent to everyone",
  });
});

export const removeNotice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const n = await deleteNotice(req.params.id);
  noteActivity(res, { action: "notice.delete", targetType: n.userId ? "user" : "notification", targetId: n.userId ?? req.params.id, summary: `Removed notice “${n.title}”` });
  res.json({ message: "Notice removed from the inbox" });
});

// ---- Likes and saves (moderation) ----
const reactionListQuery = pageQuery.extend({ kind: z.enum(["like", "save"]).default("like"), userId: optionalId, chapterId: optionalId, blogPostId: optionalId });

export const listReactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await listReactionsAdmin(reactionListQuery.parse(req.query)));
});

export const getReactionSummary = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json(await topReactions());
});

export const removeLike = asyncHandler(async (req: AuthRequest, res: Response) => {
  const like = await deleteLikeAdmin(req.params.id);
  noteActivity(res, { action: "like.remove", targetType: "user", targetId: like.userId, summary: "Removed a like" });
  res.json({ message: "Like removed" });
});

export const removeSaved = asyncHandler(async (req: AuthRequest, res: Response) => {
  const saved = await deleteSavedAdmin(req.params.id);
  noteActivity(res, { action: "saved.remove", targetType: "user", targetId: saved.userId, summary: "Removed a saved item" });
  res.json({ message: "Saved item removed" });
});

export const clearLikes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const count = await clearUserLikes(req.params.userId);
  noteActivity(res, { action: "like.clear", targetType: "user", targetId: req.params.userId, summary: `Removed all ${count} likes`, reason: req.body?.reason });
  res.json({ message: `Removed ${count} like${count === 1 ? "" : "s"}`, count });
});
