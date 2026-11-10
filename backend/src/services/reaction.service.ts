import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { catalogHref, publicChapterWhere } from "./catalog.service";
import { publicBlogPostWhere } from "./blog.service";

// Like, Save and Share (client requirements of 6 Nov 2026): one like per
// account with a total, and Saved items in the profile. Items are chapter
// pages and blog posts; only items the public can see can be liked or saved.

export type ReactionTarget = { chapterId: string; blogPostId?: undefined } | { blogPostId: string; chapterId?: undefined };

const targetWhere = (t: ReactionTarget) => (t.chapterId ? { chapterId: t.chapterId } : { blogPostId: t.blogPostId! });

/** 404 unless the item is public right now. */
const assertVisible = async (t: ReactionTarget) => {
  const found = t.chapterId
    ? await prisma.chapter.count({ where: { id: t.chapterId, ...publicChapterWhere } })
    : await prisma.blogPost.count({ where: { id: t.blogPostId, ...publicBlogPostWhere() } });
  if (!found) throw new AppError(404, "This page isn't available");
};

/** Total likes, and whether this student liked / saved it. */
export const reactionState = async (t: ReactionTarget, userId?: string) => {
  const where = targetWhere(t);
  const [likes, liked, saved] = await Promise.all([
    prisma.like.count({ where }),
    userId ? prisma.like.count({ where: { ...where, userId } }) : 0,
    userId ? prisma.savedItem.count({ where: { ...where, userId } }) : 0,
  ]);
  return { likes, liked: liked > 0, saved: saved > 0 };
};

/** Like or unlike. Repeating the same choice changes nothing. */
export const setLike = async (userId: string, t: ReactionTarget, on: boolean) => {
  if (on) {
    await assertVisible(t);
    // skipDuplicates: two quick taps can't make two likes (unique per student + item)
    await prisma.like.createMany({ data: [{ userId, ...targetWhere(t) }], skipDuplicates: true });
  } else {
    await prisma.like.deleteMany({ where: { userId, ...targetWhere(t) } });
  }
  return reactionState(t, userId);
};

export const setSaved = async (userId: string, t: ReactionTarget, on: boolean) => {
  if (on) {
    await assertVisible(t);
    await prisma.savedItem.createMany({ data: [{ userId, ...targetWhere(t) }], skipDuplicates: true });
  } else {
    await prisma.savedItem.deleteMany({ where: { userId, ...targetWhere(t) } });
  }
  return reactionState(t, userId);
};

// ---- Profile → Saved ----------------------------------------------------------

const savedInclude = {
  chapter: {
    select: {
      id: true,
      number: true,
      title: true,
      slug: true,
      isPublished: true,
      subject: {
        select: {
          name: true,
          nativeName: true,
          slug: true,
          isActive: true,
          medium: { select: { slug: true, name: true, isActive: true } },
          classLevel: { select: { name: true, slug: true, isActive: true } },
        },
      },
    },
  },
  blogPost: { select: { id: true, title: true, slug: true, status: true, publishedAt: true, category: { select: { name: true } } } },
} satisfies Prisma.SavedItemInclude;

type SavedRow = Prisma.SavedItemGetPayload<{ include: typeof savedInclude }>;

/** One saved item as the profile shows it. `available` false = hidden or unpublished since. */
const toSaved = (row: SavedRow) => {
  if (row.chapter) {
    const c = row.chapter;
    const s = c.subject;
    return {
      id: row.id,
      type: "CHAPTER" as const,
      savedAt: row.createdAt,
      title: c.title,
      chapterNumber: c.number,
      context: [s.classLevel.name, s.name].join(" · "),
      contextNative: s.nativeName,
      href: catalogHref(s.medium.slug, s.classLevel.slug, s.slug, c.slug),
      available: c.isPublished && s.isActive && s.medium.isActive && s.classLevel.isActive,
    };
  }
  const p = row.blogPost!;
  return {
    id: row.id,
    type: "BLOG_POST" as const,
    savedAt: row.createdAt,
    title: p.title,
    chapterNumber: null,
    context: p.category ? `Blog · ${p.category.name}` : "Blog",
    contextNative: null,
    href: `/blog/${p.slug}`,
    available: p.status === "PUBLISHED" && p.publishedAt !== null && p.publishedAt <= new Date(),
  };
};

export const listSaved = async (userId: string, page: number, pageSize: number) => {
  const [rows, total] = await Promise.all([
    prisma.savedItem.findMany({ where: { userId }, include: savedInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.savedItem.count({ where: { userId } }),
  ]);
  return { items: rows.map(toSaved), total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
};

export const removeSaved = async (userId: string, id: string) => {
  const { count } = await prisma.savedItem.deleteMany({ where: { id, userId } });
  if (!count) throw new AppError(404, "Saved item not found");
};

// ---- Admin: moderation ------------------------------------------------------------

const adminInclude = {
  user: { select: { id: true, name: true, email: true } },
  ...savedInclude,
} as const;

/** Latest likes or saves, optionally one student's or one item's. */
export const listReactionsAdmin = async (q: { kind: "like" | "save"; userId?: string; chapterId?: string; blogPostId?: string; page: number; pageSize: number }) => {
  const where = { userId: q.userId, chapterId: q.chapterId, blogPostId: q.blogPostId };
  const args = { where, include: adminInclude, orderBy: { createdAt: "desc" as const }, skip: (q.page - 1) * q.pageSize, take: q.pageSize };
  const [rows, total] =
    q.kind === "like"
      ? await Promise.all([prisma.like.findMany(args), prisma.like.count({ where })])
      : await Promise.all([prisma.savedItem.findMany(args), prisma.savedItem.count({ where })]);
  return {
    items: rows.map((r) => ({ ...toSaved(r as SavedRow), user: r.user })),
    total,
    page: q.page,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
};

/** Most liked / saved items (all time). */
export const topReactions = async (limit = 10) => {
  const [likesByChapter, likesByPost, savesByChapter, savesByPost, totals] = await Promise.all([
    prisma.like.groupBy({ by: ["chapterId"], where: { chapterId: { not: null } }, _count: { _all: true }, orderBy: { _count: { chapterId: "desc" } }, take: limit }),
    prisma.like.groupBy({ by: ["blogPostId"], where: { blogPostId: { not: null } }, _count: { _all: true }, orderBy: { _count: { blogPostId: "desc" } }, take: limit }),
    prisma.savedItem.groupBy({ by: ["chapterId"], where: { chapterId: { not: null } }, _count: { _all: true }, orderBy: { _count: { chapterId: "desc" } }, take: limit }),
    prisma.savedItem.groupBy({ by: ["blogPostId"], where: { blogPostId: { not: null } }, _count: { _all: true }, orderBy: { _count: { blogPostId: "desc" } }, take: limit }),
    Promise.all([prisma.like.count(), prisma.savedItem.count()]),
  ]);
  const chapterIds = [...new Set([...likesByChapter, ...savesByChapter].map((r) => r.chapterId!))];
  const postIds = [...new Set([...likesByPost, ...savesByPost].map((r) => r.blogPostId!))];
  const [chapters, posts] = await Promise.all([
    prisma.chapter.findMany({ where: { id: { in: chapterIds } }, select: { id: true, number: true, title: true, subject: { select: { name: true, classLevel: { select: { name: true } } } } } }),
    prisma.blogPost.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true } }),
  ]);
  const label = new Map<string, { title: string; context: string; type: "CHAPTER" | "BLOG_POST"; chapterNumber: number | null }>([
    ...chapters.map((c) => [c.id, { title: c.title, chapterNumber: c.number, context: `${c.subject.classLevel.name} · ${c.subject.name}`, type: "CHAPTER" as const }] as const),
    ...posts.map((p) => [p.id, { title: p.title, chapterNumber: null, context: "Blog", type: "BLOG_POST" as const }] as const),
  ]);
  const rows = (groups: { chapterId?: string | null; blogPostId?: string | null; _count: { _all: number } }[]) =>
    groups
      .map((g) => {
        const id = (g.chapterId ?? g.blogPostId)!;
        const l = label.get(id);
        return l ? { targetId: id, count: g._count._all, ...l } : null;
      })
      .filter((r) => r !== null)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  return {
    totals: { likes: totals[0], saves: totals[1] },
    mostLiked: rows([...likesByChapter, ...likesByPost]),
    mostSaved: rows([...savesByChapter, ...savesByPost]),
  };
};

export const deleteLikeAdmin = async (id: string) => {
  const like = await prisma.like.findUnique({ where: { id }, select: { userId: true } });
  if (!like) throw new AppError(404, "Like not found");
  await prisma.like.delete({ where: { id } });
  return like;
};

export const deleteSavedAdmin = async (id: string) => {
  const saved = await prisma.savedItem.findUnique({ where: { id }, select: { userId: true } });
  if (!saved) throw new AppError(404, "Saved item not found");
  await prisma.savedItem.delete({ where: { id } });
  return saved;
};

/** Spam clean-up: every like from one student. */
export const clearUserLikes = async (userId: string) => (await prisma.like.deleteMany({ where: { userId } })).count;
