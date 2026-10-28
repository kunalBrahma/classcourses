import { Request, Response } from "express";
import crypto from "crypto";
import { Prisma, QuestionKind, QuestionSource, VideoFormat } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { parseYouTubeLink } from "../utils/youtube";
import { normalizeQuestion, QuestionInput } from "../services/question.service";
import { parseQuestionImport } from "../services/questionImport.service";
import { getPublicUrl, getSignedUploadUrl } from "../services/storage.service";
import { getSetting } from "../services/settings.service";
import { IMAGE_TYPES } from "../validations/content.validation";

// Admin management of chapter content: questions (QA + MCQ), bulk import,
// videos and image uploads. The chapter's About text is edited through
// PATCH /api/admin/chapters/:chapterId (adminCatalog.controller.ts).

const requireChapter = async (chapterId: string) => {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { id: true } });
  if (!chapter) throw new AppError(404, "Chapter not found");
  return chapter;
};

const failWithErrors = (errors: string[]): never => {
  throw new AppError(400, errors.join(". "));
};

// Questions are ordered per group (chapter + source + kind), matching how
// the chapter page shows them: Textbook Q&A, Extra Q&A, Extra MCQs, ...
const nextQuestionOrder = async (chapterId: string, source: QuestionSource, kind: QuestionKind) => {
  const last = await prisma.question.findFirst({
    where: { chapterId, source, kind },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
};

// ===========================================================================
// Chapter content overview (editor)
// ===========================================================================

export const getChapterContentAdmin = asyncHandler(async (req: Request, res: Response) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: req.params.chapterId },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          slug: true,
          medium: { select: { id: true, name: true, slug: true } },
          classLevel: { select: { id: true, name: true, slug: true } },
        },
      },
      part: { select: { id: true, title: true } },
      questions: { orderBy: [{ source: "asc" }, { kind: "asc" }, { order: "asc" }] },
      videos: { orderBy: { order: "asc" } },
    },
  });
  if (!chapter) throw new AppError(404, "Chapter not found");
  res.json({ chapter });
});

// ===========================================================================
// Questions
// ===========================================================================

export const createQuestion = asyncHandler(async (req: Request, res: Response) => {
  const { id: chapterId } = await requireChapter(req.params.chapterId);
  const result = normalizeQuestion(req.body as QuestionInput);
  if (!result.data) return failWithErrors(result.errors);

  const { data } = result;
  const question = await prisma.question.create({
    data: { ...data, chapterId, order: await nextQuestionOrder(chapterId, data.source ?? "TEXTBOOK", data.kind) },
  });
  res.status(201).json({ question });
});

export const updateQuestion = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Question not found");

  const body = req.body as Partial<QuestionInput>;
  const kind = body.kind ?? existing.kind;
  // Switching kind drops the other kind's fields instead of failing on them.
  const kindChanged = kind !== existing.kind;
  const merged: QuestionInput = {
    kind,
    source: body.source ?? existing.source,
    question: body.question ?? existing.question,
    answer: body.answer !== undefined ? body.answer : kindChanged ? null : existing.answer,
    options: body.options !== undefined ? body.options : kindChanged ? null : (existing.options as string[] | null),
    correctIndex: body.correctIndex !== undefined ? body.correctIndex : kindChanged ? null : existing.correctIndex,
    explanation: body.explanation !== undefined ? body.explanation : existing.explanation,
    difficulty: body.difficulty !== undefined ? body.difficulty : existing.difficulty,
    isPublished: body.isPublished ?? existing.isPublished,
    useInQuiz: body.useInQuiz ?? existing.useInQuiz,
  };

  const result = normalizeQuestion(merged);
  if (!result.data) return failWithErrors(result.errors);

  const groupChanged = merged.kind !== existing.kind || merged.source !== existing.source;
  const question = await prisma.question.update({
    where: { id: existing.id },
    data: {
      ...result.data,
      // Moving to another group (e.g. Textbook → Extra) appends it there.
      ...(groupChanged ? { order: await nextQuestionOrder(existing.chapterId, merged.source, merged.kind) } : {}),
    },
  });
  res.json({ question });
});

export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
  await prisma.question.delete({ where: { id: req.params.id } });
  res.json({ message: "Question deleted" });
});

export const reorderQuestions = asyncHandler(async (req: Request, res: Response) => {
  const { id: chapterId } = await requireChapter(req.params.chapterId);
  const { source, kind, ids } = req.body as { source: QuestionSource; kind: QuestionKind; ids: string[] };
  const siblings = await prisma.question.findMany({ where: { chapterId, source, kind }, select: { id: true } });
  const set = new Set(siblings.map((q) => q.id));
  if (ids.length !== set.size || new Set(ids).size !== ids.length || ids.some((id) => !set.has(id))) {
    throw new AppError(400, "Send every question of this group exactly once, in the new order");
  }
  await prisma.$transaction(ids.map((id, order) => prisma.question.update({ where: { id }, data: { order } })));
  res.json({ message: "Questions reordered" });
});

// Validates everything first; with dryRun (default) nothing is written.
// On commit, all rows are written in one transaction or none are.
export const importQuestions = asyncHandler(async (req: Request, res: Response) => {
  const { id: chapterId } = await requireChapter(req.params.chapterId);
  const { format, data, mode, dryRun } = req.body as {
    format: "csv" | "json";
    data: string;
    mode: "append" | "replace";
    dryRun: boolean;
  };

  const parsed = parseQuestionImport(format, data);
  const existingCount = await prisma.question.count({ where: { chapterId } });
  const summary = {
    total: parsed.rows.length,
    valid: parsed.valid.length,
    invalid: parsed.invalidCount,
    mode,
    existingQuestions: existingCount,
    willDelete: mode === "replace" ? existingCount : 0,
  };

  if (dryRun) {
    res.json({ dryRun: true, summary, rows: parsed.rows });
    return;
  }

  if (parsed.invalidCount > 0) {
    res.status(400).json({
      error: `${parsed.invalidCount} row(s) have problems. Nothing was imported.`,
      summary,
      rows: parsed.rows.filter((r) => r.errors.length),
    });
    return;
  }

  const created = await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.question.deleteMany({ where: { chapterId } });
    }
    // Continue each group's order after what's already there.
    const nextOrder = new Map<string, number>();
    const orderFor = async (source: QuestionSource, kind: QuestionKind) => {
      const key = `${source}:${kind}`;
      if (!nextOrder.has(key)) {
        const last = await tx.question.findFirst({
          where: { chapterId, source, kind },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        nextOrder.set(key, (last?.order ?? -1) + 1);
      }
      const order = nextOrder.get(key)!;
      nextOrder.set(key, order + 1);
      return order;
    };

    const rows: Prisma.QuestionCreateManyInput[] = [];
    for (const q of parsed.valid) {
      rows.push({ ...q, chapterId, order: await orderFor(q.source ?? "TEXTBOOK", q.kind) });
    }
    const result = await tx.question.createMany({ data: rows });
    return result.count;
  });

  res.status(201).json({ dryRun: false, summary: { ...summary, imported: created } });
});

// ===========================================================================
// Videos
// ===========================================================================

const youtubeLinkOrFail = (url: string) => {
  const link = parseYouTubeLink(url);
  if (!link) throw new AppError(400, "That doesn't look like a YouTube link or video ID");
  return link;
};

type VideoBody = { url: string; title: string; format?: VideoFormat; featured?: boolean };

// featured → featuredAt (when it went on the home page); omitted = unchanged.
const featuredAtFrom = (featured?: boolean) => (featured === undefined ? undefined : featured ? new Date() : null);

export const createVideo = asyncHandler(async (req: Request, res: Response) => {
  const { id: chapterId } = await requireChapter(req.params.chapterId);
  const { url, title, format, featured } = req.body as VideoBody;
  const link = youtubeLinkOrFail(url);
  const last = await prisma.video.findFirst({ where: { chapterId }, orderBy: { order: "desc" }, select: { order: true } });
  const video = await prisma.video.create({
    data: {
      chapterId,
      youtubeId: link.id,
      format: format ?? (link.isShort ? "SHORT" : "LANDSCAPE"),
      featuredAt: featuredAtFrom(featured),
      title,
      order: (last?.order ?? -1) + 1,
    },
  });
  res.status(201).json({ video });
});

// A new link without a format re-detects it; a format alone just changes it.
export const updateVideo = asyncHandler(async (req: Request, res: Response) => {
  const { url, title, format, featured } = req.body as Partial<VideoBody>;
  const link = url !== undefined ? youtubeLinkOrFail(url) : null;
  const video = await prisma.video.update({
    where: { id: req.params.id },
    data: {
      title,
      ...(link ? { youtubeId: link.id } : {}),
      format: format ?? (link ? (link.isShort ? "SHORT" : "LANDSCAPE") : undefined),
      featuredAt: featuredAtFrom(featured),
    },
  });
  res.json({ video });
});

export const deleteVideo = asyncHandler(async (req: Request, res: Response) => {
  await prisma.video.delete({ where: { id: req.params.id } });
  res.json({ message: "Video deleted" });
});

export const reorderVideos = asyncHandler(async (req: Request, res: Response) => {
  const { id: chapterId } = await requireChapter(req.params.chapterId);
  const { ids } = req.body as { ids: string[] };
  const siblings = await prisma.video.findMany({ where: { chapterId }, select: { id: true } });
  const set = new Set(siblings.map((v) => v.id));
  if (ids.length !== set.size || new Set(ids).size !== ids.length || ids.some((id) => !set.has(id))) {
    throw new AppError(400, "Send every video of this chapter exactly once, in the new order");
  }
  await prisma.$transaction(ids.map((id, order) => prisma.video.update({ where: { id }, data: { order } })));
  res.json({ message: "Videos reordered" });
});

// ===========================================================================
// Image uploads (for rich text): presigned PUT straight to the PUBLIC bucket
// ===========================================================================

export const createImageUpload = asyncHandler(async (req: Request, res: Response) => {
  const { contentType, size } = req.body as { contentType: keyof typeof IMAGE_TYPES; size: number };
  const storage = await getSetting("storage");
  if (!storage?.publicUrl) {
    throw new AppError(400, "Set a Public URL in Admin → Settings → Storage before uploading images");
  }

  const key = `images/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${IMAGE_TYPES[contentType]}`;
  const expiresIn = 300;
  // Content-Type and Content-Length are signed: the browser must upload exactly
  // this type and size, so the 5 MB limit can't be bypassed.
  const uploadUrl = await getSignedUploadUrl(key, contentType, expiresIn, "public", size);

  res.status(201).json({
    key,
    uploadUrl,
    method: "PUT",
    headers: { "Content-Type": contentType },
    expiresIn,
    publicUrl: await getPublicUrl(key),
  });
});
