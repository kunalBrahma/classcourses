import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { istDayKey } from "../src/utils/istDate";
import { api, createUserAndLogin } from "./helpers";

let admin: { auth: string };
let student: { auth: string; email: string };

beforeAll(async () => {
  await seedCatalog();
  admin = await createUserAndLogin("ADMIN");
  student = await createUserAndLogin("STUDENT");
});

const stats = (q = "") => api().get(`/api/admin/stats${q}`).set("Authorization", admin.auth);

describe("admin dashboard stats", () => {
  it("counts revenue, students and quizzes for the period, by IST day", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: student.email } });
    const chapter = await prisma.chapter.findFirstOrThrow({ where: { isPublished: true } });
    const note = await prisma.note.create({ data: { title: "Stats note", chapterId: chapter.id, pricePaise: 4900, isPublished: true, fileKey: "k" } });
    const paidAt = new Date();
    await prisma.order.create({ data: { userId: user.id, noteId: note.id, listPricePaise: 4900, amountPaise: 4900, status: "PAID", paidAt } });
    // Refunded and old orders don't count in this period
    await prisma.order.create({ data: { userId: user.id, noteId: note.id, listPricePaise: 4900, amountPaise: 4900, status: "REFUNDED", paidAt } });
    await prisma.order.create({ data: { userId: user.id, noteId: note.id, listPricePaise: 4900, amountPaise: 3000, status: "PAID", paidAt: new Date(Date.now() - 40 * 86_400_000) } });
    const attempt = (status: "PASSED" | "FAILED", dayKey = istDayKey()) =>
      prisma.quizAttempt.create({ data: { userId: user.id, chapterId: chapter.id, dayKey, status, questionIds: [], secondsPerQuestion: 10, passMark: 7, coinsAwarded: status === "PASSED" ? 10 : 0 } });
    await attempt("PASSED");
    await attempt("FAILED");

    const res = await stats("?days=30");
    expect(res.status).toBe(200);
    expect(res.body.range.days).toBe(30);
    expect(res.body.series).toHaveLength(30);
    expect(res.body.series.at(-1)).toMatchObject({ day: istDayKey(), revenuePaise: 4900, orders: 1, quizzes: 2, passed: 1 });
    expect(res.body.kpis).toMatchObject({
      revenuePaise: { value: 4900, allTime: 7900 },
      paidOrders: { value: 1, allTime: 2 },
      newStudents: { total: 1 },
      activeStudents: { value: 1 },
      quizzes: { value: 2 },
      passRate: { value: 50 },
      coinsAwarded: 10,
    });
    expect(res.body.topNotes[0]).toMatchObject({ title: "Stats note", sales: 1, revenuePaise: 4900 });
    expect(res.body.topChapters[0]).toMatchObject({ id: chapter.id, plays: 2, href: expect.stringMatching(/^\//) });
    expect(res.body.recentOrders.map((o: { status: string }) => o.status)).toContain("REFUNDED");
    expect(res.body.attention.length).toBeGreaterThan(0); // payments/email/storage aren't set up in tests

    // 90 days reaches the older order
    expect((await stats("?days=90")).body.kpis.revenuePaise.value).toBe(7900);
  });

  it("only accepts 7, 30 or 90 days and is admin-only", async () => {
    expect((await stats("?days=12")).status).toBe(400);
    expect((await api().get("/api/admin/stats").set("Authorization", student.auth)).status).toBe(403);
  });
});
