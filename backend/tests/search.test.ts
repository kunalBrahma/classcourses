import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { api } from "./helpers";

type Result = { type: string; label: string; nativeLabel: string | null; context: string; href: string };
const search = async (q: string) => {
  const res = await api().get("/api/catalog/search").query({ q });
  return { status: res.status, results: (res.body.results ?? []) as Result[] };
};

let chapterId: string;
let subjectId: string;

beforeAll(async () => {
  await seedCatalog();
  const subject = await prisma.subject.findFirstOrThrow({
    where: { slug: "english", medium: { slug: "english-medium" }, classLevel: { slug: "class-9" } },
  });
  subjectId = subject.id;
  const chapter = await prisma.chapter.findFirstOrThrow({ where: { subjectId, slug: "chapter-1" } });
  chapterId = chapter.id;
  await prisma.chapter.update({ where: { id: chapterId }, data: { title: "The Zebra Crossing" } });
});

describe("catalog search", () => {
  it("finds a chapter by title, with a link to its page", async () => {
    const { results } = await search("zebra");
    expect(results).toEqual([
      {
        type: "chapter",
        label: "Chapter 1: The Zebra Crossing",
        nativeLabel: null,
        context: "English Medium · Class 9 · English",
        href: "/english-medium/class-9/english/chapter-1",
      },
    ]);
  });

  it("finds subjects by Assamese name as well as English", async () => {
    const assamese = await search("গণিত");
    expect(assamese.results.length).toBeGreaterThan(0);
    expect(assamese.results.every((r) => r.type === "subject" && r.nativeLabel?.includes("গণিত"))).toBe(true);
    expect(assamese.results[0].href).toMatch(/^\/assamese-medium\/class-\d+\/[a-z0-9-]+$/);

    const english = await search("mathematics");
    expect(english.results.some((r) => r.type === "subject" && r.label === "Mathematics")).toBe(true);
  });

  it("lists a class once per medium that teaches it, broad matches first", async () => {
    const { results } = await search("class 9");
    const classes = results.filter((r) => r.type === "class");
    expect(classes.map((r) => r.href).sort()).toEqual(["/assamese-medium/class-9", "/english-medium/class-9"]);
    expect(results[0].type).toBe("class");
  });

  it("hides unpublished chapters and inactive subjects", async () => {
    await prisma.chapter.update({ where: { id: chapterId }, data: { isPublished: false } });
    expect((await search("zebra")).results).toEqual([]);
    await prisma.chapter.update({ where: { id: chapterId }, data: { isPublished: true } });

    await prisma.subject.update({ where: { id: subjectId }, data: { isActive: false } });
    expect((await search("zebra")).results).toEqual([]);
    await prisma.subject.update({ where: { id: subjectId }, data: { isActive: true } });
    expect((await search("zebra")).results).toHaveLength(1);
  });

  it("needs 2–60 characters and returns at most 20 results", async () => {
    expect((await search("a")).status).toBe(400);
    expect((await search(" ")).status).toBe(400);
    expect((await search("x".repeat(61))).status).toBe(400);
    expect((await search("chapter")).results).toHaveLength(20);
  });
});
