import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { clearSettingsCache } from "../src/services/settings.service";
import { istDayEnd, istDayKey } from "../src/utils/istDate";
import { api, createUserAndLogin } from "./helpers";

let admin: { auth: string; email: string };
let student: { auth: string; email: string };
let chapters: string[]; // English Medium Class 8 Math chapters

beforeAll(async () => {
  await seedCatalog();
  admin = await createUserAndLogin("ADMIN");
  student = await createUserAndLogin("STUDENT");
  const math = await prisma.subject.findFirstOrThrow({
    where: { slug: "math", medium: { slug: "english-medium" }, classLevel: { slug: "class-8" } },
    include: { chapters: { orderBy: { order: "asc" } } },
  });
  chapters = math.chapters.map((c) => c.id);
  // 12 MCQs (correct answer = option index 1) in the first 8 chapters; chapter 9 gets only 5.
  for (const [i, chapterId] of chapters.slice(0, 9).entries()) {
    const count = i === 8 ? 5 : 12;
    await prisma.question.createMany({
      data: Array.from({ length: count }, (_, n) => ({
        chapterId,
        kind: "MCQ" as const,
        source: "EXTRA" as const,
        question: `Ch${i} Q${n}`,
        options: ["wrong", "right", "nope"],
        correctIndex: 1,
        explanation: `Because ${n}`,
        order: n,
      })),
    });
  }
});

beforeEach(async () => {
  // Default quiz/coin rules for each test; no attempts carried over.
  await prisma.coinTransaction.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.user.updateMany({ data: { coins: 0 } });
  await prisma.setting.deleteMany({ where: { key: { in: ["quiz", "coins"] } } });
  clearSettingsCache();
});

const as = (who: { auth: string }) => ({
  get: (path: string) => api().get(path).set("Authorization", who.auth),
  post: (path: string, body: object = {}) => api().post(path).set("Authorization", who.auth).send(body),
});

const start = (chapterId = chapters[0], who = student) => as(who).post("/api/quiz/start", { chapterId });
const next = (id: string, who = student) => as(who).post(`/api/quiz/attempts/${id}/next`);
const answer = (id: string, optionIndex: number | null, who = student) =>
  as(who).post(`/api/quiz/attempts/${id}/answer`, { optionIndex });

// Plays a whole quiz, answering the first `correctCount` questions correctly.
const play = async (chapterId: string, correctCount: number, who = student) => {
  const { body } = await start(chapterId, who);
  const id = body.attempt.id;
  let last;
  for (let i = 0; i < body.attempt.total; i += 1) {
    await next(id, who);
    last = await answer(id, i < correctCount ? 1 : 0, who);
  }
  return last!.body;
};

describe("IST day helpers", () => {
  it("rolls over at midnight India time, not UTC", () => {
    expect(istDayKey(new Date("2026-09-30T18:29:59Z"))).toBe("2026-09-30");
    expect(istDayKey(new Date("2026-09-30T18:30:00Z"))).toBe("2026-10-01");
    expect(istDayEnd("2026-09-30").toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });
});

describe("starting a quiz", () => {
  it("requires login", async () => {
    expect((await api().post("/api/quiz/start").send({ chapterId: chapters[0] })).status).toBe(401);
  });

  it("shows the rules and today's usage", async () => {
    const res = await as(student).get("/api/quiz");
    expect(res.body.rules).toMatchObject({ questionsPerQuiz: 10, secondsPerQuestion: 10, passMark: 7, dailyLimit: 10, coinsPerPass: 10 });
    expect(res.body.today).toMatchObject({ used: 0, remaining: 10 });
  });

  it("needs enough published MCQs", async () => {
    const res = await start(chapters[8]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't ready yet/);
  });

  it("404s for unpublished chapters", async () => {
    await prisma.chapter.update({ where: { id: chapters[1] }, data: { isPublished: false } });
    expect((await start(chapters[1])).status).toBe(404);
    await prisma.chapter.update({ where: { id: chapters[1] }, data: { isPublished: true } });
  });

  it("creates an attempt with 10 random questions and nothing revealed", async () => {
    const res = await start();
    expect(res.status).toBe(201);
    expect(res.body.attempt).toMatchObject({ status: "IN_PROGRESS", total: 10, currentIndex: 0, question: null, passMark: 7 });
    expect(res.body.attempt.resumableUntil).toBe(istDayEnd(istDayKey()).toISOString());
    const stored = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: res.body.attempt.id } });
    expect(new Set(stored.questionIds as string[]).size).toBe(10);
  });

  it("starting the same chapter again today resumes the unfinished attempt", async () => {
    const first = await start();
    const again = await start();
    expect(again.status).toBe(200);
    expect(again.body.resumed).toBe(true);
    expect(again.body.attempt.id).toBe(first.body.attempt.id);
  });
});

describe("answering", () => {
  it("reveals a question without its answer, and doesn't restart the clock on refresh", async () => {
    const { body } = await start();
    const first = await next(body.attempt.id);
    const q = first.body.attempt.question;
    expect(q.options).toEqual(["wrong", "right", "nope"]);
    expect(q.remainingMs).toBeGreaterThan(8000);
    expect(JSON.stringify(first.body)).not.toMatch(/correctIndex|explanation|Because/);
    expect(q).not.toHaveProperty("id");

    const again = await next(body.attempt.id);
    expect(again.body.attempt.question.deadline).toBe(q.deadline);
  });

  it("returns the correct answer and explanation only after answering", async () => {
    const { body } = await start();
    await next(body.attempt.id);
    const res = await answer(body.attempt.id, 1);
    expect(res.body).toMatchObject({ correct: true, timedOut: false, correctIndex: 1 });
    expect(res.body.explanation).toMatch(/Because/);
    expect(res.body.attempt).toMatchObject({ answered: 1, score: 1, currentIndex: 1, question: null });

    // No question open now → can't answer again
    expect((await answer(body.attempt.id, 1)).status).toBe(409);
  });

  it("an answer after the deadline counts as wrong, even if right", async () => {
    const { body } = await start();
    await next(body.attempt.id);
    await prisma.quizAttempt.update({
      where: { id: body.attempt.id },
      data: { questionDeadline: new Date(Date.now() - 5000) },
    });
    const res = await answer(body.attempt.id, 1);
    expect(res.body).toMatchObject({ correct: false, timedOut: true });
    expect(res.body.attempt.score).toBe(0);
  });

  it("a question that ran out while away is counted wrong and the quiz moves on", async () => {
    const { body } = await start();
    await next(body.attempt.id);
    await prisma.quizAttempt.update({
      where: { id: body.attempt.id },
      data: { questionDeadline: new Date(Date.now() - 60_000) },
    });
    const res = await next(body.attempt.id);
    expect(res.body.attempt).toMatchObject({ currentIndex: 1, answered: 1, score: 0 });
    expect(res.body.attempt.question.index).toBe(1);
  });

  it("double-submitting the same question only counts once", async () => {
    const { body } = await start();
    await next(body.attempt.id);
    const results = await Promise.all([answer(body.attempt.id, 1), answer(body.attempt.id, 1)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: body.attempt.id } });
    expect(stored.score).toBe(1);
    expect((stored.answers as unknown[]).length).toBe(1);
  });

  it("rejects an option that doesn't exist", async () => {
    const { body } = await start();
    await next(body.attempt.id);
    expect((await answer(body.attempt.id, 5)).status).toBe(400);
  });

  it("a question deleted mid-quiz is counted in the student's favour", async () => {
    const { body } = await start(chapters[2]);
    const stored = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: body.attempt.id } });
    await prisma.question.delete({ where: { id: (stored.questionIds as string[])[0] } });
    const res = await next(body.attempt.id);
    expect(res.body.attempt).toMatchObject({ currentIndex: 1, score: 1 });
    expect(res.body.attempt.question.index).toBe(1);
  });

  it("uses the settings from when the quiz started", async () => {
    const { body } = await start();
    await api().put("/api/admin/settings/quiz").set("Authorization", admin.auth).send({ secondsPerQuestion: 60 });
    const res = await next(body.attempt.id);
    expect(res.body.attempt.secondsPerQuestion).toBe(10);
    expect(res.body.attempt.question.remainingMs).toBeLessThanOrEqual(10_000);
  });

  it("other students can't see or answer your quiz", async () => {
    const { body } = await start();
    const other = await createUserAndLogin("STUDENT");
    expect((await as(other).get(`/api/quiz/attempts/${body.attempt.id}`)).status).toBe(404);
    expect((await next(body.attempt.id, other)).status).toBe(404);
  });
});

describe("pause & resume", () => {
  it("pausing between questions costs nothing", async () => {
    const { body } = await start();
    const res = await as(student).post(`/api/quiz/attempts/${body.attempt.id}/pause`);
    expect(res.body).toMatchObject({ forfeited: false, attempt: { status: "PAUSED", answered: 0 } });
  });

  it("pausing while a question is on screen forfeits it (no pause-and-search)", async () => {
    const { body } = await start();
    await next(body.attempt.id);
    const res = await as(student).post(`/api/quiz/attempts/${body.attempt.id}/pause`);
    expect(res.body).toMatchObject({ forfeited: true, attempt: { status: "PAUSED", answered: 1, score: 0, currentIndex: 1 } });

    // Resuming continues with the NEXT question, on a fresh clock
    const resumed = await next(body.attempt.id);
    expect(resumed.body.attempt).toMatchObject({ status: "IN_PROGRESS", currentIndex: 1 });
    expect(resumed.body.attempt.question.index).toBe(1);
  });

  it("paused quizzes appear in today's list", async () => {
    const { body } = await start();
    await as(student).post(`/api/quiz/attempts/${body.attempt.id}/pause`);
    const res = await as(student).get("/api/quiz/today");
    expect(res.body.attempts[0]).toMatchObject({ id: body.attempt.id, status: "PAUSED", question: null });
    expect(res.body.usage).toMatchObject({ used: 1, remaining: 9 });
  });

  it("unfinished quizzes expire at IST midnight", async () => {
    const { body } = await start();
    await as(student).post(`/api/quiz/attempts/${body.attempt.id}/pause`);
    await prisma.quizAttempt.update({ where: { id: body.attempt.id }, data: { dayKey: "2020-01-01" } });

    const res = await next(body.attempt.id);
    expect(res.status).toBe(410);
    const shown = await as(student).get(`/api/quiz/attempts/${body.attempt.id}`);
    expect(shown.body.attempt).toMatchObject({ status: "EXPIRED", resumableUntil: null });

    // ...and starting that chapter again gives a fresh attempt
    const fresh = await start();
    expect(fresh.status).toBe(201);
    expect(fresh.body.attempt.id).not.toBe(body.attempt.id);
  });
});

describe("finishing & coins", () => {
  it("7/10 passes and earns coins, recorded in the ledger", async () => {
    const result = await play(chapters[0], 7);
    expect(result.attempt).toMatchObject({ status: "PASSED", passed: true, score: 7, coinsAwarded: 10, question: null });

    const me = await as(student).get("/api/users/me/coins");
    expect(me.body.balance).toBe(10);
    expect(me.body.transactions[0]).toMatchObject({ delta: 10, balanceAfter: 10, reason: "QUIZ_PASS" });
    expect((await as(student).get("/api/auth/me")).body.user.coins).toBe(10);
  });

  it("6/10 fails and earns nothing", async () => {
    const result = await play(chapters[0], 6);
    expect(result.attempt).toMatchObject({ status: "FAILED", passed: false, coinsAwarded: 0 });
    expect((await as(student).get("/api/users/me/coins")).body.balance).toBe(0);
  });

  it("finished quizzes can't be continued", async () => {
    const result = await play(chapters[0], 10);
    expect((await next(result.attempt.id)).status).toBe(409);
    expect((await as(student).post(`/api/quiz/attempts/${result.attempt.id}/pause`)).status).toBe(409);
  });

  it("default rule: only the first pass of a chapter pays; everyPass pays each time", async () => {
    expect((await play(chapters[0], 10)).attempt.coinsAwarded).toBe(10);
    expect((await play(chapters[0], 10)).attempt.coinsAwarded).toBe(0);
    expect((await play(chapters[1], 10)).attempt.coinsAwarded).toBe(10);

    await api().put("/api/admin/settings/coins").set("Authorization", admin.auth).send({ awardRule: "everyPass", perPass: 25 });
    expect((await play(chapters[0], 10)).attempt.coinsAwarded).toBe(25);
    expect((await as(student).get("/api/users/me/coins")).body.balance).toBe(45);
  });

  it("the daily limit counts quizzes started today", async () => {
    await api().put("/api/admin/settings/quiz").set("Authorization", admin.auth).send({ dailyLimit: 2 });
    expect((await start(chapters[0])).status).toBe(201);
    expect((await start(chapters[1])).status).toBe(201);
    // Resuming an existing one is still allowed...
    expect((await start(chapters[0])).status).toBe(200);
    // ...but a third new quiz is not
    const blocked = await start(chapters[2]);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/today's limit of 2/);
  });

  it("history lists finished attempts", async () => {
    await play(chapters[0], 7);
    const res = await as(student).get("/api/quiz/history");
    expect(res.body.attempts[0]).toMatchObject({ status: "PASSED", chapter: { classLevel: { slug: "class-8" }, subject: { slug: "math" } } });
  });
});

describe("admin: users & coins", () => {
  it("lists and searches users with coins and activity", async () => {
    await play(chapters[0], 7);
    const res = await as(admin).get(`/api/admin/users?search=${encodeURIComponent(student.email)}`);
    expect(res.body.total).toBe(1);
    expect(res.body.users[0]).toMatchObject({ email: student.email, coins: 10, quizAttempts: 1, role: "STUDENT" });

    const detail = await as(admin).get(`/api/admin/users/${res.body.users[0].id}`);
    expect(detail.body.user.coinTxns).toHaveLength(1);
    expect(detail.body.user.quizAttempts[0].status).toBe("PASSED");
  });

  it("adjusts coins with a reason; can't go below zero", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: student.email } });
    const add = await as(admin).post(`/api/admin/users/${user.id}/coins`, { delta: 50, note: "Goodwill credit" });
    expect(add.status).toBe(201);
    expect(add.body.balance).toBe(50);

    const overdraw = await as(admin).post(`/api/admin/users/${user.id}/coins`, { delta: -60, note: "Correction" });
    expect(overdraw.status).toBe(400);
    expect(overdraw.body.error).toMatch(/Not enough coins/);

    expect((await as(admin).post(`/api/admin/users/${user.id}/coins`, { delta: 5 })).status).toBe(400); // needs a note
    const txns = await prisma.coinTransaction.findMany({ where: { userId: user.id } });
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ reason: "ADMIN_ADJUST", note: "Goodwill credit", balanceAfter: 50 });
  });

  it("role changes: not your own, and never remove the last admin", async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } });
    const self = await api().patch(`/api/admin/users/${me.id}`).set("Authorization", admin.auth).send({ role: "STUDENT" });
    expect(self.status).toBe(400);

    const other = await createUserAndLogin("STUDENT");
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: other.email } });
    const promote = await api().patch(`/api/admin/users/${otherUser.id}`).set("Authorization", admin.auth).send({ role: "ADMIN" });
    expect(promote.body.user.role).toBe("ADMIN");
    // Promotion signs them out so the new role applies on next login
    expect(await prisma.refreshToken.count({ where: { userId: otherUser.id } })).toBe(0);
  });

  it("is admin-only", async () => {
    expect((await as(student).get("/api/admin/users")).status).toBe(403);
  });
});
