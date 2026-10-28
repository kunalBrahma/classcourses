import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { parseYouTubeId } from "../src/utils/youtube";
import { deleteObject } from "../src/services/storage.service";
import { api, createUserAndLogin, hasR2Env } from "./helpers";

const CHAPTER_URL = "/api/catalog/mediums/english-medium/classes/9/subjects/english/chapters";

let admin: string;
let chapterId: string; // Class 9 English, chapter-1 (English Medium)
let otherChapterId: string; // chapter-2

beforeAll(async () => {
  await seedCatalog();
  admin = (await createUserAndLogin("ADMIN")).auth;
  const subject = await prisma.subject.findFirstOrThrow({
    where: { slug: "english", medium: { slug: "english-medium" }, classLevel: { slug: "class-9" } },
  });
  chapterId = (await prisma.chapter.findFirstOrThrow({ where: { subjectId: subject.id, slug: "chapter-1" } })).id;
  otherChapterId = (await prisma.chapter.findFirstOrThrow({ where: { subjectId: subject.id, slug: "chapter-2" } })).id;
});

const post = (path: string, body: object) => api().post(path).set("Authorization", admin).send(body);
const patch = (path: string, body: object) => api().patch(path).set("Authorization", admin).send(body);

const mcq = (overrides: object = {}) => ({
  kind: "MCQ",
  source: "EXTRA",
  question: "Who wrote this poem?",
  options: ["Tagore", "Keats", "Frost", "Neruda"],
  correctIndex: 2,
  explanation: "<p>Robert <strong>Frost</strong> wrote it.</p>",
  ...overrides,
});

describe("rich text sanitising (XSS boundary)", () => {
  it("strips scripts, event handlers, styles and javascript: links; keeps formatting", async () => {
    const res = await post(`/api/admin/chapters/${chapterId}/questions`, {
      kind: "QA",
      question:
        '<p style="color:red" onclick="steal()">What is H<sub>2</sub>O?</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
      answer: '<p>Water. <a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a></p><svg><script>1</script></svg>',
    });
    expect(res.status).toBe(201);
    try {
      const { question, answer } = res.body.question;
      expect(question).toBe("<p>What is H<sub>2</sub>O?</p>");
      expect(answer).not.toMatch(/javascript|svg|script/);
      expect(answer).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">good</a>');
    } finally {
      await prisma.question.delete({ where: { id: res.body.question.id } });
    }
  });

  it("keeps absolute https images (e.g. uploaded to R2) but drops relative/data ones", async () => {
    const res = await post(`/api/admin/chapters/${chapterId}/questions`, {
      kind: "QA",
      question: '<p>Map:</p><img src="https://pub-x.r2.dev/images/a.png" alt="map" width="300">',
      answer: '<img src="data:image/png;base64,AAAA"><img src="/local.png">Answer',
    });
    try {
      expect(res.body.question.question).toBe('<p>Map:</p><img src="https://pub-x.r2.dev/images/a.png" alt="map" width="300" />');
      expect(res.body.question.answer).toBe("Answer");
    } finally {
      await prisma.question.delete({ where: { id: res.body.question.id } });
    }
  });

  it("chapter About text is sanitised; null clears it", async () => {
    const res = await patch(`/api/admin/chapters/${chapterId}`, {
      aboutHtml: "<h3>About the author</h3><p>Born in 1874.</p><iframe src='https://evil'></iframe>",
    });
    expect(res.body.chapter.aboutHtml).toBe("<h3>About the author</h3><p>Born in 1874.</p>");
    const pub = await api().get(`${CHAPTER_URL}/chapter-1`);
    expect(pub.body.chapter.aboutHtml).toBe("<h3>About the author</h3><p>Born in 1874.</p>");
  });
});

describe("question rules", () => {
  it.each([
    [{ kind: "QA", question: "Q?" }, /needs an answer/],
    [{ kind: "QA", question: "<p> </p>", answer: "A" }, /Question text is empty/],
    [mcq({ options: ["Only one"], correctIndex: 0 }), /between 2 and 6/],
    [mcq({ correctIndex: 5 }), /Mark which option is correct/],
    [mcq({ correctIndex: null }), /Mark which option is correct/],
    [mcq({ options: ["Same", "same", "Other"], correctIndex: 0 }), /different/],
    [mcq({ options: ["A", "<p></p>"], correctIndex: 0 }), /can't be empty/],
    [{ kind: "QA", question: "Q?", answer: "A", options: ["x", "y"] }, /can't have options/],
  ])("rejects %j", async (body, message) => {
    const res = await post(`/api/admin/chapters/${chapterId}/questions`, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  it("switching an MCQ to a QA drops the options instead of failing", async () => {
    const created = await post(`/api/admin/chapters/${chapterId}/questions`, mcq());
    try {
      const res = await patch(`/api/admin/questions/${created.body.question.id}`, { kind: "QA", answer: "Frost" });
      expect(res.status).toBe(200);
      expect(res.body.question).toMatchObject({ kind: "QA", answer: "Frost", options: null, correctIndex: null });
    } finally {
      await prisma.question.delete({ where: { id: created.body.question.id } });
    }
  });
});

describe("public chapter content", () => {
  let mcqId: string;

  beforeAll(async () => {
    await post(`/api/admin/chapters/${chapterId}/questions`, { kind: "QA", question: "Textbook Q1", answer: "A1" });
    await post(`/api/admin/chapters/${chapterId}/questions`, { kind: "QA", question: "Textbook Q2", answer: "A2" });
    await post(`/api/admin/chapters/${chapterId}/questions`, { kind: "QA", source: "EXTRA", question: "Extra Q", answer: "EA" });
    mcqId = (await post(`/api/admin/chapters/${chapterId}/questions`, mcq())).body.question.id;
    await post(`/api/admin/chapters/${chapterId}/questions`, {
      kind: "QA",
      question: "Hidden draft",
      answer: "x",
      isPublished: false,
    });
  });

  it("groups questions into the chapter page sections, in order", async () => {
    const res = await api().get(`${CHAPTER_URL}/chapter-1`);
    const { content } = res.body;
    expect(content.textbook.qa.map((q: { question: string }) => q.question)).toEqual(["Textbook Q1", "Textbook Q2"]);
    expect(content.extra.qa).toHaveLength(1);
    expect(content.extra.mcq).toHaveLength(1);
    expect(content.textbook.mcq).toHaveLength(0);
    expect(JSON.stringify(content)).not.toContain("Hidden draft");
  });

  it("never sends MCQ answers or explanations with the page", async () => {
    const res = await api().get(`${CHAPTER_URL}/chapter-1`);
    const [question] = res.body.content.extra.mcq;
    expect(question.options).toEqual(["Tagore", "Keats", "Frost", "Neruda"]);
    expect(question).not.toHaveProperty("correctIndex");
    expect(question).not.toHaveProperty("explanation");
    expect(JSON.stringify(res.body)).not.toContain("Robert");
  });

  it("reveals one MCQ answer via the check endpoint", async () => {
    const wrong = await api().post(`/api/catalog/questions/${mcqId}/check`).send({ optionIndex: 0 });
    expect(wrong.body).toMatchObject({ correct: false, correctIndex: 2 });
    const right = await api().post(`/api/catalog/questions/${mcqId}/check`).send({ optionIndex: 2 });
    expect(right.body.correct).toBe(true);
    expect(right.body.explanation).toContain("Frost");

    expect((await api().post(`/api/catalog/questions/${mcqId}/check`).send({ optionIndex: 4 })).status).toBe(400);
    expect((await api().post(`/api/catalog/questions/${mcqId}/check`).send({})).status).toBe(400);
  });

  it("check endpoint hides unpublished chapters' questions", async () => {
    await patch(`/api/admin/chapters/${chapterId}`, { isPublished: false });
    expect((await api().post(`/api/catalog/questions/${mcqId}/check`).send({ optionIndex: 0 })).status).toBe(404);
    await patch(`/api/admin/chapters/${chapterId}`, { isPublished: true });
  });

  it("reorders a group and moves a question to another section", async () => {
    const admin1 = await api().get(`/api/admin/chapters/${chapterId}/content`).set("Authorization", admin);
    const textbook = admin1.body.chapter.questions.filter(
      (q: { source: string; kind: string }) => q.source === "TEXTBOOK" && q.kind === "QA"
    );
    const ids = textbook.map((q: { id: string }) => q.id).reverse();
    expect((await api().put(`/api/admin/chapters/${chapterId}/questions/reorder`).set("Authorization", admin).send({ source: "TEXTBOOK", kind: "QA", ids })).status).toBe(200);
    const pub = await api().get(`${CHAPTER_URL}/chapter-1`);
    expect(pub.body.content.textbook.qa[0].question).toBe("Textbook Q2");

    // (the group also holds the unpublished "Hidden draft", so pick by text)
    const q2 = textbook.find((q: { question: string }) => q.question === "Textbook Q2");
    await patch(`/api/admin/questions/${q2.id}`, { source: "EXTRA" });
    const moved = await api().get(`${CHAPTER_URL}/chapter-1`);
    expect(moved.body.content.extra.qa.map((q: { question: string }) => q.question)).toEqual(["Extra Q", "Textbook Q2"]);
  });

  it("deleting a chapter with content needs ?force=true", async () => {
    const res = await api().delete(`/api/admin/chapters/${chapterId}`).set("Authorization", admin);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/question/);
  });
});

describe("bulk import", () => {
  const importUrl = () => `/api/admin/chapters/${otherChapterId}/questions/import`;

  // Excel-style: BOM, Assamese text, a multi-line cell, letters for the answer, mixed kinds
  const goodCsv =
    "﻿Kind,Source,Question,Answer,Option A,Option B,Option C,Option D,Correct,Explanation\n" +
    'qa,textbook,"অসমৰ ৰাজধানী কি?","দিছপুৰ\nগুৱাহাটীত অৱস্থিত",,,,,,\n' +
    "mcq,extra,2 + 2 = ?,,3,4,5,22,B,Basic addition\n" +
    ",extra,Pick the prime,,4,6,7,,C,\n";

  it("dry run previews without writing anything", async () => {
    const res = await post(importUrl(), { format: "csv", data: goodCsv });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.summary).toMatchObject({ total: 3, valid: 3, invalid: 0 });
    expect(res.body.rows[0].preview).toMatchObject({ kind: "QA", source: "TEXTBOOK" });
    expect(res.body.rows[2].preview).toMatchObject({ kind: "MCQ", optionCount: 3 }); // kind inferred from options
    expect(await prisma.question.count({ where: { chapterId: otherChapterId } })).toBe(0);
  });

  it("reports every bad row with spreadsheet row numbers, and writes nothing", async () => {
    const csv =
      "question,answer,option_a,option_b,correct,source\n" +
      "Good one,Yes,,,,\n" +
      "No answer here,,,,,\n" +
      "MCQ missing correct,,x,y,,\n" +
      "Bad source,ok,,,,homework\n";
    const preview = await post(importUrl(), { format: "csv", data: csv });
    expect(preview.body.summary).toMatchObject({ valid: 1, invalid: 3 });
    const bad = preview.body.rows.filter((r: { errors: string[] }) => r.errors.length);
    expect(bad.map((r: { row: number }) => r.row)).toEqual([3, 4, 5]);
    expect(bad[0].errors[0]).toMatch(/needs an answer/);
    expect(bad[1].errors[0]).toMatch(/Mark which option/);
    expect(bad[2].errors[0]).toMatch(/Unknown source "homework"/);

    const commit = await post(importUrl(), { format: "csv", data: csv, dryRun: false });
    expect(commit.status).toBe(400);
    expect(commit.body.error).toMatch(/Nothing was imported/);
    expect(await prisma.question.count({ where: { chapterId: otherChapterId } })).toBe(0);
  });

  it("imports valid CSV, keeping line breaks and Assamese text", async () => {
    const res = await post(importUrl(), { format: "csv", data: goodCsv, dryRun: false });
    expect(res.status).toBe(201);
    expect(res.body.summary.imported).toBe(3);

    const qa = await prisma.question.findFirstOrThrow({ where: { chapterId: otherChapterId, kind: "QA" } });
    expect(qa.question).toBe("অসমৰ ৰাজধানী কি?");
    expect(qa.answer).toBe("দিছপুৰ<br />গুৱাহাটীত অৱস্থিত");
    const sum = await prisma.question.findFirstOrThrow({ where: { chapterId: otherChapterId, question: "2 + 2 = ?" } });
    expect(sum).toMatchObject({ correctIndex: 1, source: "EXTRA" });
  });

  it("append continues each section's order; replace wipes the chapter first", async () => {
    const json = JSON.stringify([
      { kind: "mcq", source: "extra", question: "JSON MCQ", options: ["a", "b"], correctIndex: 0 },
      { question: "JSON QA", answer: "yes" },
    ]);
    await post(importUrl(), { format: "json", data: json, dryRun: false });
    const extraMcq = await prisma.question.findMany({
      where: { chapterId: otherChapterId, source: "EXTRA", kind: "MCQ" },
      orderBy: { order: "asc" },
    });
    expect(extraMcq.map((q) => q.order)).toEqual([0, 1, 2]);
    expect(extraMcq[2].question).toBe("JSON MCQ");

    const preview = await post(importUrl(), { format: "json", data: json, mode: "replace" });
    expect(preview.body.summary).toMatchObject({ existingQuestions: 5, willDelete: 5 });
    await post(importUrl(), { format: "json", data: json, mode: "replace", dryRun: false });
    expect(await prisma.question.count({ where: { chapterId: otherChapterId } })).toBe(2);
  });

  it("rejects malformed input clearly", async () => {
    expect((await post(importUrl(), { format: "json", data: "{not json" })).body.error).toMatch(/Invalid JSON/);
    expect((await post(importUrl(), { format: "json", data: '{"a":1}' })).body.error).toMatch(/array/);
    expect((await post(importUrl(), { format: "csv", data: "foo,bar\n1,2\n" })).body.error).toMatch(/"question" column/);
    const tooMany = "question,answer\n" + "q,a\n".repeat(501);
    expect((await post(importUrl(), { format: "csv", data: tooMany })).body.error).toMatch(/Too many rows/);
  });
});

describe("videos", () => {
  it("parses every common YouTube link form", () => {
    const id = "dQw4w9WgXcQ";
    for (const url of [
      id,
      `https://www.youtube.com/watch?v=${id}&t=42s`,
      `https://youtu.be/${id}?si=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://youtube.com/shorts/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `youtube.com/live/${id}`,
    ]) {
      expect(parseYouTubeId(url), url).toBe(id);
    }
    for (const bad of ["https://vimeo.com/123", "https://youtube.com/watch?v=short", "hello world", ""]) {
      expect(parseYouTubeId(bad), bad).toBeNull();
    }
  });

  it("detects Shorts from the link and lets the admin change the format", async () => {
    const short = await post(`/api/admin/chapters/${chapterId}/videos`, {
      url: "https://youtube.com/shorts/ccccccccccc?feature=share",
      title: "Short",
    });
    expect(short.body.video).toMatchObject({ youtubeId: "ccccccccccc", format: "SHORT" });

    const long = await post(`/api/admin/chapters/${chapterId}/videos`, { url: "https://youtu.be/ddddddddddd", title: "Long" });
    expect(long.body.video.format).toBe("LANDSCAPE");

    // A youtu.be link can't say it's a Short, so the admin can say so.
    const picked = await post(`/api/admin/chapters/${chapterId}/videos`, {
      url: "https://youtu.be/eeeeeeeeeee",
      title: "Picked",
      format: "SHORT",
    });
    expect(picked.body.video.format).toBe("SHORT");
    expect((await post(`/api/admin/chapters/${chapterId}/videos`, { url: "eeeeeeeeeee", title: "x", format: "SQUARE" })).status).toBe(400);

    const patch = (id: string, body: object) => api().patch(`/api/admin/videos/${id}`).set("Authorization", admin).send(body);
    expect((await patch(long.body.video.id, { format: "SHORT" })).body.video.format).toBe("SHORT");
    // Title-only edits keep the format; a new link without a format re-detects it.
    expect((await patch(long.body.video.id, { title: "Renamed" })).body.video.format).toBe("SHORT");
    expect((await patch(long.body.video.id, { url: "https://www.youtube.com/watch?v=fffffffffff" })).body.video).toMatchObject({
      youtubeId: "fffffffffff",
      format: "LANDSCAPE",
    });

    const pub = await api().get(`${CHAPTER_URL}/chapter-1`);
    expect(pub.body.videos.map((v: { format: string }) => v.format)).toEqual(["SHORT", "LANDSCAPE", "SHORT"]);

    for (const v of [short, long, picked]) {
      await api().delete(`/api/admin/videos/${v.body.video.id}`).set("Authorization", admin);
    }
  });

  it("puts chosen videos on the home page, newest first, from visible chapters only", async () => {
    const featured = async () =>
      (await api().get("/api/catalog/videos/featured")).body.videos as { id: string; format: string; chapter: { href: string } }[];
    const a = await post(`/api/admin/chapters/${chapterId}/videos`, { url: "https://youtube.com/shorts/ggggggggggg", title: "Home short", featured: true });
    const b = await post(`/api/admin/chapters/${chapterId}/videos`, { url: "hhhhhhhhhhh", title: "Not on home" });
    expect(a.body.video.featuredAt).not.toBeNull();
    expect(b.body.video.featuredAt).toBeNull();

    let list = await featured();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: a.body.video.id,
      youtubeId: "ggggggggggg",
      format: "SHORT",
      title: "Home short",
      chapter: { number: 1, href: "/english-medium/class-9/english/chapter-1" },
      subject: { name: "English" },
      classLevel: { name: "Class 9" },
    });

    // The most recently featured comes first; editing the title doesn't move it.
    await patch(`/api/admin/videos/${b.body.video.id}`, { featured: true });
    await patch(`/api/admin/videos/${a.body.video.id}`, { title: "Home short (renamed)" });
    expect((await featured()).map((v) => v.id)).toEqual([b.body.video.id, a.body.video.id]);

    // Hidden while the chapter is unpublished.
    await prisma.chapter.update({ where: { id: chapterId }, data: { isPublished: false } });
    expect(await featured()).toEqual([]);
    await prisma.chapter.update({ where: { id: chapterId }, data: { isPublished: true } });

    await patch(`/api/admin/videos/${b.body.video.id}`, { featured: false });
    list = await featured();
    expect(list.map((v) => v.id)).toEqual([a.body.video.id]);

    for (const v of [a, b]) await api().delete(`/api/admin/videos/${v.body.video.id}`).set("Authorization", admin);
    expect(await featured()).toEqual([]);
  });

  it("adds, reorders and shows videos on the chapter page", async () => {
    const a = await post(`/api/admin/chapters/${chapterId}/videos`, { url: "https://youtu.be/aaaaaaaaaaa", title: "Part A" });
    const b = await post(`/api/admin/chapters/${chapterId}/videos`, { url: "bbbbbbbbbbb", title: "Part B" });
    expect(a.status).toBe(201);
    expect(a.body.video.youtubeId).toBe("aaaaaaaaaaa");
    expect((await post(`/api/admin/chapters/${chapterId}/videos`, { url: "https://vimeo.com/1", title: "x" })).status).toBe(400);

    await api()
      .put(`/api/admin/chapters/${chapterId}/videos/reorder`)
      .set("Authorization", admin)
      .send({ ids: [b.body.video.id, a.body.video.id] });
    const pub = await api().get(`${CHAPTER_URL}/chapter-1`);
    expect(pub.body.videos.map((v: { title: string }) => v.title)).toEqual(["Part B", "Part A"]);
  });
});

describe("image uploads", () => {
  it("only accepts safe image types up to 5 MB", async () => {
    expect((await post("/api/admin/uploads/images", { contentType: "image/svg+xml", size: 100 })).status).toBe(400);
    expect((await post("/api/admin/uploads/images", { contentType: "image/png", size: 6 * 1024 * 1024 })).status).toBe(400);
  });

  it("is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    const res = await api()
      .post("/api/admin/uploads/images")
      .set("Authorization", student.auth)
      .send({ contentType: "image/png", size: 10 });
    expect(res.status).toBe(403);
  });

  it.skipIf(!hasR2Env || !process.env.R2_PUBLIC_URL)(
    "live: presigned upload accepts exactly the signed size, and the image is publicly reachable",
    async () => {
      // 1×1 transparent PNG
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64"
      );
      const res = await post("/api/admin/uploads/images", { contentType: "image/png", size: png.length });
      expect(res.status).toBe(201);
      const { uploadUrl, publicUrl, key } = res.body;
      expect(key).toMatch(/^images\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/);

      try {
        const tooBig = await fetch(uploadUrl, {
          method: "PUT",
          body: Buffer.concat([png, Buffer.alloc(100)]),
          headers: { "Content-Type": "image/png" },
        });
        expect(tooBig.ok).toBe(false);

        const wrongType = await fetch(uploadUrl, { method: "PUT", body: png, headers: { "Content-Type": "text/html" } });
        expect(wrongType.ok).toBe(false);

        const ok = await fetch(uploadUrl, { method: "PUT", body: png, headers: { "Content-Type": "image/png" } });
        expect(ok.status).toBe(200);

        const served = await fetch(publicUrl);
        expect(served.status).toBe(200);
        expect(served.headers.get("content-type")).toBe("image/png");
      } finally {
        await deleteObject(key);
      }
    }
  );
});
