import { NotificationKind, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { sendNoticeEmail } from "../utils/mailer";

// The bell inbox (client requirements of 6 Nov 2026: "send a message or
// notice to one user or to all users, e.g. a warning, a notice about
// suspension, or an announcement"). A notice to everyone is stored once
// (userId null); who has read what is in NotificationRead.

// A new account also sees notices to everyone from the last 30 days.
const BROADCAST_LOOKBACK_DAYS = 30;

const inboxWhere = async (userId: string): Promise<Prisma.NotificationWhereInput> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
  const lookback = new Date(Date.now() - BROADCAST_LOOKBACK_DAYS * 86_400_000);
  const since = user.createdAt < lookback ? user.createdAt : lookback;
  return { OR: [{ userId }, { userId: null, createdAt: { gte: since } }] };
};

export const unreadCount = async (userId: string) => {
  const where = await inboxWhere(userId);
  return prisma.notification.count({ where: { ...where, reads: { none: { userId } } } });
};

export const listInbox = async (userId: string, page: number, pageSize: number) => {
  const where = await inboxWhere(userId);
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, kind: true, title: true, body: true, link: true, createdAt: true, userId: true, reads: { where: { userId }, select: { readAt: true } } },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, reads: { none: { userId } } } }),
  ]);
  return {
    items: rows.map(({ reads, userId: to, ...n }) => ({ ...n, toEveryone: to === null, read: reads.length > 0 })),
    total,
    unread,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

/** Marks some (or all) of the student's notifications read. */
export const markRead = async (userId: string, ids: string[] | "all") => {
  const where = await inboxWhere(userId);
  const visible = await prisma.notification.findMany({
    where: { ...where, ...(ids === "all" ? {} : { id: { in: ids } }), reads: { none: { userId } } },
    select: { id: true },
  });
  if (visible.length) await prisma.notificationRead.createMany({ data: visible.map((n) => ({ notificationId: n.id, userId })), skipDuplicates: true });
  return unreadCount(userId);
};

// ---- Sending ---------------------------------------------------------------------------

export interface NoticeInput {
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
}

/**
 * The site's own messages (refund done, parent answered, coins changed).
 * Never throws: a failed notice must not undo what it reports.
 */
export const notifyUser = async (userId: string, notice: NoticeInput) => {
  try {
    await prisma.notification.create({ data: { userId, kind: notice.kind, title: notice.title, body: notice.body, link: notice.link ?? null } });
  } catch (err) {
    console.error("[notify] Couldn't save a notification:", err instanceof Error ? err.message : err);
  }
};

/** From an admin: to one student (optionally emailed too) or to everyone. */
export const sendNotice = async (adminId: string, input: NoticeInput & { to: "all" | string; email?: boolean }) => {
  if (input.to === "all") {
    if (input.kind === "WARNING") throw new AppError(400, "A warning goes to one student. Choose a student, or send a notice.");
    if (input.email) throw new AppError(400, "Notices to everyone appear on the site only; they aren't emailed.");
    const n = await prisma.notification.create({
      data: { userId: null, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null, sentById: adminId },
    });
    return { notification: n, recipient: null };
  }
  const user = await prisma.user.findUnique({ where: { id: input.to }, select: { id: true, email: true, name: true, status: true } });
  if (!user || user.status === "DELETED") throw new AppError(404, "Student not found");
  const n = await prisma.notification.create({
    data: { userId: user.id, kind: input.kind, title: input.title, body: input.body, link: input.link ?? null, sentById: adminId },
  });
  if (!input.email) return { notification: n, recipient: user };
  // The email result is kept with the notice for the admin
  const emailNote = await sendNoticeEmail(user.email, { title: input.title, body: input.body, kind: input.kind, link: input.link ?? null });
  const updated = await prisma.notification.update({ where: { id: n.id }, data: { emailNote } });
  return { notification: updated, recipient: user };
};

// ---- Admin -----------------------------------------------------------------------------

export const listSentAdmin = async (q: { userId?: string; to?: "all" | "one"; kind?: NotificationKind; page: number; pageSize: number }) => {
  const where: Prisma.NotificationWhereInput = {
    ...(q.userId ? { userId: q.userId } : q.to === "all" ? { userId: null } : q.to === "one" ? { userId: { not: null } } : {}),
    ...(q.kind ? { kind: q.kind } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        user: { select: { id: true, name: true, email: true } },
        sentBy: { select: { id: true, name: true, email: true } },
        _count: { select: { reads: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);
  return {
    items: rows.map(({ _count, ...n }) => ({ ...n, reads: _count.reads })),
    total,
    page: q.page,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
};

/** Takes it out of every inbox. */
export const deleteNotice = async (id: string) => {
  const n = await prisma.notification.findUnique({ where: { id }, select: { title: true, userId: true } });
  if (!n) throw new AppError(404, "Notice not found");
  await prisma.notification.delete({ where: { id } });
  return n;
};

export const warningCount = (userId: string) => prisma.notification.count({ where: { userId, kind: "WARNING" } });
