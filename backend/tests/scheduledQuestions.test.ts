import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { autoPool } from "../src/services/quizBuilder.service";
import { refreshDueScheduledContent } from "../src/services/scheduledRefresh.service";
import { api, createUserAndLogin } from "./helpers";

// Scheduled publishing for chapter questions (27 Nov 2026): a published
// question with a future publishAt stays hidden everywhere students look
// (chapter page, practice check, quizzes, counts) until its time.
// Time is simulated by editing publishAt, as elsewhere in the tests.

const CHAPTER_URL = "/api/catalog/mediums/english-medium/classes/9/subjects/english/chapters/chapter-1";
let admin: string;
let chapterId: string;

const later = () => new Date(Date.now() + 2 * 3_600_000).toISOString();
const post = (path: string, body: object) => api().post(path).set("Authorization", admin).send(body);
const patch = (path: string, body: object) => api().patch(path).set("Authorization", admin).send(body);
const publicMcqs = async () => (await api().get(CHAPTER_URL)).body.content.extra.mcq.map((q: { id: string }) => q.id) as string[];
const publicQa = async () => (await api().get(CHAPTER_URL)).body.content.textbook.qa.map((q: { id: string }) => q.id) as string[];

beforeAll(async () => {
  await seedCatalog();
  admin = (await createUserAndLogin("ADMIN")).auth;
  const subject = await prisma.subject.findFirstOrThrow({ where: { slug: "english", medium: { slug: "english-medium" }, classLevel: { slug: "class-9" } } });
  chapterId = (await prisma.chapter.findFirstOrThrow({ where: { subjectId: subject.id, slug: "chapter-1" } })).id;
});

describe("scheduled questions", () => {
  it("a scheduled MCQ is hidden from the page, the answer check and quizzes until its time", async () => {
    const res = await post(`/api/admin/chapters/${chapterId}/questions`, {
      kind: "MCQ",
      source: "EXTRA",
      question: "Scheduled MCQ",
      options: ["A", "B"],
      correctIndex: 1,
      publishAt: later(),
    });
    expect(res.status).toBe(201);
    const id = res.body.question.id as string;
    expect(res.body.question.isPublished).toBe(true);
    expect(new Date(res.body.question.publishAt).getTime()).toBeGreaterThan(Date.now());

    expect(await publicMcqs()).not.toContain(id);
    expect((await api().post(`/api/catalog/questions/${id}/check`).send({ optionIndex: 1 })).status).toBe(404);
    expect((await autoPool(chapterId)).map((q) => q.id)).not.toContain(id);

    // Its time comes
    await prisma.question.update({ where: { id }, data: { publishAt: new Date(Date.now() - 1000) } });
    expect(await publicMcqs()).toContain(id);
    expect((await api().post(`/api/catalog/questions/${id}/check`).send({ optionIndex: 1 })).body.correct).toBe(true);
    expect((await autoPool(chapterId)).map((q) => q.id)).toContain(id);
  });

  it("the admin can schedule, move and clear the time of an existing question", async () => {
    const made = await post(`/api/admin/chapters/${chapterId}/questions`, { kind: "QA", question: "Scheduled QA", answer: "Yes" });
    const id = made.body.question.id as string;
    expect(made.body.question.publishAt).toBeNull();
    expect(await publicQa()).toContain(id);

    const scheduled = await patch(`/api/admin/questions/${id}`, { publishAt: later() });
    expect(scheduled.status).toBe(200);
    expect(await publicQa()).not.toContain(id);

    // An edit that doesn't mention the time keeps it
    await patch(`/api/admin/questions/${id}`, { answer: "Still yes" });
    expect((await prisma.question.findUniqueOrThrow({ where: { id } })).publishAt).not.toBeNull();

    // "Publish now" clears it
    expect((await patch(`/api/admin/questions/${id}`, { publishAt: null })).body.question.publishAt).toBeNull();
    expect(await publicQa()).toContain(id);

    // A draft with a time stays hidden after the time too: the switch wins
    await patch(`/api/admin/questions/${id}`, { isPublished: false, publishAt: new Date(Date.now() - 1000).toISOString() });
    expect(await publicQa()).not.toContain(id);

    expect((await patch(`/api/admin/questions/${id}`, { publishAt: "tomorrow" })).status).toBe(400);
  });

  it("the site is told to refresh once a scheduled question's time has passed", async () => {
    await refreshDueScheduledContent(); // start a fresh window
    const q = await prisma.question.create({
      data: { chapterId, kind: "QA", question: "Due soon", answer: "Ok", publishAt: new Date(Date.now() + 60_000) },
    });
    expect((await refreshDueScheduledContent()).tags).toEqual([]);
    expect(await refreshDueScheduledContent(new Date(Date.now() + 120_000))).toMatchObject({ questions: 1, tags: ["catalog"] });
    // Counted once: the next window starts after it
    expect((await refreshDueScheduledContent(new Date(Date.now() + 180_000))).tags).toEqual([]);
    await prisma.question.delete({ where: { id: q.id } });
  });
});
