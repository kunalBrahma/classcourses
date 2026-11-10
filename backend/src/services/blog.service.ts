import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { hasVisibleContent, sanitizeRichText } from "../utils/sanitizeHtml";
import { SLUG_PATTERN, slugOr, uniqueSlug } from "../utils/slug";

// Blog (client requirements of 6 Nov 2026): posts with headings, images,
// categories, a featured image and drafts; create, edit, publish, unpublish,
// delete. Every rule is here; controllers only translate HTTP.

/** A post the public can see: published, and its date has come. */
export const publicBlogPostWhere = (): Prisma.BlogPostWhereInput => ({ status: "PUBLISHED", publishedAt: { lte: new Date() } });

const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** The card summary: the admin's, else the start of the text. */
export const excerptOf = (excerpt: string, bodyHtml: string) => {
  if (excerpt.trim()) return excerpt.trim();
  const text = plain(bodyHtml);
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
};

/** About 200 words a minute; at least 1. */
export const readMinutes = (bodyHtml: string) => Math.max(1, Math.round(plain(bodyHtml).split(" ").filter(Boolean).length / 200));

const cardSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  bodyHtml: true,
  coverImageUrl: true,
  coverWidth: true,
  coverHeight: true,
  coverAlt: true,
  publishedAt: true,
  category: { select: { name: true, slug: true } },
} satisfies Prisma.BlogPostSelect;

type CardRow = Prisma.BlogPostGetPayload<{ select: typeof cardSelect }>;
const toCard = ({ bodyHtml, excerpt, ...p }: CardRow) => ({ ...p, excerpt: excerptOf(excerpt, bodyHtml), readMinutes: readMinutes(bodyHtml) });

// ---- Public ----------------------------------------------------------------------

export const publicCategories = () =>
  prisma.blogCategory.findMany({
    where: { isActive: true, posts: { some: publicBlogPostWhere() } },
    orderBy: { order: "asc" },
    select: { name: true, slug: true },
  });

export const listPublicPosts = async (q: { category?: string; page: number; pageSize: number }) => {
  const where: Prisma.BlogPostWhereInput = { ...publicBlogPostWhere(), ...(q.category ? { category: { slug: q.category } } : {}) };
  const [rows, total, categories] = await Promise.all([
    prisma.blogPost.findMany({ where, select: cardSelect, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.blogPost.count({ where }),
    publicCategories(),
  ]);
  return { posts: rows.map(toCard), total, page: q.page, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), categories };
};

export const getPublicPost = async (slug: string) => {
  const post = await prisma.blogPost.findFirst({
    where: { slug, ...publicBlogPostWhere() },
    select: { ...cardSelect, seoTitle: true, seoDescription: true, updatedAt: true, categoryId: true },
  });
  if (!post) throw new AppError(404, "Post not found");
  const related = await prisma.blogPost.findMany({
    where: { ...publicBlogPostWhere(), id: { not: post.id }, ...(post.categoryId ? { categoryId: post.categoryId } : {}) },
    select: cardSelect,
    orderBy: { publishedAt: "desc" },
    take: 3,
  });
  const { categoryId: _c, excerpt, ...rest } = post;
  return { post: { ...rest, excerpt: excerptOf(excerpt, post.bodyHtml), readMinutes: readMinutes(post.bodyHtml) }, related: related.map(toCard) };
};

/** For the sitemap. */
export const publicPostSlugs = () => prisma.blogPost.findMany({ where: publicBlogPostWhere(), select: { slug: true, updatedAt: true }, orderBy: { publishedAt: "desc" } });

// ---- Admin: posts ------------------------------------------------------------------

export interface PostInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  bodyHtml?: string;
  coverImageUrl?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
  coverAlt?: string;
  categoryId?: string | null;
  status?: "DRAFT" | "PUBLISHED";
  publishedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

const slugTaken = (exceptId?: string) => async (slug: string) => (await prisma.blogPost.count({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) } })) > 0;

const assertCategory = async (categoryId: string | null | undefined) => {
  if (categoryId && !(await prisma.blogCategory.count({ where: { id: categoryId } }))) throw new AppError(400, "That category doesn't exist");
};

/** Cleans what the admin sent: HTML sanitised, empty strings → null. */
const clean = (input: PostInput) => {
  const data: Prisma.BlogPostUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.excerpt !== undefined) data.excerpt = input.excerpt;
  if (input.bodyHtml !== undefined) data.bodyHtml = sanitizeRichText(input.bodyHtml);
  if (input.coverImageUrl !== undefined) {
    data.coverImageUrl = input.coverImageUrl || null;
    data.coverWidth = input.coverImageUrl ? (input.coverWidth ?? null) : null;
    data.coverHeight = input.coverImageUrl ? (input.coverHeight ?? null) : null;
  }
  if (input.coverAlt !== undefined) data.coverAlt = input.coverAlt;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle || null;
  if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription || null;
  return data;
};

/** Publishing needs a title and some text; the first publish sets the date. */
const applyStatus = (data: Prisma.BlogPostUncheckedUpdateInput, input: PostInput, current: { status: string; publishedAt: Date | null; bodyHtml: string; title: string }) => {
  if (input.publishedAt !== undefined) data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  const status = input.status ?? current.status;
  if (input.status !== undefined) data.status = input.status;
  if (status === "PUBLISHED") {
    const body = (data.bodyHtml as string | undefined) ?? current.bodyHtml;
    if (!hasVisibleContent(body)) throw new AppError(400, "Write the post before publishing it");
    const date = data.publishedAt !== undefined ? data.publishedAt : current.publishedAt;
    if (!date) data.publishedAt = new Date();
  }
};

const adminSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  bodyHtml: true,
  coverImageUrl: true,
  coverWidth: true,
  coverHeight: true,
  coverAlt: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  status: true,
  publishedAt: true,
  seoTitle: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { likes: true, savedBy: true } },
} satisfies Prisma.BlogPostSelect;

export const listPostsAdmin = async (q: { status?: "DRAFT" | "PUBLISHED"; categoryId?: string; search?: string; page: number; pageSize: number }) => {
  const where: Prisma.BlogPostWhereInput = {
    status: q.status,
    categoryId: q.categoryId,
    ...(q.search ? { title: { contains: q.search, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      select: { ...adminSelect, bodyHtml: false },
      orderBy: [{ updatedAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.blogPost.count({ where }),
  ]);
  return { posts: rows, total, page: q.page, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
};

export const getPostAdmin = async (id: string) => {
  const post = await prisma.blogPost.findUnique({ where: { id }, select: adminSelect });
  if (!post) throw new AppError(404, "Post not found");
  return post;
};

export const createPost = async (input: PostInput & { title: string }) => {
  await assertCategory(input.categoryId);
  const data = clean(input);
  const slug = input.slug ?? (await uniqueSlug(slugOr(input.title, "post"), slugTaken()));
  if (input.slug && (await slugTaken()(input.slug))) throw new AppError(409, "Another post already uses this link");
  applyStatus(data, input, { status: "DRAFT", publishedAt: null, bodyHtml: (data.bodyHtml as string) ?? "", title: input.title });
  const post = await prisma.blogPost.create({
    data: { ...(data as Prisma.BlogPostUncheckedCreateInput), title: input.title, slug, bodyHtml: (data.bodyHtml as string) ?? "" },
    select: adminSelect,
  });
  return post;
};

export const updatePost = async (id: string, input: PostInput) => {
  const current = await prisma.blogPost.findUnique({ where: { id }, select: { status: true, publishedAt: true, bodyHtml: true, title: true, slug: true } });
  if (!current) throw new AppError(404, "Post not found");
  await assertCategory(input.categoryId);
  const data = clean(input);
  // The link stays fixed on rename; "Change link" sends a new one
  if (input.slug !== undefined && input.slug !== current.slug) {
    if (!SLUG_PATTERN.test(input.slug)) throw new AppError(400, "Links use small letters, numbers and dashes");
    if (await slugTaken(id)(input.slug)) throw new AppError(409, "Another post already uses this link");
    data.slug = input.slug;
  }
  applyStatus(data, input, current);
  const post = await prisma.blogPost.update({ where: { id }, data, select: adminSelect });
  return { post, before: { status: current.status, title: current.title } };
};

export const deletePost = async (id: string) => {
  const post = await prisma.blogPost.findUnique({ where: { id }, select: { title: true } });
  if (!post) throw new AppError(404, "Post not found");
  await prisma.blogPost.delete({ where: { id } }); // likes and saves go with it
  return post;
};

// ---- Admin: categories --------------------------------------------------------------

export const listCategoriesAdmin = () =>
  prisma.blogCategory.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { posts: true } } } });

const nameTaken = async (name: string, exceptId?: string) =>
  (await prisma.blogCategory.count({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } })) > 0;

export const createCategory = async (name: string) => {
  if (await nameTaken(name)) throw new AppError(409, "A category with this name already exists");
  const last = await prisma.blogCategory.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const slug = await uniqueSlug(slugOr(name, "category"), async (s) => (await prisma.blogCategory.count({ where: { slug: s } })) > 0);
  return prisma.blogCategory.create({ data: { name, slug, order: (last?.order ?? -1) + 1 }, include: { _count: { select: { posts: true } } } });
};

export const updateCategory = async (id: string, input: { name?: string; isActive?: boolean }) => {
  if (!(await prisma.blogCategory.count({ where: { id } }))) throw new AppError(404, "Category not found");
  if (input.name && (await nameTaken(input.name, id))) throw new AppError(409, "A category with this name already exists");
  return prisma.blogCategory.update({ where: { id }, data: input, include: { _count: { select: { posts: true } } } });
};

/** Its posts stay, without a category. */
export const deleteCategory = async (id: string) => {
  const category = await prisma.blogCategory.findUnique({ where: { id }, select: { name: true } });
  if (!category) throw new AppError(404, "Category not found");
  await prisma.blogCategory.delete({ where: { id } });
  return category;
};

export const reorderCategories = async (ids: string[]) => {
  const all = await prisma.blogCategory.findMany({ select: { id: true } });
  const set = new Set(all.map((c) => c.id));
  if (ids.length !== set.size || new Set(ids).size !== ids.length || ids.some((i) => !set.has(i))) {
    throw new AppError(400, "Send every category exactly once, in the new order");
  }
  await prisma.$transaction(ids.map((id, order) => prisma.blogCategory.update({ where: { id }, data: { order } })));
};
