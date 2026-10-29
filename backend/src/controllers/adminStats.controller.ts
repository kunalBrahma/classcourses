import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../config/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { istDayEnd, istDayKey } from "../utils/istDate";
import { getSetting } from "../services/settings.service";
import { hasPrivateBucket } from "../services/storage.service";
import { catalogHref } from "../services/catalog.service";

// Admin dashboard: one read-only call for the whole page. Days are IST
// calendar days (like the quiz day); each figure is compared with the period
// of the same length just before. Revenue counts PAID orders only (refunded
// orders are REFUNDED, so they drop out by themselves).

const statsQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), "days must be 7, 30 or 90").default(30) });

const DAY_MS = 24 * 60 * 60 * 1000;

export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const { days } = statsQuery.parse(req.query);
  const now = new Date();
  // Day keys oldest → today, and the instants the period (and the one before) start.
  const keys = Array.from({ length: days }, (_, i) => istDayKey(new Date(now.getTime() - (days - 1 - i) * DAY_MS)));
  const from = new Date(istDayEnd(keys[0]).getTime() - DAY_MS);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  const prevFirstKey = istDayKey(prevFrom);
  const inRange = { gte: from };
  const inPrev = { gte: prevFrom, lt: from };

  const [
    studentsTotal,
    signups,
    prevSignups,
    paid,
    prevRevenue,
    allTimeRevenue,
    attemptsByDay,
    prevAttempts,
    active,
    prevActive,
    chapterPlays,
    noteSales,
    recentOrders,
    recentStudents,
    content,
    flagged,
    config,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.findMany({ where: { role: "STUDENT", createdAt: inRange }, select: { createdAt: true } }),
    prisma.user.count({ where: { role: "STUDENT", createdAt: inPrev } }),
    prisma.order.findMany({ where: { status: "PAID", paidAt: inRange }, select: { paidAt: true, amountPaise: true } }),
    prisma.order.aggregate({ where: { status: "PAID", paidAt: inPrev }, _sum: { amountPaise: true }, _count: true }),
    prisma.order.aggregate({ where: { status: "PAID" }, _sum: { amountPaise: true }, _count: true }),
    prisma.quizAttempt.groupBy({ by: ["dayKey", "status"], where: { dayKey: { gte: keys[0] } }, _count: true, _sum: { coinsAwarded: true } }),
    prisma.quizAttempt.groupBy({ by: ["status"], where: { dayKey: { gte: prevFirstKey, lt: keys[0] } }, _count: true }),
    prisma.quizAttempt.groupBy({ by: ["userId"], where: { dayKey: { gte: keys[0] } } }),
    prisma.quizAttempt.groupBy({ by: ["userId"], where: { dayKey: { gte: prevFirstKey, lt: keys[0] } } }),
    prisma.quizAttempt.groupBy({
      by: ["chapterId"],
      where: { dayKey: { gte: keys[0] }, chapterId: { not: null } },
      _count: true,
      orderBy: { _count: { chapterId: "desc" } },
      take: 5,
    }),
    prisma.order.groupBy({
      by: ["noteId"],
      where: { status: "PAID", paidAt: inRange },
      _count: true,
      _sum: { amountPaise: true },
      orderBy: { _sum: { amountPaise: "desc" } },
      take: 5,
    }),
    prisma.order.findMany({
      where: { status: { in: ["PAID", "REFUNDED"] } },
      orderBy: { paidAt: "desc" },
      take: 6,
      select: { id: true, status: true, amountPaise: true, coinsUsed: true, paidAt: true, user: { select: { id: true, name: true, email: true } }, note: { select: { title: true } } },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, name: true, email: true, emailVerified: true, createdAt: true, classLevel: { select: { name: true } } },
    }),
    Promise.all([
      prisma.subject.count({ where: { isActive: true } }),
      prisma.chapter.count({ where: { isPublished: true } }),
      prisma.question.count({ where: { kind: "QA", isPublished: true } }),
      prisma.question.count({ where: { kind: "MCQ", isPublished: true } }),
      prisma.video.count(),
      prisma.note.count({ where: { isPublished: true } }),
      prisma.quiz.count({ where: { isPublished: true } }),
    ]),
    prisma.order.findMany({
      where: { OR: [{ status: "PAID", refundId: null, lastError: { contains: "refund failed" } }, { status: "PAID", lastError: { contains: "spent" } }] },
      select: { id: true, lastError: true },
      take: 20,
    }),
    Promise.all([
      hasPrivateBucket(),
      getSetting("smtp"),
      getSetting("razorpay"),
      prisma.page.count({ where: { isPublished: true } }),
      prisma.contactMessage.count({ where: { status: "NEW" } }),
    ]),
  ]);

  // ---- Daily series (IST days)
  const series = new Map(keys.map((k) => [k, { day: k, signups: 0, revenuePaise: 0, orders: 0, quizzes: 0, passed: 0 }]));
  for (const u of signups) series.get(istDayKey(u.createdAt))!.signups++;
  for (const o of paid) {
    const row = series.get(istDayKey(o.paidAt!));
    if (row) {
      row.revenuePaise += o.amountPaise;
      row.orders++;
    }
  }
  let quizzes = 0;
  let passed = 0;
  let finished = 0;
  let coinsAwarded = 0;
  for (const g of attemptsByDay) {
    const row = series.get(g.dayKey);
    if (!row) continue;
    row.quizzes += g._count;
    quizzes += g._count;
    coinsAwarded += g._sum.coinsAwarded ?? 0;
    if (g.status === "PASSED") {
      row.passed += g._count;
      passed += g._count;
    }
    if (g.status === "PASSED" || g.status === "FAILED") finished += g._count;
  }
  const prevQuizzes = prevAttempts.reduce((s, g) => s + g._count, 0);
  const prevPassed = prevAttempts.find((g) => g.status === "PASSED")?._count ?? 0;
  const prevFinished = prevAttempts.filter((g) => g.status === "PASSED" || g.status === "FAILED").reduce((s, g) => s + g._count, 0);
  const rate = (p: number, f: number) => (f ? Math.round((p / f) * 100) : null);

  // ---- Leaderboards
  const chapters = await prisma.chapter.findMany({
    where: { id: { in: chapterPlays.map((c) => c.chapterId!) } },
    select: {
      id: true,
      number: true,
      title: true,
      slug: true,
      subject: { select: { name: true, slug: true, medium: { select: { slug: true } }, classLevel: { select: { name: true, slug: true } } } },
    },
  });
  const notes = await prisma.note.findMany({ where: { id: { in: noteSales.map((n) => n.noteId) } }, select: { id: true, title: true } });

  const [privateBucket, smtp, razorpay, pagesPublished, newMessages] = config;
  const attention: { message: string; href: string }[] = [];
  if (newMessages) attention.push({ message: `${newMessages} new contact message${newMessages === 1 ? "" : "s"} to answer`, href: "/messages" });
  const failedRefunds = flagged.filter((o) => o.lastError?.includes("refund failed")).length;
  const spentCoins = flagged.length - failedRefunds;
  if (failedRefunds) attention.push({ message: `${failedRefunds} duplicate payment${failedRefunds === 1 ? "" : "s"} couldn't be refunded automatically`, href: "/orders?status=PAID" });
  if (spentCoins) attention.push({ message: `${spentCoins} late payment${spentCoins === 1 ? "" : "s"} where the discount coins had already been spent`, href: "/orders?status=PAID" });
  if (!razorpay) attention.push({ message: "Online payments aren't set up, so premium notes can't be sold", href: "/settings/payments" });
  if (!privateBucket) attention.push({ message: "No private storage for note PDFs yet", href: "/settings/storage" });
  if (!smtp) attention.push({ message: "Email isn't set up: sign-up codes and receipts can't be sent", href: "/settings/email" });
  if (pagesPublished < 4) attention.push({ message: "Publish the Contact, Privacy, Terms and Refund pages (Razorpay checks them)", href: "/pages" });

  const revenue = paid.reduce((s, o) => s + o.amountPaise, 0);
  const [subjects, publishedChapters, qa, mcq, videos, publishedNotes, publishedQuizzes] = content;

  res.json({
    range: { days, from: keys[0], to: keys[keys.length - 1] },
    kpis: {
      revenuePaise: { value: revenue, previous: prevRevenue._sum.amountPaise ?? 0, allTime: allTimeRevenue._sum.amountPaise ?? 0 },
      paidOrders: { value: paid.length, previous: prevRevenue._count, allTime: allTimeRevenue._count },
      newStudents: { value: signups.length, previous: prevSignups, total: studentsTotal },
      activeStudents: { value: active.length, previous: prevActive.length },
      quizzes: { value: quizzes, previous: prevQuizzes },
      passRate: { value: rate(passed, finished), previous: rate(prevPassed, prevFinished) },
      coinsAwarded,
    },
    series: [...series.values()],
    topChapters: chapterPlays.flatMap((c) => {
      const ch = chapters.find((x) => x.id === c.chapterId);
      if (!ch) return [];
      return [
        {
          id: ch.id,
          label: `${ch.subject.name} · Chapter ${ch.number}`,
          title: ch.title,
          classLevel: ch.subject.classLevel.name,
          href: catalogHref(ch.subject.medium.slug, ch.subject.classLevel.slug, ch.subject.slug, ch.slug),
          plays: c._count,
        },
      ];
    }),
    topNotes: noteSales.map((n) => ({ id: n.noteId, title: notes.find((x) => x.id === n.noteId)?.title ?? "Deleted note", sales: n._count, revenuePaise: n._sum.amountPaise ?? 0 })),
    recentOrders,
    recentStudents,
    content: { subjects, chapters: publishedChapters, qa, mcq, videos, notes: publishedNotes, quizzes: publishedQuizzes },
    attention,
  });
});
