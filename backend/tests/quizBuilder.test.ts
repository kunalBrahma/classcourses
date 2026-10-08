import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { api, classIdOf, createUserAndLogin } from "./helpers";

type Who = { auth: string };
const as = (who: Who) => ({
  get: (path: string) => api().get(path).set("Authorization", who.auth),
  post: (path: string, body: object = {}) => api().post(path).set("Authorization", who.auth).send(body),
  patch: (path: string, body: object = {}) => api().patch(path).set("Authorization", who.auth).send(body),
  del: (path: string) => api().delete(path).set("Authorization", who.auth),
});

let admin: Who;
let mediumId: string;
let class9: string;
let sciA: string; // Class 9 General Science ch 1 — 12 MCQs (4 easy / 4 medium / 4 hard; 2 hard not quiz-marked)
let sciB: string; // Class 9 General Science ch 2 — no MCQs
let mathA: string; // Class 9 Math ch 1 — 6 medium MCQs
let class8Chapter: string;
const sciQ: string[] = [];

const LEVELS = ["EASY", "MEDIUM", "HARD"] as const;

// Plays a quiz through the student API, answering by option TEXT so it works
// with shuffled options. pick(i) → "right" | "wrong" | null (skip)
const play = async (who: Who, body: object, pick: (i: number) => "right" | "wrong" | null = () => "right") => {
  const start = await as(who).post("/api/quiz/start", body);
  if (start.status >= 300) return { start, finals: null, answers: [] as { body: Record<string, unknown> }[] };
  const id = start.body.attempt.id as string;
  const answers = [];
  let last = start.body.attempt;
  for (let i = 0; i < start.body.attempt.total; i += 1) {
    const next = await as(who).post(`/api/quiz/attempts/${id}/next`);
    const options = next.body.attempt.question.options as string[];
    const want = pick(i);
    const optionIndex = want === null ? null : options.findIndex((o) => (want === "right" ? o.includes("right") : !o.includes("right")));
    const res = await as(who).post(`/api/quiz/attempts/${id}/answer`, { optionIndex });
    answers.push(res);
    last = res.body.attempt;
  }
  return { start, finals: last, answers };
};

const quizBody = (over: Record<string, unknown> = {}) => ({
  title: "Test quiz",
  mediumId,
  classId: class9,
  chapterIds: [sciA],
  pickMode: "RANDOM",
  ...over,
});

beforeAll(async () => {
  await seedCatalog();
  admin = await createUserAndLogin("ADMIN");
  const en = await prisma.medium.findUniqueOrThrow({ where: { slug: "english-medium" } });
  mediumId = en.id;
  class9 = await classIdOf(9);
  const chaptersOf = (slug: string, classNumber = 9) =>
    prisma.chapter.findMany({
      where: { subject: { slug, mediumId, classLevel: { slug: `class-${classNumber}` } } },
      orderBy: { order: "asc" },
      take: 2,
    });
  [sciA, sciB] = (await chaptersOf("general-science")).map((c) => c.id);
  [mathA] = (await chaptersOf("math")).map((c) => c.id);
  [class8Chapter] = (await chaptersOf("math", 8)).map((c) => c.id);

  for (let i = 0; i < 12; i += 1) {
    const q = await prisma.question.create({
      data: {
        chapterId: sciA,
        kind: "MCQ",
        source: i < 6 ? "TEXTBOOK" : "EXTRA",
        question: `<p>Science ${i}</p>`,
        options: ["wrong A", "right", "wrong C", "wrong D"],
        correctIndex: 1,
        difficulty: LEVELS[Math.floor(i / 4)],
        useInQuiz: i < 10,
        order: i,
      },
    });
    sciQ.push(q.id);
  }
  await prisma.question.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      chapterId: mathA,
      kind: "MCQ" as const,
      source: "EXTRA" as const,
      question: `<p>Math ${i}</p>`,
      options: ["right", "wrong B", "wrong C"],
      correctIndex: 0,
      difficulty: "MEDIUM" as const,
      order: i,
    })),
  });
});

describe("Use in quiz (automatic chapter quizzes)", () => {
  it("only draws quiz-marked MCQs and needs enough of them", async () => {
    const s = await createUserAndLogin();
    const { start, finals } = await play(s, { chapterId: sciA });
    expect(start.status).toBe(201);
    expect(finals.status).toBe("PASSED");
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: start.body.attempt.id } });
    expect((attempt.questionIds as string[]).sort()).toEqual(sciQ.slice(0, 10).sort());

    // Unmark one → 9 quiz MCQs < 10 → not ready
    const flag = await as(admin).post(`/api/admin/chapters/${sciA}/questions/quiz-flag`, { ids: [sciQ[0]], useInQuiz: false });
    expect(flag.body.updated).toBe(1);
    const overview = await as(admin).get(`/api/admin/chapters/${sciA}/quiz-overview`);
    expect(overview.body.auto).toMatchObject({ enabled: true, quizMarked: 9, readiness: { ready: false } });
    expect(overview.body.auto.readiness.problems[0]).toBe("Only 9 matching questions — needs 10.");
    const s2 = await createUserAndLogin();
    expect((await as(s2).post("/api/quiz/start", { chapterId: sciA })).status).toBe(400);
    await as(admin).post(`/api/admin/chapters/${sciA}/questions/quiz-flag`, { ids: [sciQ[0]], useInQuiz: true });
  });

  it("can be switched off per chapter and site-wide", async () => {
    const s = await createUserAndLogin();
    await as(admin).patch(`/api/admin/chapters/${sciA}`, { autoQuiz: false });
    expect((await as(s).post("/api/quiz/start", { chapterId: sciA })).status).toBe(404);
    expect((await api().get(`/api/catalog/quizzes?chapterId=${sciA}`)).body.quizzes).toEqual([]);
    await as(admin).patch(`/api/admin/chapters/${sciA}`, { autoQuiz: true });

    await api().put("/api/admin/settings/quiz").set("Authorization", admin.auth).send({ autoChapterQuizzes: false });
    expect((await as(s).post("/api/quiz/start", { chapterId: sciA })).status).toBe(404);
    await api().put("/api/admin/settings/quiz").set("Authorization", admin.auth).send({ autoChapterQuizzes: true });

    const listed = await api().get(`/api/catalog/quizzes?chapterId=${sciA}`);
    expect(listed.body.quizzes).toEqual([expect.objectContaining({ id: "auto", kind: "CHAPTER", questions: 10, secondsPerQuestion: 10, passMark: 7 })]);
  });

  it("question form and import carry the flag", async () => {
    const created = await as(admin).post(`/api/admin/chapters/${sciB}/questions`, {
      kind: "MCQ",
      question: "<p>Q</p>",
      options: ["a", "b"],
      correctIndex: 0,
      useInQuiz: false,
    });
    expect(created.body.question.useInQuiz).toBe(false);
    const updated = await as(admin).patch(`/api/admin/questions/${created.body.question.id}`, { question: "<p>Q2</p>" });
    expect(updated.body.question.useInQuiz).toBe(false);
    await prisma.question.delete({ where: { id: created.body.question.id } });

    const csv = "question,option_a,option_b,correct,quiz\nOne,a,b,A,no\nTwo,a,b,B,\nThree,a,b,A,maybe";
    const res = await as(admin).post(`/api/admin/chapters/${sciB}/questions/import`, { format: "csv", data: csv });
    expect(res.body.rows[0].preview.useInQuiz).toBe(false);
    expect(res.body.rows[1].preview.useInQuiz).toBe(true);
    expect(res.body.rows[2].errors).toContain('Unknown quiz value "maybe" (use yes or no)');
  });
});

describe("Custom quizzes", () => {
  let multiId: string;

  it("validates input and refuses to publish a quiz that isn't ready", async () => {
    expect((await as(admin).post("/api/admin/quizzes", quizBody({ title: "" }))).status).toBe(400);
    const otherClass = await as(admin).post("/api/admin/quizzes", quizBody({ chapterIds: [sciA, class8Chapter] }));
    expect(otherClass.status).toBe(400);
    expect(otherClass.body.error).toBe("All chapters must be from the chosen medium and class.");

    const tooBig = await as(admin).post("/api/admin/quizzes", quizBody({ questionCount: 30, isPublished: true }));
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatch(/Fix this before publishing: Only 10 matching questions — needs 30/);

    const window = await as(admin).post(
      "/api/admin/quizzes",
      quizBody({ availableFrom: "2030-01-02T00:00:00Z", availableUntil: "2030-01-01T00:00:00Z" })
    );
    expect(window.body.error).toBe("The closing time must be after the opening time.");

    const draft = await as(admin).post("/api/admin/quizzes", quizBody({ questionCount: 30 }));
    expect(draft.status).toBe(201);
    expect(draft.body.quiz).toMatchObject({ status: "DRAFT", readiness: { ready: false }, placement: { level: "CHAPTER" } });
    await as(admin).del(`/api/admin/quizzes/${draft.body.quiz.id}`);
  });

  it("random multi-subject quiz: filters, live counts, class-page placement, own coins", async () => {
    const body = quizBody({
      title: "Class 9 mixed test",
      chapterIds: [sciA, mathA],
      questionCount: 6,
      difficulties: ["MEDIUM"],
      coinsPerPass: 25,
      secondsPerQuestion: 20,
    });
    const pool = await as(admin).post("/api/admin/quizzes/pool", body);
    expect(pool.body.counts).toMatchObject({ published: 18, quizMarked: 16, matching: 10 });
    expect(pool.body.rules).toEqual({ count: 6, secondsPerQuestion: 20, passMark: 5, coinsPerPass: 25 });
    expect(pool.body.readiness.ready).toBe(true);

    const created = await as(admin).post("/api/admin/quizzes", { ...body, isPublished: true });
    expect(created.status).toBe(201);
    expect(created.body.quiz).toMatchObject({ status: "LIVE", subjectId: null, chapterId: null, placement: { level: "CLASS" } });
    multiId = created.body.quiz.id;

    const onClass = await api().get(`/api/catalog/quizzes?mediumId=${mediumId}&classSlug=class-9`);
    expect(onClass.body.quizzes.map((q: { title: string }) => q.title)).toEqual(["Class 9 mixed test"]);
    expect((await api().get(`/api/catalog/quizzes?chapterId=${sciA}`)).body.quizzes.map((q: { id: string }) => q.id)).toEqual(["auto"]);

    const s = await createUserAndLogin();
    const first = await play(s, { quizId: multiId });
    expect(first.finals).toMatchObject({ status: "PASSED", score: 6, coinsAwarded: 25, secondsPerQuestion: 20, title: "Class 9 mixed test", chapter: null });
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: first.start.body.attempt.id } });
    const asked = await prisma.question.findMany({ where: { id: { in: attempt.questionIds as string[] } } });
    expect(asked.every((q) => q.difficulty === "MEDIUM")).toBe(true);

    // First pass per QUIZ earns coins; the second pass of the same quiz doesn't.
    const second = await play(s, { quizId: multiId });
    expect(second.finals.coinsAwarded).toBe(0);
  });

  it("difficulty mix is honoured and checked", async () => {
    const short = await as(admin).post("/api/admin/quizzes/pool", quizBody({ difficultyMix: { EASY: 2, MEDIUM: 2, HARD: 3 } }));
    expect(short.body.rules.count).toBe(7);
    expect(short.body.readiness.problems).toContain("The mix asks for 3 hard but only 2 matching hard questions exist.");

    const mismatch = await as(admin).post("/api/admin/quizzes/pool", quizBody({ questionCount: 5, difficultyMix: { EASY: 2, MEDIUM: 2, HARD: 2 } }));
    expect(mismatch.body.readiness.problems).toContain("The easy/medium/hard mix adds up to 6, but the quiz has 5 questions.");

    const preview = await as(admin).post("/api/admin/quizzes/preview", quizBody({ difficultyMix: { EASY: 3, MEDIUM: 2, HARD: 1 } }));
    const levels = preview.body.questions.map((q: { difficulty: string }) => q.difficulty);
    expect(levels.filter((l: string) => l === "EASY")).toHaveLength(3);
    expect(levels.filter((l: string) => l === "MEDIUM")).toHaveLength(2);
    expect(levels.filter((l: string) => l === "HARD")).toHaveLength(1);
  });

  it("hand-picked quiz keeps its order, shuffles options, and reveals answers only at the end", async () => {
    const picked = [sciQ[3], sciQ[0], sciQ[11], sciQ[5]]; // includes a non-quiz-marked one: hand-picking ignores the flag
    const created = await as(admin).post(
      "/api/admin/quizzes",
      quizBody({
        title: "Picked",
        pickMode: "FIXED",
        questionIds: picked,
        shuffleQuestions: false,
        shuffleOptions: true,
        answerReveal: "AT_END",
        isPublished: true,
      })
    );
    expect(created.status).toBe(201);
    expect(created.body.quiz.rules).toMatchObject({ count: 4, passMark: 3 });
    const quizId = created.body.quiz.id;

    const s = await createUserAndLogin();
    const run = await play(s, { quizId }, (i) => (i === 2 ? "wrong" : "right"));
    for (const a of run.answers) {
      expect(a.body).toMatchObject({ correct: null, correctIndex: null, explanation: null });
      if (a.body.attempt.status === "IN_PROGRESS") expect(a.body.attempt.score).toBeNull();
    }
    expect(run.finals).toMatchObject({ status: "PASSED", score: 3, answerReveal: "AT_END" });
    expect(run.finals.review).toHaveLength(4);
    for (const r of run.finals.review) expect(r.options[r.correctIndex]).toContain("right");
    expect(run.finals.review[2]).toMatchObject({ correct: false });

    // Stored in the admin's original order and original option indexes
    const id = run.start.body.attempt.id;
    const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id } });
    expect(attempt.questionIds).toEqual(picked);
    const detail = await as(admin).get(`/api/admin/quiz/attempts/${id}`);
    expect(detail.body.attempt.quizTitle).toBe("Picked");
    expect(detail.body.items.map((i: { chosenIndex: number; outcome: string }) => [i.chosenIndex === 1, i.outcome])).toEqual([
      [true, "CORRECT"],
      [true, "CORRECT"],
      [false, "WRONG"],
      [true, "CORRECT"],
    ]);
  });

  it("NEVER hides answers and the review; max attempts and schedule are enforced", async () => {
    const created = await as(admin).post(
      "/api/admin/quizzes",
      quizBody({ title: "Strict", questionCount: 3, answerReveal: "NEVER", maxAttemptsPerStudent: 1, isPublished: true })
    );
    const quizId = created.body.quiz.id;
    const s = await createUserAndLogin();
    const run = await play(s, { quizId });
    expect(run.finals.review).toBeNull();
    expect(run.finals.status).toBe("PASSED");
    const again = await as(s).post("/api/quiz/start", { quizId });
    expect(again.status).toBe(403);
    expect(again.body.error).toBe("You've used all 1 attempts for this quiz.");

    const future = new Date(Date.now() + 86_400_000).toISOString();
    await as(admin).patch(`/api/admin/quizzes/${quizId}`, { availableFrom: future, maxAttemptsPerStudent: null });
    expect((await as(s).post("/api/quiz/start", { quizId })).body.error).toBe("This quiz hasn't opened yet.");
    const listed = (await api().get(`/api/catalog/quizzes?chapterId=${sciA}`)).body.quizzes;
    expect(listed.find((q: { id: string }) => q.id === quizId)).toMatchObject({ status: "SCHEDULED", opensAt: future });

    const past = new Date(Date.now() - 60_000).toISOString();
    await as(admin).patch(`/api/admin/quizzes/${quizId}`, { availableFrom: null, availableUntil: past });
    expect((await as(s).post("/api/quiz/start", { quizId })).body.error).toBe("This quiz has closed.");
    const list = await as(admin).get("/api/admin/quizzes?status=CLOSED");
    expect(list.body.quizzes.map((q: { id: string }) => q.id)).toContain(quizId);
    expect(list.body.counts.CLOSED).toBeGreaterThanOrEqual(1);

    // Unpublished quizzes can't be started at all
    await as(admin).patch(`/api/admin/quizzes/${quizId}`, { availableUntil: null, isPublished: false });
    expect((await as(s).post("/api/quiz/start", { quizId })).status).toBe(404);
  });

  it("reports include custom quizzes; duplicate and delete keep history", async () => {
    const byQuiz = await as(admin).get(`/api/admin/quiz/attempts?quizId=${multiId}`);
    expect(byQuiz.body.total).toBe(2);
    expect(byQuiz.body.attempts[0].quiz.title).toBe("Class 9 mixed test");

    // Scope filter by subject finds the multi-subject quiz through its chapters
    const math = await prisma.chapter.findUniqueOrThrow({ where: { id: mathA }, select: { subjectId: true } });
    const bySubject = await as(admin).get(`/api/admin/quiz/attempts?subjectId=${math.subjectId}`);
    expect(bySubject.body.attempts.some((a: { quiz: { id: string } | null }) => a.quiz?.id === multiId)).toBe(true);

    const stats = await as(admin).get(`/api/admin/quiz/stats?mediumId=${mediumId}&classId=${class9}`);
    expect(stats.body.quizzes.find((q: { quiz: { id: string } }) => q.quiz.id === multiId)).toMatchObject({ attempts: 2, passRate: 100 });

    const copy = await as(admin).post(`/api/admin/quizzes/${multiId}/duplicate`);
    expect(copy.body.quiz).toMatchObject({ title: "Class 9 mixed test (copy)", isPublished: false, chapterIds: expect.arrayContaining([sciA, mathA]) });

    await as(admin).del(`/api/admin/quizzes/${multiId}`);
    const kept = await prisma.quizAttempt.findMany({ where: { quizTitle: "Class 9 mixed test" } });
    expect(kept).toHaveLength(2);
    expect(kept.every((a) => a.quizId === null)).toBe(true);
    await as(admin).del(`/api/admin/quizzes/${copy.body.quiz.id}`);
  });

  it("hand-pick list returns the chapters' MCQs with their flags", async () => {
    const res = await as(admin).get(`/api/admin/quiz-questions?chapterIds=${sciA},${mathA}&q=science 1`);
    expect(res.body.questions.map((q: { question: string }) => q.question)).toEqual(["<p>Science 1</p>", "<p>Science 10</p>", "<p>Science 11</p>"]);
    expect(res.body.questions[2].useInQuiz).toBe(false);
  });
});
