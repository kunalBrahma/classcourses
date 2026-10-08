import { Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { OrderStatus, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { deleteObject, getSignedUploadUrl, hasPrivateBucket, headObject } from "../services/storage.service";
import { cancelStaleOrders, RAZORPAY_MIN_PAISE, reconcileOrder } from "../services/order.service";

// Admin: premium notes (PDFs in the PRIVATE bucket), orders, manual grants.

const requireNote = async (id: string) => {
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) throw new AppError(404, "Note not found");
  return note;
};

const assertTargetExists = async (chapterId?: string | null, subjectId?: string | null) => {
  if (chapterId && !(await prisma.chapter.count({ where: { id: chapterId } }))) throw new AppError(404, "Chapter not found");
  if (subjectId && !(await prisma.subject.count({ where: { id: subjectId } }))) throw new AppError(404, "Subject not found");
};

// Paid notes must cost at least Razorpay's ₹1 minimum.
const assertPrice = (isFree: boolean, pricePaise: number) => {
  if (!isFree && pricePaise < RAZORPAY_MIN_PAISE) {
    throw new AppError(400, "A paid note must cost at least ₹1 (100 paise). Mark it free otherwise.");
  }
};

// ===========================================================================
// Notes
// ===========================================================================

const noteListQuery = z.object({
  chapterId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});

export const listNotesAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { chapterId, subjectId } = noteListQuery.parse(req.query);
  const notes = await prisma.note.findMany({
    where: {
      ...(chapterId ? { chapterId } : {}),
      ...(subjectId ? { OR: [{ subjectId }, { chapter: { subjectId } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      chapter: { select: { id: true, title: true, subject: { select: { id: true, name: true } } } },
      subject: { select: { id: true, name: true } },
      _count: { select: { access: true, orders: { where: { status: "PAID" } } } },
    },
  });
  res.json({
    notes: notes.map(({ _count, ...n }) => ({ ...n, hasFile: Boolean(n.fileKey), buyers: _count.access, paidOrders: _count.orders })),
    privateBucketConfigured: await hasPrivateBucket(),
  });
});

export const createNote = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, chapterId, subjectId, pricePaise = 0, isFree = false } = req.body;
  await assertTargetExists(chapterId, subjectId);
  assertPrice(isFree, pricePaise);
  const note = await prisma.note.create({
    data: {
      title,
      description: description ?? null,
      chapterId: chapterId ?? null,
      subjectId: chapterId ? null : subjectId,
      pricePaise: isFree ? 0 : pricePaise,
      isFree,
    },
  });
  res.status(201).json({ note });
});

export const updateNote = asyncHandler(async (req: Request, res: Response) => {
  const existing = await requireNote(req.params.id);
  const body = req.body as {
    title?: string;
    description?: string | null;
    chapterId?: string | null;
    subjectId?: string | null;
    pricePaise?: number;
    isFree?: boolean;
    isPublished?: boolean;
  };
  await assertTargetExists(body.chapterId, body.subjectId);

  const isFree = body.isFree ?? existing.isFree;
  const pricePaise = isFree ? 0 : (body.pricePaise ?? existing.pricePaise);
  assertPrice(isFree, pricePaise);

  const data: Prisma.NoteUncheckedUpdateInput = {
    title: body.title,
    description: body.description,
    isFree,
    pricePaise,
    isPublished: body.isPublished,
  };
  // Re-attaching moves the note between a chapter and a subject.
  if (body.chapterId) Object.assign(data, { chapterId: body.chapterId, subjectId: null });
  else if (body.subjectId) Object.assign(data, { subjectId: body.subjectId, chapterId: null });

  if (body.isPublished) {
    if (!existing.fileKey) throw new AppError(400, "Upload the PDF before publishing");
    const chapterId = (data.chapterId as string | undefined) ?? existing.chapterId;
    const subjectId = (data.subjectId as string | null | undefined) === null ? null : ((data.subjectId as string | undefined) ?? existing.subjectId);
    if (!chapterId && !subjectId) throw new AppError(400, "Attach the note to a chapter or subject before publishing");
  }

  const note = await prisma.note.update({ where: { id: existing.id }, data });
  res.json({ note });
});

// Notes that were ever ordered are kept (receipts point at them): unpublish instead.
export const deleteNote = asyncHandler(async (req: Request, res: Response) => {
  const note = await requireNote(req.params.id);
  const orders = await prisma.order.count({ where: { noteId: note.id } });
  if (orders > 0) {
    throw new AppError(409, `This note has ${orders} order(s). Unpublish it instead of deleting.`);
  }
  await prisma.note.delete({ where: { id: note.id } });
  if (note.fileKey) await deleteObject(note.fileKey, "private").catch(() => undefined);
  res.json({ message: "Note deleted" });
});

// Step 1 of an upload: a presigned PUT into the PRIVATE bucket (exact type + size signed).
export const createNoteUploadUrl = asyncHandler(async (req: Request, res: Response) => {
  const note = await requireNote(req.params.id);
  if (!(await hasPrivateBucket())) {
    throw new AppError(400, "Set a Private bucket in Admin → Settings → Storage before uploading notes");
  }
  const { size } = req.body as { size: number };
  const key = `notes/${note.id}/${crypto.randomUUID()}.pdf`;
  const expiresIn = 900;
  const uploadUrl = await getSignedUploadUrl(key, "application/pdf", expiresIn, "private", size);
  res.status(201).json({ key, uploadUrl, method: "PUT", headers: { "Content-Type": "application/pdf" }, expiresIn });
});

// Step 2: after the browser's PUT succeeds, attach the uploaded file to the note.
export const attachNoteFile = asyncHandler(async (req: Request, res: Response) => {
  const note = await requireNote(req.params.id);
  const { key } = req.body as { key: string };
  if (!key.startsWith(`notes/${note.id}/`) || !key.endsWith(".pdf")) {
    throw new AppError(400, "That file doesn't belong to this note");
  }
  const object = await headObject(key, "private");
  if (!object) throw new AppError(400, "The upload wasn't found. Please upload the PDF again.");
  if (object.contentType !== "application/pdf") throw new AppError(400, "Only PDF files can be attached");

  const updated = await prisma.note.update({ where: { id: note.id }, data: { fileKey: key, fileSize: object.size } });
  if (note.fileKey && note.fileKey !== key) {
    await deleteObject(note.fileKey, "private").catch(() => undefined);
  }
  res.json({ note: updated });
});

// Support tool: give a student a note without payment (e.g. after a payment issue).
export const grantNoteAccess = asyncHandler(async (req: AuthRequest, res: Response) => {
  const note = await requireNote(req.params.id);
  const user = await prisma.user.findUnique({ where: { id: req.body.userId }, select: { id: true } });
  if (!user) throw new AppError(404, "User not found");
  const access = await prisma.noteAccess.upsert({
    where: { userId_noteId: { userId: user.id, noteId: note.id } },
    create: { userId: user.id, noteId: note.id },
    update: {},
  });
  res.status(201).json({ access });
});

// ===========================================================================
// Orders
// ===========================================================================

const orderListQuery = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  userId: z.string().uuid().optional(),
  noteId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const listOrdersAdmin = asyncHandler(async (req: Request, res: Response) => {
  await cancelStaleOrders();
  const { status, userId, noteId, page, pageSize } = orderListQuery.parse(req.query);
  const where: Prisma.OrderWhereInput = { status, userId, noteId };
  const [orders, total, revenue] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, email: true, name: true } }, note: { select: { id: true, title: true } } },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where: { ...where, status: "PAID" }, _sum: { amountPaise: true }, _count: true }),
  ]);
  res.json({
    orders,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    paid: { count: revenue._count, amountPaise: revenue._sum.amountPaise ?? 0 },
  });
});

export const getOrderAdmin = asyncHandler(async (req: Request, res: Response) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      note: { select: { id: true, title: true } },
      access: true,
    },
  });
  if (!order) throw new AppError(404, "Order not found");
  res.json({ order });
});

export const reconcileOrderAdmin = asyncHandler(async (req: Request, res: Response) => {
  res.json(await reconcileOrder(req.params.id));
});
