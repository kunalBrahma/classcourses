import { Request, Response } from "express";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { hasVisibleContent, sanitizeRichText } from "../utils/sanitizeHtml";
import { getPageTokens, isPageSlug, PAGE_SLUGS, PAGE_TOKEN_NAMES, renderTokens } from "../services/pages.service";

// Static pages (About, Contact, Privacy, Terms, Refund policy) and the FAQ.
// Public responses have {{tokens}} filled from live settings; admin responses
// return the raw text so tokens stay editable.

// Plain text only: strip any markup from FAQ questions.
const plainText = (value: string) => sanitizeRichText(value).replace(/<[^>]*>/g, "").trim();

// ===========================================================================
// Public
// ===========================================================================

export const listPublicPages = asyncHandler(async (_req: Request, res: Response) => {
  const pages = await prisma.page.findMany({
    where: { isPublished: true },
    select: { slug: true, title: true, updatedAt: true },
  });
  // Stable order for footers: the order of PAGE_SLUGS.
  pages.sort((a, b) => PAGE_SLUGS.indexOf(a.slug as never) - PAGE_SLUGS.indexOf(b.slug as never));
  res.json({ pages });
});

export const getPublicPage = asyncHandler(async (req: Request, res: Response) => {
  const page = await prisma.page.findFirst({ where: { slug: req.params.slug, isPublished: true } });
  if (!page) throw new AppError(404, "Page not found");
  const tokens = await getPageTokens();
  res.json({
    page: {
      slug: page.slug,
      title: renderTokens(page.title, tokens, { html: false }),
      bodyHtml: renderTokens(page.bodyHtml, tokens),
      // Shown as "Last updated" on legal pages
      updatedAt: page.updatedAt,
    },
  });
});

export const getPublicFaq = asyncHandler(async (_req: Request, res: Response) => {
  const [items, tokens] = await Promise.all([
    prisma.faqItem.findMany({ where: { isPublished: true }, orderBy: { order: "asc" } }),
    getPageTokens(),
  ]);
  res.json({
    items: items.map((i) => ({
      id: i.id,
      question: renderTokens(i.question, tokens, { html: false }),
      answerHtml: renderTokens(i.answerHtml, tokens),
    })),
  });
});

// ===========================================================================
// Admin
// ===========================================================================

export const listPagesAdmin = asyncHandler(async (_req: Request, res: Response) => {
  const pages = await prisma.page.findMany({ select: { slug: true, title: true, isPublished: true, updatedAt: true } });
  // Every known slug is listed, even if it hasn't been created yet.
  res.json({
    pages: PAGE_SLUGS.map((slug) => pages.find((p) => p.slug === slug) ?? { slug, title: null, isPublished: false, updatedAt: null }),
    tokens: PAGE_TOKEN_NAMES,
  });
});

const knownSlug = (req: Request) => {
  if (!isPageSlug(req.params.slug)) {
    throw new AppError(404, `Unknown page "${req.params.slug}". Pages: ${PAGE_SLUGS.join(", ")}`);
  }
  return req.params.slug;
};

export const getPageAdmin = asyncHandler(async (req: Request, res: Response) => {
  const slug = knownSlug(req);
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) throw new AppError(404, "This page hasn't been written yet");
  // `preview` = what students will see with the current settings.
  const tokens = await getPageTokens();
  res.json({ page, preview: renderTokens(page.bodyHtml, tokens), tokens: PAGE_TOKEN_NAMES });
});

// Creates the page on first save.
export const updatePage = asyncHandler(async (req: Request, res: Response) => {
  const slug = knownSlug(req);
  const { title, bodyHtml, isPublished } = req.body as { title?: string; bodyHtml?: string; isPublished?: boolean };
  const existing = await prisma.page.findUnique({ where: { slug } });

  const nextBody = bodyHtml !== undefined ? sanitizeRichText(bodyHtml) : existing?.bodyHtml;
  const nextTitle = title ?? existing?.title;
  if (!existing && (!nextTitle || nextBody === undefined)) {
    throw new AppError(400, "A new page needs a title and content");
  }
  if ((isPublished ?? existing?.isPublished) && !hasVisibleContent(nextBody ?? "")) {
    throw new AppError(400, "Add some content before publishing this page");
  }

  const page = await prisma.page.upsert({
    where: { slug },
    create: { slug, title: nextTitle!, bodyHtml: nextBody!, isPublished: isPublished ?? false },
    update: { title, bodyHtml: bodyHtml !== undefined ? nextBody : undefined, isPublished },
  });
  res.json({ page });
});

export const listFaqAdmin = asyncHandler(async (_req: Request, res: Response) => {
  const items = await prisma.faqItem.findMany({ orderBy: { order: "asc" } });
  res.json({ items, tokens: PAGE_TOKEN_NAMES });
});

export const createFaq = asyncHandler(async (req: Request, res: Response) => {
  const { question, answerHtml, isPublished } = req.body;
  const answer = sanitizeRichText(answerHtml);
  if (!hasVisibleContent(answer)) throw new AppError(400, "The answer is empty");
  const last = await prisma.faqItem.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const item = await prisma.faqItem.create({
    data: { question: plainText(question), answerHtml: answer, isPublished: isPublished ?? false, order: (last?.order ?? -1) + 1 },
  });
  res.status(201).json({ item });
});

export const updateFaq = asyncHandler(async (req: Request, res: Response) => {
  const { question, answerHtml, isPublished } = req.body as { question?: string; answerHtml?: string; isPublished?: boolean };
  const answer = answerHtml !== undefined ? sanitizeRichText(answerHtml) : undefined;
  if (answer !== undefined && !hasVisibleContent(answer)) throw new AppError(400, "The answer is empty");
  const item = await prisma.faqItem.update({
    where: { id: req.params.id },
    data: { question: question !== undefined ? plainText(question) : undefined, answerHtml: answer, isPublished },
  });
  res.json({ item });
});

export const deleteFaq = asyncHandler(async (req: Request, res: Response) => {
  await prisma.faqItem.delete({ where: { id: req.params.id } });
  res.json({ message: "FAQ deleted" });
});

export const reorderFaq = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  const all = await prisma.faqItem.findMany({ select: { id: true } });
  const set = new Set(all.map((i) => i.id));
  if (ids.length !== set.size || new Set(ids).size !== ids.length || ids.some((id) => !set.has(id))) {
    throw new AppError(400, "Send every FAQ item exactly once, in the new order");
  }
  await prisma.$transaction(ids.map((id, order) => prisma.faqItem.update({ where: { id }, data: { order } })));
  res.json({ message: "FAQ reordered" });
});
