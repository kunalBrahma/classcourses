import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { istDayKey } from "../src/utils/istDate";
import { api, classIdOf, createUserAndLogin } from "./helpers";

let admin: { auth: string };
let alice: { auth: string; email: string };
let bob: { auth: string; email: string };
let chan: { auth: string; email: string };
let chapterId: string;
let otherChapterId: string;
const ids: Record<string, string> = {};

const as = (who: { auth: string }) => ({
  get: (path: string) => api().get(path).set("Authorization", who.auth),
  post: (path: string, body: object = {}) => api().post(path).set("Authorization", who.auth).send(body),
});

// Plays a quiz through the real student API. pick(i) = option to choose for question i (null = skip).
const play = async (who: { auth: string }, chapter: string, pick: (i: number) => number | null, stopAfter?: number) => {
  const { body } = await as(who).post("/api/quiz/start", { chapterId: chapter });
  const id = body.attempt.id as string;
  const total = stopAfter ?? body.attempt.total;
  for (let i = 0; i < total; i += 1) {
    await as(who).post(`/api/quiz/attempts/${id}/next`);
    await as(who).post(`/api/quiz/attempts/${id}/answer`, { optionIndex: pick(i) });
  }
  return id;
};

beforeAll(async () => {
  await seedCatalog();
  admin = await createUserAndLogin("ADMIN");
  alice = await createUserAndLogin("STUDENT");
  bob = await createUserAndLogin("STUDENT");
  chan = await createUserAndLogin("STUDENT");
  await prisma.user.update({ where: { email: alice.email }, data: { name: "Alice Saikia" } });

  const science = await prisma.subject.findFirstOrThrow({
    where: { slug: "general-science", medium: { slug: "english-medium" }, classLevel: { slug: "class-9" } },
    include: { chapters: { orderBy: { order: "asc" }, take: 2 } },
  });
  [chapterId, otherChapterId] = science.chapters.map((c) => c.id);
  for (const cid of [chapterId, otherChapterId]) {
    await prisma.question.createMany({
      data: Array.from({ length: 10 }, (_, n) => ({
        chapterId: cid,
        kind: "MCQ" as const,
        source: "EXTRA" as const,
        question: `<p>Q${n}</p>`,
        options: ["wrong A", "right", "wrong C"],
        correctIndex: 1,
        order: n,
      })),
    });
  }

  ids.alicePass = await play(alice, chapterId, (i) => (i < 8 ? 1 : 0)); // 8/10 → PASSED
  ids.bobFail = await play(bob, chapterId, () => 0); // always "wrong A" → FAILED
  // Chan: answers 2 correctly, lets the 3rd time out, then leaves (unfinished)
  ids.chanUnfinished = await play(chan, chapterId, () => 1, 2);
  await as(chan).post(`/api/quiz/attempts/${ids.chanUnfinished}/next`);
  await prisma.quizAttempt.update({ where: { id: ids.chanUnfinished }, data: { questionDeadline: new Date(Date.now() - 60_000) } });
  await as(chan).post(`/api/quiz/attempts/${ids.chanUnfinished}/answer`, { optionIndex: 1 });
  await as(chan).post(`/api/quiz/attempts/${ids.chanUnfinished}/pause`);
  // Alice in another chapter, from an old day (should become EXPIRED)
  ids.aliceOld = await play(alice, otherChapterId, () => 1, 3);
  await prisma.quizAttempt.update({ where: { id: ids.aliceOld }, data: { dayKey: "2020-01-01" } });
});

describe("admin: quiz attempts list", () => {
  it("lists every attempt with totals; old unfinished ones show as expired", async () => {
    const res = await as(admin).get("/api/admin/quiz/attempts");
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ attempts: 4, passed: 1, failed: 1, unfinished: 1, expired: 1, passRate: 50 });
    expect(res.body.summary.averageScore).toBe(4); // (8 + 0) / 2
    const alicePass = res.body.attempts.find((a: { id: string }) => a.id === ids.alicePass);
    expect(alicePass).toMatchObject({ status: "PASSED", score: 8, totalQuestions: 10, answered: 10, coinsAwarded: 10 });
    expect(alicePass.user.name).toBe("Alice Saikia");
    expect(alicePass.chapter.subject).toMatchObject({ name: "General Science", classLevel: { name: "Class 9" } });
  });

  it("filters by result, student, class, chapter and day", async () => {
    const q = async (query: string) => (await as(admin).get(`/api/admin/quiz/attempts?${query}`)).body.total;
    expect(await q("status=PASSED")).toBe(1);
    expect(await q("status=UNFINISHED")).toBe(1);
    expect(await q("status=EXPIRED")).toBe(1);
    expect(await q("search=alice")).toBe(2);
    expect(await q(`search=${encodeURIComponent(bob.email)}`)).toBe(1);
    expect(await q(`classId=${await classIdOf(9)}`)).toBe(4);
    expect(await q(`classId=${await classIdOf(10)}`)).toBe(0);
    expect(await q(`chapterId=${otherChapterId}`)).toBe(1);
    expect(await q(`from=${istDayKey()}&to=${istDayKey()}`)).toBe(3);
    expect((await as(admin).get("/api/admin/quiz/attempts?from=yesterday")).status).toBe(400);
  });

  it("is admin-only", async () => {
    expect((await as(alice).get("/api/admin/quiz/attempts")).status).toBe(403);
    expect((await as(alice).get(`/api/admin/quiz/attempts/${ids.bobFail}`)).status).toBe(403);
    expect((await as(alice).get("/api/admin/quiz/stats")).status).toBe(403);
  });
});

describe("admin: one attempt, question by question", () => {
  it("shows each question with the student's choice and the right answer", async () => {
    const res = await as(admin).get(`/api/admin/quiz/attempts/${ids.alicePass}`);
    expect(res.body.attempt).toMatchObject({ status: "PASSED", score: 8, totalQuestions: 10 });
    expect(res.body.items).toHaveLength(10);
    expect(res.body.items.slice(0, 8).every((i: { outcome: string; chosenIndex: number }) => i.outcome === "CORRECT" && i.chosenIndex === 1)).toBe(true);
    expect(res.body.items[9]).toMatchObject({ outcome: "WRONG", chosenIndex: 0 });
    expect(res.body.items[9].question).toMatchObject({ correctIndex: 1, options: ["wrong A", "right", "wrong C"] });
    expect(res.body.attempt).not.toHaveProperty("questionDeadline");
  });

  it("marks timed-out and not-reached questions in an unfinished quiz", async () => {
    const res = await as(admin).get(`/api/admin/quiz/attempts/${ids.chanUnfinished}`);
    expect(res.body.attempt.status).toBe("PAUSED");
    expect(res.body.items.map((i: { outcome: string }) => i.outcome)).toEqual([
      "CORRECT",
      "CORRECT",
      "TIMED_OUT",
      ...Array(7).fill("NOT_REACHED"),
    ]);
  });

  it("still opens if a question was deleted afterwards", async () => {
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: ids.bobFail } });
    const firstId = (attempt.questionIds as string[])[0];
    const backup = await prisma.question.findUniqueOrThrow({ where: { id: firstId } });
    await prisma.question.delete({ where: { id: firstId } });
    try {
      const res = await as(admin).get(`/api/admin/quiz/attempts/${ids.bobFail}`);
      expect(res.status).toBe(200);
      expect(res.body.items[0]).toMatchObject({ question: null, outcome: "WRONG", chosenIndex: 0 });
    } finally {
      await prisma.question.create({ data: { ...backup, options: backup.options ?? undefined } });
    }
  });

  it("404s for an unknown attempt", async () => {
    expect((await as(admin).get("/api/admin/quiz/attempts/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("admin: quiz stats", () => {
  it("gives per-chapter attempts, pass rate and average score", async () => {
    const res = await as(admin).get(`/api/admin/quiz/stats?classId=${await classIdOf(9)}`);
    const row = res.body.chapters.find((c: { chapter: { id: string } }) => c.chapter.id === chapterId);
    expect(row).toMatchObject({ attempts: 3, passed: 1, failed: 1, passRate: 50, averageScore: 4 });
    expect(res.body.questions).toBeNull();
  });

  it("for one chapter, ranks questions hardest first and shows the most-picked wrong option", async () => {
    const res = await as(admin).get(`/api/admin/quiz/stats?chapterId=${chapterId}`);
    const qs = res.body.questions as { asked: number; correct: number; timedOut: number; accuracy: number | null; mostPickedWrong: { index: number; count: number } | null }[];
    expect(qs).toHaveLength(10);
    // Alice + Bob saw all 10; Chan saw 3 (2 correct, 1 timed out)
    const totalAsked = qs.reduce((n, q) => n + q.asked, 0);
    expect(totalAsked).toBe(10 + 10 + 3);
    expect(qs.reduce((n, q) => n + q.timedOut, 0)).toBe(1);
    // Sorted by accuracy ascending
    const acc = qs.map((q) => q.accuracy ?? 101);
    expect([...acc].sort((a, b) => a - b)).toEqual(acc);
    // Bob always chose "wrong A" (index 0) → it's the most-picked wrong option
    expect(qs.every((q) => q.mostPickedWrong === null || q.mostPickedWrong.index === 0)).toBe(true);
    expect(qs.some((q) => q.mostPickedWrong?.index === 0)).toBe(true);
  });
});
