import { Request, Response } from "express";
import { z } from "zod";
import { ContactStatus, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { sendContactNotificationEmail } from "../utils/mailer";

type ContactBody = { name: string; email: string; phone: string | null; topic: string; message: string; website?: string };

// Emails the site's contact address after the response has gone out, and
// notes the result on the message so the admin can see if it failed.
const notifyInBackground = (id: string, body: ContactBody) => {
  setImmediate(() => {
    sendContactNotificationEmail(body)
      .then(() => prisma.contactMessage.update({ where: { id }, data: { emailNote: "sent" } }))
      .catch(async (err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[contact] notification email for ${id} failed:`, reason);
        await prisma.contactMessage.update({ where: { id }, data: { emailNote: reason.slice(0, 300) } }).catch(() => undefined);
      });
  });
};

// POST /api/content/contact (public). The message is saved first, the student
// gets the answer straight away, and the email to the admin follows.
export const submitContact = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as ContactBody;
  // Spam trap filled in: pretend it worked, store nothing.
  if (body.website) {
    res.status(201).json({ message: "Thanks! We've got your message." });
    return;
  }
  const saved = await prisma.contactMessage.create({
    data: { name: body.name, email: body.email, phone: body.phone, topic: body.topic, message: body.message, userId: req.user?.userId ?? null },
    select: { id: true },
  });
  res.status(201).json({ message: "Thanks! We've got your message." });
  notifyInBackground(saved.id, body);
});

// ---------------------------------------------------------------------------
// Admin → Messages
// ---------------------------------------------------------------------------

const listQuery = z.object({
  status: z.nativeEnum(ContactStatus).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listContactMessages = asyncHandler(async (req: Request, res: Response) => {
  const { status, search, page, pageSize } = listQuery.parse(req.query);
  // "Inbox" (no status) hides archived messages.
  const where: Prisma.ContactMessageWhereInput = {
    ...(status ? { status } : { status: { not: "ARCHIVED" } }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { message: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [messages, total, counts] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.groupBy({ by: ["status"], _count: true }),
  ]);
  res.json({
    messages,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  });
});

export const updateContactMessage = asyncHandler(async (req: Request, res: Response) => {
  const message = await prisma.contactMessage.update({ where: { id: req.params.id }, data: { status: req.body.status } });
  res.json({ message });
});

export const deleteContactMessage = asyncHandler(async (req: Request, res: Response) => {
  await prisma.contactMessage.delete({ where: { id: req.params.id } });
  res.json({ message: "Message deleted" });
});
