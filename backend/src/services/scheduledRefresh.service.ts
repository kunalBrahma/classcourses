import prisma from "../config/prisma";
import { refreshSite, SiteTag } from "./siteRevalidate.service";

// Scheduled content (questions with publishAt, blog posts with a future
// publishedAt) goes live by time, not by an admin action, so no admin request
// tells the student site to drop its cached pages. The maintenance sweep calls
// this: if anything's time arrived since the last check, the site refreshes.
// (Reads already apply the time rule, so a missed run only delays the cache.)

let lastCheck = new Date();

export const refreshDueScheduledContent = async (now = new Date()) => {
  const since = lastCheck;
  lastCheck = now;
  const window = { gt: since, lte: now };
  const [questions, posts] = await Promise.all([
    prisma.question.count({ where: { isPublished: true, publishAt: window } }),
    prisma.blogPost.count({ where: { status: "PUBLISHED", publishedAt: window } }),
  ]);
  const tags: SiteTag[] = [];
  if (questions > 0) tags.push("catalog");
  if (posts > 0) tags.push("blog");
  refreshSite(tags);
  return { questions, posts, tags };
};
