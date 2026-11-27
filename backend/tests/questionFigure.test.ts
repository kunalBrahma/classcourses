import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { api, createUserAndLogin } from "./helpers";

// Interactive figures (27 Nov 2026): raw HTML/CSS/JS pasted by the admin, kept
// as pasted (never sanitised, never put in the page: the site shows it only in
// a sandboxed, no-network iframe), and sent with the question everywhere a
// student sees it — the chapter page, the open quiz question and the review.

const CHAPTER_URL = "/api/catalog/mediums/english-medium/classes/9/subjects/english/chapters/chapter-1";
const TRIANGLE = `<!DOCTYPE html><html><head><style>.t{border-bottom:140px solid #3498db}</style></head><body><div class="t" id="t"></div><script>document.getElementById("t").onclick=()=>{}</script></body></html>`;

let admin: string;
let student: string;
let chapterId: string;

beforeAll(async () => {
  await seedCatalog();
  admin = (await createUserAndLogin("ADMIN")).auth;
  student = (await createUserAndLogin("STUDENT")).auth;
  const subject = await prisma.subject.findFirstOrThrow({ where: { slug: "english", medium: { slug: "english-medium" }, classLevel: { slug: "class-9" } } });
  chapterId = (await prisma.chapter.findFirstOrThrow({ where: { subjectId: subject.id, slug: "chapter-1" } })).id;
});

const post = (path: string, body: object) => api().post(path).set("Authorization", admin).send(body);
const patch = (path: string, body: object) => api().patch(path).set("Authorization", admin).send(body);

describe("question figures", () => {
  it("are saved exactly as pasted (scripts included), sized, and removable", async () => {
    const res = await post(`/api/admin/chapters/${chapterId}/questions`, {
      kind: "QA",
      question: "<p>Which shape is this?</p><script>alert(1)</script>",
      answer: "A triangle",
      figureHtml: `  ${TRIANGLE}\n`,
      figureHeight: 5000,
      figureAlt: "A blue triangle that turns red when tapped",
    });
    expect(res.status).toBe(201);
    const q = res.body.question;
    expect(q.figureHtml).toBe(TRIANGLE); // trimmed, otherwise untouched
    expect(q.figureHeight).toBe(720); // clamped
    expect(q.question).toBe("<p>Which shape is this?</p>"); // the question text is still sanitised

    // Default height, then removing the figure clears all three fields
    expect((await patch(`/api/admin/questions/${q.id}`, { figureHeight: null })).body.question.figureHeight).toBe(320);
    const removed = (await patch(`/api/admin/questions/${q.id}`, { figureHtml: "  " })).body.question;
    expect(removed).toMatchObject({ figureHtml: null, figureHeight: null, figureAlt: null });
    await prisma.question.delete({ where: { id: q.id } });
  });

  it("refuses a figure that is too big or isn't HTML", async () => {
    const base = { kind: "QA", question: "Q", answer: "A" };
    const big = await post(`/api/admin/chapters/${chapterId}/questions`, { ...base, figureHtml: `<div>${"x".repeat(101 * 1024)}</div>` });
    expect(big.status).toBe(400);
    expect(JSON.stringify(big.body)).toMatch(/too big/);
    const text = await post(`/api/admin/chapters/${chapterId}/questions`, { ...base, figureHtml: "just some words" });
    expect(text.status).toBe(400);
    expect(JSON.stringify(text.body)).toMatch(/must be HTML/);
  });

  it("come with the question on the chapter page", async () => {
    const made = await post(`/api/admin/chapters/${chapterId}/questions`, { kind: "QA", question: "Shape?", answer: "Triangle", figureHtml: TRIANGLE, figureAlt: "Triangle" });
    const qa = (await api().get(CHAPTER_URL)).body.content.textbook.qa.find((x: { id: string }) => x.id === made.body.question.id);
    expect(qa.figure).toEqual({ html: TRIANGLE, height: 320, alt: "Triangle" });
    await prisma.question.delete({ where: { id: made.body.question.id } });
  });

  it("come with the open quiz question (still no id or answer) and in the review", async () => {
    // A chapter with 10 quiz MCQs, all with the figure
    await prisma.question.createMany({
      data: Array.from({ length: 10 }, (_, n) => ({
        chapterId,
        kind: "MCQ" as const,
        source: "EXTRA" as const,
        question: `Figure Q${n}`,
        options: ["wrong", "right"],
        correctIndex: 1,
        order: 100 + n,
        figureHtml: TRIANGLE,
        figureHeight: 240,
        figureAlt: "Triangle",
      })),
    });
    const as = (path: string, body: object = {}) => api().post(path).set("Authorization", student).send(body);
    const started = await as("/api/quiz/start", { chapterId });
    expect(started.status).toBe(201);
    const id = started.body.attempt.id;
    let last;
    for (let i = 0; i < started.body.attempt.total; i++) {
      const open = (await as(`/api/quiz/attempts/${id}/next`)).body.attempt.question;
      if (i === 0) {
        expect(open.figure).toEqual({ html: TRIANGLE, height: 240, alt: "Triangle" });
        expect(open.id).toBeUndefined();
        expect(JSON.stringify(open)).not.toMatch(/correctIndex|explanation/);
      }
      last = await as(`/api/quiz/attempts/${id}/answer`, { optionIndex: 1 });
    }
    const review = last!.body.attempt.review;
    expect(review[0].figure).toEqual({ html: TRIANGLE, height: 240, alt: "Triangle" });
  });
});
