import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { isAutoChapterSlug, slugOr, uniqueSlug, RESERVED_TOP_LEVEL } from "../utils/slug";
import { sanitizeOptional } from "../utils/sanitizeHtml";
import { nextChapterNumber, nextChapterOrder, sortChaptersInReadingOrder } from "../services/catalog.service";

// Admin CRUD for Medium → Class → Subject → Part → Chapter.
// Deletes never silently cascade into content: anything that still has
// children answers 409 unless `?force=true` is passed (and mediums can't be
// force-deleted at all).

const isForce = (req: Request) => req.query.force === "true";

// Links (slugs) are generated from names. Two items with the same name in the
// same place would only confuse students, so that is refused in plain words;
// a link clash between different names just gets a "-2" suffix.
const sameName = (name: string) => ({ name: { equals: name.trim(), mode: "insensitive" as const } });

// Validates that `ids` is exactly the full sibling set, then writes order = index.
const assertSameSet = (ids: string[], siblingIds: string[], what: string) => {
  const siblings = new Set(siblingIds);
  if (ids.length !== siblings.size || ids.some((id) => !siblings.has(id))) {
    throw new AppError(400, `Send every ${what} in this group exactly once, in the new order`);
  }
};

// ===========================================================================
// Mediums
// ===========================================================================

export const listMediumsAdmin = asyncHandler(async (_req: Request, res: Response) => {
  const mediums = await prisma.medium.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { subjects: true } } },
  });
  res.json({
    mediums: mediums.map(({ _count, ...m }) => ({ ...m, subjectCount: _count.subjects })),
  });
});

// A medium's link can't be one of the site's own pages (/about, /notes …).
const assertMediumLinkFree = (slug?: string) => {
  if (slug && RESERVED_TOP_LEVEL.has(slug)) {
    throw new AppError(400, `"${slug}" is the link of a page on the site. Pick a different link for this medium.`);
  }
};

export const createMedium = asyncHandler(async (req: Request, res: Response) => {
  const { name, nativeName, slug, isActive } = req.body;
  assertMediumLinkFree(slug);
  if (await prisma.medium.findFirst({ where: sameName(name), select: { id: true } })) {
    throw new AppError(409, `A medium called "${name.trim()}" already exists.`);
  }
  const last = await prisma.medium.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const finalSlug =
    slug ??
    (await uniqueSlug(slugOr(name, `medium-${(await prisma.medium.count()) + 1}`), async (s) =>
      RESERVED_TOP_LEVEL.has(s) || Boolean(await prisma.medium.findUnique({ where: { slug: s }, select: { id: true } }))
    ));
  const medium = await prisma.medium.create({
    data: {
      name,
      nativeName: nativeName ?? null,
      slug: finalSlug,
      isActive: isActive ?? true,
      order: (last?.order ?? -1) + 1,
    },
  });
  res.status(201).json({ medium });
});

export const updateMedium = asyncHandler(async (req: Request, res: Response) => {
  assertMediumLinkFree(req.body.slug);
  if (req.body.name && (await prisma.medium.findFirst({ where: { ...sameName(req.body.name), NOT: { id: req.params.id } }, select: { id: true } }))) {
    throw new AppError(409, `A medium called "${req.body.name.trim()}" already exists.`);
  }
  const medium = await prisma.medium.update({ where: { id: req.params.id }, data: req.body });
  res.json({ medium });
});

export const deleteMedium = asyncHandler(async (req: Request, res: Response) => {
  const count = await prisma.subject.count({ where: { mediumId: req.params.id } });
  if (count > 0) {
    throw new AppError(
      409,
      `This medium still has ${count} subject(s). Delete them first, or hide the medium instead.`
    );
  }
  await prisma.medium.delete({ where: { id: req.params.id } });
  res.json({ message: "Medium deleted" });
});

export const reorderMediums = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  const all = await prisma.medium.findMany({ select: { id: true } });
  assertSameSet(ids, all.map((m) => m.id), "medium");
  await prisma.$transaction(ids.map((id, order) => prisma.medium.update({ where: { id }, data: { order } })));
  res.json({ message: "Mediums reordered" });
});

// ===========================================================================
// Classes — fully admin-managed ("Class 5", "LKG", "BA 1st Year" …)
// ===========================================================================

const classSelectAdmin = { id: true, name: true, nativeName: true, slug: true } as const;

export const listClassLevelsAdmin = asyncHandler(async (_req: Request, res: Response) => {
  const classes = await prisma.classLevel.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { subjects: true, quizzes: true } } },
  });
  // Subjects per medium, so the admin sees where a class is actually used.
  const perMedium = await prisma.subject.groupBy({ by: ["classLevelId", "mediumId"], _count: { _all: true } });
  res.json({
    classes: classes.map(({ _count, ...c }) => ({
      ...c,
      subjectCount: _count.subjects,
      quizCount: _count.quizzes,
      subjectsByMedium: Object.fromEntries(perMedium.filter((p) => p.classLevelId === c.id).map((p) => [p.mediumId, p._count._all])),
    })),
  });
});

const sameClassName = async (name: string, exceptId?: string) =>
  prisma.classLevel.findFirst({ where: { ...sameName(name), ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });

export const createClassLevel = asyncHandler(async (req: Request, res: Response) => {
  const { name, nativeName, slug, isActive } = req.body;
  if (await sameClassName(name)) throw new AppError(409, `A class called "${name.trim()}" already exists.`);
  const count = await prisma.classLevel.count();
  const finalSlug =
    slug ??
    (await uniqueSlug(slugOr(name, `class-${count + 1}`), async (s) =>
      Boolean(await prisma.classLevel.findUnique({ where: { slug: s }, select: { id: true } }))
    ));
  const last = await prisma.classLevel.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const classLevel = await prisma.classLevel.create({
    data: { name: name.trim(), nativeName: nativeName ?? null, slug: finalSlug, isActive: isActive ?? true, order: (last?.order ?? -1) + 1 },
  });
  res.status(201).json({ classLevel });
});

export const updateClassLevel = asyncHandler(async (req: Request, res: Response) => {
  if (req.body.name && (await sameClassName(req.body.name, req.params.id))) {
    throw new AppError(409, `A class called "${req.body.name.trim()}" already exists.`);
  }
  const classLevel = await prisma.classLevel.update({ where: { id: req.params.id }, data: req.body });
  res.json({ classLevel });
});

// Never cascades into subjects/quizzes: empty it first, or hide it.
export const deleteClassLevel = asyncHandler(async (req: Request, res: Response) => {
  const classLevel = await prisma.classLevel.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { subjects: true, quizzes: true } } },
  });
  if (!classLevel) throw new AppError(404, "Class not found");
  const { subjects, quizzes } = classLevel._count;
  if (subjects > 0 || quizzes > 0) {
    const what = [subjects && `${subjects} subject${subjects === 1 ? "" : "s"}`, quizzes && `${quizzes} quiz${quizzes === 1 ? "" : "zes"}`].filter(Boolean).join(" and ");
    throw new AppError(409, `${classLevel.name} still has ${what}. Delete or move them first, or hide the class instead.`);
  }
  await prisma.classLevel.delete({ where: { id: classLevel.id } });
  res.json({ message: "Class deleted" });
});

export const reorderClassLevels = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  const all = await prisma.classLevel.findMany({ select: { id: true } });
  assertSameSet(ids, all.map((c) => c.id), "class");
  await prisma.$transaction(ids.map((id, order) => prisma.classLevel.update({ where: { id }, data: { order } })));
  res.json({ message: "Order saved" });
});

// ===========================================================================
// Subjects
// ===========================================================================

const subjectListQuery = z.object({
  mediumId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
});

export const listSubjectsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { mediumId, classId } = subjectListQuery.parse(req.query);
  const subjects = await prisma.subject.findMany({
    where: { mediumId, classLevelId: classId },
    orderBy: [{ medium: { order: "asc" } }, { classLevel: { order: "asc" } }, { order: "asc" }],
    include: {
      medium: { select: { id: true, name: true, slug: true } },
      classLevel: { select: classSelectAdmin },
      _count: { select: { parts: true, chapters: true } },
    },
  });
  res.json({
    subjects: subjects.map(({ _count, ...s }) => ({
      ...s,
      partCount: _count.parts,
      chapterCount: _count.chapters,
    })),
  });
});

// Full tree for the admin editor, including unpublished chapters, in reading order.
export const getSubjectAdmin = asyncHandler(async (req: Request, res: Response) => {
  const subject = await prisma.subject.findUnique({
    where: { id: req.params.id },
    include: {
      medium: { select: { id: true, name: true, slug: true } },
      classLevel: { select: classSelectAdmin },
      parts: { orderBy: { order: "asc" } },
      chapters: { include: { part: { select: { order: true } } } },
    },
  });
  if (!subject) {
    throw new AppError(404, "Subject not found");
  }
  const { chapters, ...rest } = subject;
  res.json({
    subject: {
      ...rest,
      chapters: sortChaptersInReadingOrder(chapters).map(({ part: _part, ...c }) => c),
    },
  });
});

export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  const { mediumId, classId, name, nativeName, slug, isActive } = req.body;
  const [medium, classLevel] = await Promise.all([
    prisma.medium.findUnique({ where: { id: mediumId } }),
    prisma.classLevel.findUnique({ where: { id: classId } }),
  ]);
  if (!medium) throw new AppError(404, "Medium not found");
  if (!classLevel) throw new AppError(404, "Class not found");

  const scope = { mediumId, classLevelId: classLevel.id };
  if (await prisma.subject.findFirst({ where: { ...scope, ...sameName(name) }, select: { id: true } })) {
    throw new AppError(409, `${classLevel.name} already has a subject called "${name.trim()}".`);
  }
  // Explicit slugs must be unique (409 on clash); generated ones get a suffix.
  const finalSlug =
    slug ??
    (await uniqueSlug(slugOr(name, `subject-${(await prisma.subject.count({ where: scope })) + 1}`), async (s) =>
      Boolean(await prisma.subject.findFirst({ where: { ...scope, slug: s }, select: { id: true } }))
    ));
  const last = await prisma.subject.findFirst({ where: scope, orderBy: { order: "desc" }, select: { order: true } });

  const subject = await prisma.subject.create({
    data: {
      ...scope,
      name,
      nativeName: nativeName ?? null,
      slug: finalSlug,
      isActive: isActive ?? true,
      order: (last?.order ?? -1) + 1,
    },
  });
  res.status(201).json({ subject });
});

export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  if (req.body.name) {
    const current = await prisma.subject.findUnique({ where: { id: req.params.id }, select: { mediumId: true, classLevelId: true } });
    const clash =
      current &&
      (await prisma.subject.findFirst({
        where: { mediumId: current.mediumId, classLevelId: current.classLevelId, ...sameName(req.body.name), NOT: { id: req.params.id } },
        select: { id: true },
      }));
    if (clash) throw new AppError(409, `This class already has a subject called "${req.body.name.trim()}".`);
  }
  const subject = await prisma.subject.update({ where: { id: req.params.id }, data: req.body });
  res.json({ subject });
});

export const deleteSubject = asyncHandler(async (req: Request, res: Response) => {
  const count = await prisma.chapter.count({ where: { subjectId: req.params.id } });
  if (count > 0 && !isForce(req)) {
    throw new AppError(
      409,
      `This subject has ${count} chapter(s). Delete it anyway to remove them too, or hide it instead.`
    );
  }
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ message: "Subject deleted" });
});

// Reorders the subjects of one medium + class.
export const reorderSubjects = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  const first = await prisma.subject.findUnique({ where: { id: ids[0] } });
  if (!first) throw new AppError(404, "Subject not found");
  const siblings = await prisma.subject.findMany({
    where: { mediumId: first.mediumId, classLevelId: first.classLevelId },
    select: { id: true },
  });
  assertSameSet(ids, siblings.map((s) => s.id), "subject of this medium and class");
  await prisma.$transaction(ids.map((id, order) => prisma.subject.update({ where: { id }, data: { order } })));
  res.json({ message: "Subjects reordered" });
});

// ===========================================================================
// Parts
// ===========================================================================

const requireSubject = async (id: string) => {
  const subject = await prisma.subject.findUnique({ where: { id }, select: { id: true } });
  if (!subject) throw new AppError(404, "Subject not found");
  return subject;
};

const requirePartOfSubject = async (partId: string, subjectId: string) => {
  const part = await prisma.subjectPart.findUnique({ where: { id: partId }, select: { subjectId: true } });
  if (!part || part.subjectId !== subjectId) {
    throw new AppError(400, "That part does not belong to this subject");
  }
};

export const createPart = asyncHandler(async (req: Request, res: Response) => {
  const { id: subjectId } = await requireSubject(req.params.id);
  const last = await prisma.subjectPart.findFirst({
    where: { subjectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const part = await prisma.subjectPart.create({
    data: { subjectId, title: req.body.title, order: (last?.order ?? -1) + 1 },
  });
  res.status(201).json({ part });
});

export const updatePart = asyncHandler(async (req: Request, res: Response) => {
  const part = await prisma.subjectPart.update({ where: { id: req.params.partId }, data: { title: req.body.title } });
  res.json({ part });
});

// Chapters of a deleted part are kept: they move to the end of the no-part group.
export const deletePart = asyncHandler(async (req: Request, res: Response) => {
  const part = await prisma.subjectPart.findUnique({
    where: { id: req.params.partId },
    include: { chapters: { orderBy: { order: "asc" }, select: { id: true } } },
  });
  if (!part) throw new AppError(404, "Part not found");

  const start = await nextChapterOrder(part.subjectId, null);
  await prisma.$transaction([
    ...part.chapters.map((c, i) =>
      prisma.chapter.update({ where: { id: c.id }, data: { partId: null, order: start + i } })
    ),
    prisma.subjectPart.delete({ where: { id: part.id } }),
  ]);
  res.json({ message: "Part deleted", movedChapters: part.chapters.length });
});

export const reorderParts = asyncHandler(async (req: Request, res: Response) => {
  const { id: subjectId } = await requireSubject(req.params.id);
  const { ids } = req.body as { ids: string[] };
  const siblings = await prisma.subjectPart.findMany({ where: { subjectId }, select: { id: true } });
  assertSameSet(ids, siblings.map((p) => p.id), "part of this subject");
  await prisma.$transaction(ids.map((id, order) => prisma.subjectPart.update({ where: { id }, data: { order } })));
  res.json({ message: "Parts reordered" });
});

// ===========================================================================
// Chapters
// ===========================================================================

const chapterSlugTaken = (subjectId: string) => async (slug: string) =>
  Boolean(await prisma.chapter.findFirst({ where: { subjectId, slug }, select: { id: true } }));

export const createChapter = asyncHandler(async (req: Request, res: Response) => {
  const { id: subjectId } = await requireSubject(req.params.id);
  const { title, slug, number, partId = null, isPublished } = req.body;
  if (partId) await requirePartOfSubject(partId, subjectId);

  const chapterNumber = number ?? (await nextChapterNumber(subjectId));
  const chapter = await prisma.chapter.create({
    data: {
      subjectId,
      partId,
      number: chapterNumber,
      title: title ?? `Chapter ${chapterNumber}`,
      slug: slug ?? (await uniqueSlug(`chapter-${chapterNumber}`, chapterSlugTaken(subjectId))),
      order: await nextChapterOrder(subjectId, partId),
      isPublished: isPublished ?? true,
    },
  });
  res.status(201).json({ chapter });
});

// Appends N placeholder chapters ("Chapter 7", "Chapter 8", ...) to a part or the no-part group.
export const bulkCreateChapters = asyncHandler(async (req: Request, res: Response) => {
  const { id: subjectId } = await requireSubject(req.params.id);
  const { count, partId = null } = req.body as { count: number; partId?: string | null };
  if (partId) await requirePartOfSubject(partId, subjectId);

  const [firstNumber, firstOrder, existing] = await Promise.all([
    nextChapterNumber(subjectId),
    nextChapterOrder(subjectId, partId),
    prisma.chapter.findMany({ where: { subjectId }, select: { slug: true } }),
  ]);
  const taken = new Set(existing.map((c) => c.slug));

  const data = Array.from({ length: count }, (_, i) => {
    const number = firstNumber + i;
    let slug = `chapter-${number}`;
    for (let n = 2; taken.has(slug); n += 1) slug = `chapter-${number}-${n}`;
    taken.add(slug);
    return { subjectId, partId, number, title: `Chapter ${number}`, slug, order: firstOrder + i };
  });

  await prisma.chapter.createMany({ data });
  res.status(201).json({ message: `${count} chapter(s) added`, firstNumber, lastNumber: firstNumber + count - 1 });
});

export const updateChapter = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.chapter.findUnique({ where: { id: req.params.chapterId } });
  if (!existing) throw new AppError(404, "Chapter not found");

  const { partId, aboutHtml, ...rest } = req.body as { partId?: string | null; aboutHtml?: string | null } & Record<
    string,
    unknown
  >;
  const data: Record<string, unknown> = { ...rest };
  if (aboutHtml !== undefined) data.aboutHtml = sanitizeOptional(aboutHtml);

  // An automatic link follows the chapter number ("chapter-3" → "chapter-4");
  // a link the admin chose by hand is left alone.
  const number = typeof rest.number === "number" ? rest.number : undefined;
  if (rest.slug === undefined && number !== undefined && number !== existing.number && isAutoChapterSlug(existing.slug, existing.number)) {
    data.slug = await uniqueSlug(`chapter-${number}`, async (s) =>
      Boolean(await prisma.chapter.findFirst({ where: { subjectId: existing.subjectId, slug: s, NOT: { id: existing.id } }, select: { id: true } }))
    );
  }

  // Moving between parts appends the chapter to the end of the target group.
  if (partId !== undefined && partId !== existing.partId) {
    if (partId) await requirePartOfSubject(partId, existing.subjectId);
    data.partId = partId;
    data.order = await nextChapterOrder(existing.subjectId, partId);
  }

  const chapter = await prisma.chapter.update({ where: { id: existing.id }, data });
  res.json({ chapter });
});

export const deleteChapter = asyncHandler(async (req: Request, res: Response) => {
  const [questions, videos] = await Promise.all([
    prisma.question.count({ where: { chapterId: req.params.chapterId } }),
    prisma.video.count({ where: { chapterId: req.params.chapterId } }),
  ]);
  if ((questions > 0 || videos > 0) && !isForce(req)) {
    throw new AppError(
      409,
      `This chapter has ${questions} question(s) and ${videos} video(s). Delete it anyway to remove them too, or unpublish it to hide it.`
    );
  }
  await prisma.chapter.delete({ where: { id: req.params.chapterId } });
  res.json({ message: "Chapter deleted" });
});

// Reorders the chapters of one group (a part, or partId: null for no part).
export const reorderChapters = asyncHandler(async (req: Request, res: Response) => {
  const { id: subjectId } = await requireSubject(req.params.id);
  const { ids, partId } = req.body as { ids: string[]; partId: string | null };
  if (partId) await requirePartOfSubject(partId, subjectId);
  const siblings = await prisma.chapter.findMany({ where: { subjectId, partId }, select: { id: true } });
  assertSameSet(ids, siblings.map((c) => c.id), "chapter of this part");
  await prisma.$transaction(ids.map((id, order) => prisma.chapter.update({ where: { id }, data: { order } })));
  res.json({ message: "Chapters reordered" });
});
