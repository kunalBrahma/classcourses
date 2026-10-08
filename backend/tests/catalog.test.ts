import { beforeAll, describe, expect, it } from "vitest";
import prisma from "../src/config/prisma";
import { seedCatalog } from "../prisma/seed";
import { api, classIdOf, createUserAndLogin } from "./helpers";

const EN = "/api/catalog/mediums/english-medium";
const AS = "/api/catalog/mediums/assamese-medium";

let admin: string;

beforeAll(async () => {
  await seedCatalog();
  admin = (await createUserAndLogin("ADMIN")).auth;
});

const subjectOf = async (mediumSlug: string, classNumber: number, slug: string) =>
  prisma.subject.findFirstOrThrow({
    where: { slug, medium: { slug: mediumSlug }, classLevel: { slug: `class-${classNumber}` } },
  });

describe("seed", () => {
  it("matches the requirements PDF and the screenshot", async () => {
    expect(await prisma.classLevel.count()).toBe(12);
    expect(await prisma.subject.count({ where: { medium: { slug: "english-medium" } } })).toBe(68);
    expect(await prisma.subject.count({ where: { medium: { slug: "assamese-medium" } } })).toBe(112);
    expect(await prisma.chapter.count({ where: { subject: { medium: { slug: "english-medium" } } } })).toBe(920);
    // Assamese Medium chapter counts are PENDING from the client → subjects only
    expect(await prisma.chapter.count({ where: { subject: { medium: { slug: "assamese-medium" } } } })).toBe(0);
  });

  it("builds parts where the PDF gives them", async () => {
    const geo = await subjectOf("english-medium", 12, "geography");
    const parts = await prisma.subjectPart.findMany({
      where: { subjectId: geo.id },
      orderBy: { order: "asc" },
      include: { _count: { select: { chapters: true } } },
    });
    expect(parts.map((p) => p._count.chapters)).toEqual([1, 3, 5, 1, 3, 1, 5, 3, 2, 2, 2]);

    const english11 = await subjectOf("english-medium", 11, "english");
    expect(await prisma.chapter.count({ where: { subjectId: english11.id, partId: null } })).toBe(14);
    const writing = await prisma.subjectPart.findFirstOrThrow({ where: { subjectId: english11.id } });
    expect(writing.title).toBe("Writing Skills");
    expect(await prisma.chapter.count({ where: { partId: writing.id } })).toBe(6);
  });

  it("is idempotent and never overwrites admin edits", async () => {
    const math = await subjectOf("english-medium", 2, "math");
    await prisma.subject.update({ where: { id: math.id }, data: { name: "Mathematics (renamed)" } });
    const stats = await seedCatalog();
    expect(stats).toEqual({ classesCreated: 0, mediumsCreated: 0, subjectsCreated: 0, partsCreated: 0, chaptersCreated: 0 });
    expect((await prisma.subject.findUniqueOrThrow({ where: { id: math.id } })).name).toBe("Mathematics (renamed)");
    await prisma.subject.update({ where: { id: math.id }, data: { name: "Math" } });
  });
});

describe("public catalog", () => {
  it("lists active mediums in order", async () => {
    const res = await api().get("/api/catalog/mediums");
    expect(res.body.mediums.map((m: { slug: string }) => m.slug)).toEqual(["assamese-medium", "english-medium"]);
  });

  it("only lists classes that have subjects in that medium", async () => {
    const en = await api().get(EN);
    expect(en.body.classes.map((c: { slug: string }) => c.slug)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `class-${n}`));
    const as = await api().get(AS);
    expect(as.body.classes[0]).toEqual({ id: expect.any(String), name: "Class 1", nativeName: null, slug: "class-1", subjectCount: 3 });
  });

  it("class page returns subjects with chapters grouped by part (dropdown data)", async () => {
    const res = await api().get(`${EN}/classes/class-3`);
    expect(res.status).toBe(200);
    const math = res.body.subjects.find((s: { slug: string }) => s.slug === "math");
    expect(math.chapterCount).toBe(14);
    expect(math.groups.map((g: { part: { title: string }; chapters: unknown[] }) => [g.part.title, g.chapters.length])).toEqual([
      ["Part 1", 4],
      ["Part 2", 2],
      ["Part 3", 4],
      ["Part 4", 4],
    ]);
    // Accepts a plain number too
    expect((await api().get(`${EN}/classes/3`)).status).toBe(200);
  });

  it("Class 11 English: main chapters first, then the Writing Skills section", async () => {
    const res = await api().get(`${EN}/classes/11/subjects/english`);
    const groups = res.body.subject.groups;
    expect(groups[0].part).toBeNull();
    expect(groups[0].chapters).toHaveLength(14);
    expect(groups[1].part.title).toBe("Writing Skills");
    expect(groups[1].chapters[0].number).toBe(15);
  });

  it("404s for unknown or empty classes, subjects and chapters", async () => {
    expect((await api().get(`${EN}/classes/1`)).status).toBe(404); // English Medium has no Class 1
    expect((await api().get(`${EN}/classes/13`)).status).toBe(404);
    expect((await api().get(`${EN}/classes/2/subjects/nope`)).status).toBe(404);
    expect((await api().get(`${EN}/classes/2/subjects/math/chapters/chapter-99`)).status).toBe(404);
    expect((await api().get("/api/catalog/mediums/klingon-medium")).status).toBe(404);
  });

  describe("Previous / Next Chapter", () => {
    const chapterUrl = (slug: string) => `${EN}/classes/3/subjects/math/chapters/${slug}`;

    it("first chapter has no previous", async () => {
      const res = await api().get(chapterUrl("chapter-1"));
      expect(res.body.prev).toBeNull();
      expect(res.body.next.slug).toBe("chapter-2");
      expect(res.body.position).toEqual({ index: 1, total: 14 });
    });

    it("crosses part boundaries (Part 1's last → Part 2's first)", async () => {
      const res = await api().get(chapterUrl("chapter-4"));
      expect(res.body.chapter.part.title).toBe("Part 1");
      expect(res.body.next).toMatchObject({ slug: "chapter-5", partTitle: "Part 2" });
      const back = await api().get(chapterUrl("chapter-5"));
      expect(back.body.prev).toMatchObject({ slug: "chapter-4", partTitle: "Part 1" });
    });

    it("last chapter has no next", async () => {
      const res = await api().get(chapterUrl("chapter-14"));
      expect(res.body.next).toBeNull();
    });

    it("follows the part order when parts are reordered", async () => {
      const math = await subjectOf("english-medium", 3, "math");
      const parts = await prisma.subjectPart.findMany({ where: { subjectId: math.id }, orderBy: { order: "asc" } });
      const swapped = [parts[1], parts[0], parts[2], parts[3]].map((p) => p.id);
      expect(
        (await api().put(`/api/admin/subjects/${math.id}/parts/reorder`).set("Authorization", admin).send({ ids: swapped }))
          .status
      ).toBe(200);

      // Part 2 (chapters 5–6) now comes first
      expect((await api().get(chapterUrl("chapter-5"))).body.prev).toBeNull();
      expect((await api().get(chapterUrl("chapter-6"))).body.next.slug).toBe("chapter-1");

      await api()
        .put(`/api/admin/subjects/${math.id}/parts/reorder`)
        .set("Authorization", admin)
        .send({ ids: parts.map((p) => p.id) });
    });

    it("skips unpublished chapters, which are 404 to students", async () => {
      const math = await subjectOf("english-medium", 3, "math");
      const ch2 = await prisma.chapter.findFirstOrThrow({ where: { subjectId: math.id, slug: "chapter-2" } });
      await api().patch(`/api/admin/chapters/${ch2.id}`).set("Authorization", admin).send({ isPublished: false });

      expect((await api().get(chapterUrl("chapter-1"))).body.next.slug).toBe("chapter-3");
      expect((await api().get(chapterUrl("chapter-2"))).status).toBe(404);

      await api().patch(`/api/admin/chapters/${ch2.id}`).set("Authorization", admin).send({ isPublished: true });
    });
  });

  it("inactive medium and subject disappear from the public API", async () => {
    const en = await prisma.medium.findUniqueOrThrow({ where: { slug: "english-medium" } });
    await api().patch(`/api/admin/mediums/${en.id}`).set("Authorization", admin).send({ isActive: false });
    expect((await api().get(EN)).status).toBe(404);
    expect((await api().get("/api/catalog/mediums")).body.mediums).toHaveLength(1);
    await api().patch(`/api/admin/mediums/${en.id}`).set("Authorization", admin).send({ isActive: true });

    const hindi = await subjectOf("english-medium", 6, "hindi");
    await api().patch(`/api/admin/subjects/${hindi.id}`).set("Authorization", admin).send({ isActive: false });
    const class6 = await api().get(`${EN}/classes/6`);
    expect(class6.body.subjects.map((s: { slug: string }) => s.slug)).not.toContain("hindi");
    await api().patch(`/api/admin/subjects/${hindi.id}`).set("Authorization", admin).send({ isActive: true });
  });
});

describe("admin catalog", () => {
  it("is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/admin/mediums").set("Authorization", student.auth)).status).toBe(403);
    expect((await api().post("/api/admin/mediums").send({ name: "X" })).status).toBe(401);
  });

  it("creates any medium, with an automatic link; duplicate names are 409", async () => {
    const res = await api()
      .post("/api/admin/mediums")
      .set("Authorization", admin)
      .send({ name: "Hindi Medium", nativeName: "हिंदी माध्यम" });
    expect(res.status).toBe(201);
    expect(res.body.medium).toMatchObject({ slug: "hindi-medium", order: 2, isActive: true });

    const dup = await api().post("/api/admin/mediums").set("Authorization", admin).send({ name: "hindi medium " });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('A medium called "hindi medium" already exists.');

    // A different name whose link would clash gets a suffix instead of an error
    const punct = await api().post("/api/admin/mediums").set("Authorization", admin).send({ name: "Hindi-Medium!" });
    expect(punct.status).toBe(201);
    expect(punct.body.medium.slug).toBe("hindi-medium-2");

    // A name with no Latin letters still gets a link
    const bengali = await api().post("/api/admin/mediums").set("Authorization", admin).send({ name: "বাংলা" });
    expect(bengali.status).toBe(201);
    expect(bengali.body.medium.slug).toMatch(/^medium-\d+$/);

    // Renaming onto another medium's name is refused
    const rename = await api().patch(`/api/admin/mediums/${bengali.body.medium.id}`).set("Authorization", admin).send({ name: "Hindi Medium" });
    expect(rename.status).toBe(409);
    for (const m of [punct, bengali]) await prisma.medium.delete({ where: { id: m.body.medium.id } });
    const badSlug = await api()
      .post("/api/admin/mediums")
      .set("Authorization", admin)
      .send({ name: "Bengali Medium", slug: "Bengali Medium!" });
    expect(badSlug.status).toBe(400);
  });

  it("builds a subject, parts and placeholder chapters from scratch", async () => {
    const hindi = await prisma.medium.findUniqueOrThrow({ where: { slug: "hindi-medium" } });
    const created = await api()
      .post("/api/admin/subjects")
      .set("Authorization", admin)
      .send({ mediumId: hindi.id, classId: await classIdOf(5), name: "Logic & Philosophy" });
    expect(created.status).toBe(201);
    const subjectId = created.body.subject.id;
    expect(created.body.subject.slug).toBe("logic-and-philosophy");

    const loose = await api()
      .post(`/api/admin/subjects/${subjectId}/chapters/bulk`)
      .set("Authorization", admin)
      .send({ count: 3 });
    expect(loose.body).toMatchObject({ firstNumber: 1, lastNumber: 3 });

    const part = await api()
      .post(`/api/admin/subjects/${subjectId}/parts`)
      .set("Authorization", admin)
      .send({ title: "Book 1" });
    const inPart = await api()
      .post(`/api/admin/subjects/${subjectId}/chapters/bulk`)
      .set("Authorization", admin)
      .send({ count: 2, partId: part.body.part.id });
    expect(inPart.body).toMatchObject({ firstNumber: 4, lastNumber: 5 });

    const single = await api()
      .post(`/api/admin/subjects/${subjectId}/chapters`)
      .set("Authorization", admin)
      .send({ title: "Introduction to Logic" });
    expect(single.body.chapter).toMatchObject({ number: 6, slug: "chapter-6", title: "Introduction to Logic" });

    // The automatic link follows the number; a hand-picked link stays put
    const renumbered = await api().patch(`/api/admin/chapters/${single.body.chapter.id}`).set("Authorization", admin).send({ number: 9 });
    expect(renumbered.body.chapter.slug).toBe("chapter-9");
    await api().patch(`/api/admin/chapters/${single.body.chapter.id}`).set("Authorization", admin).send({ slug: "intro-logic" });
    const kept = await api().patch(`/api/admin/chapters/${single.body.chapter.id}`).set("Authorization", admin).send({ number: 6 });
    expect(kept.body.chapter).toMatchObject({ number: 6, slug: "intro-logic" });
    await api().patch(`/api/admin/chapters/${single.body.chapter.id}`).set("Authorization", admin).send({ slug: "chapter-6" });

    // Same subject name twice in one class → plain-English 409; Assamese-only names still get a link
    const dupSubject = await api().post("/api/admin/subjects").set("Authorization", admin).send({ mediumId: hindi.id, classId: await classIdOf(5), name: "logic & philosophy" });
    expect(dupSubject.status).toBe(409);
    expect(dupSubject.body.error).toMatch(/already has a subject called/);
    const asSubject = await api().post("/api/admin/subjects").set("Authorization", admin).send({ mediumId: hindi.id, classId: await classIdOf(5), name: "বিজ্ঞান" });
    expect(asSubject.body.subject.slug).toMatch(/^subject-\d+$/);
    await prisma.subject.delete({ where: { id: asSubject.body.subject.id } });

    const tree = await api().get(`/api/admin/subjects/${subjectId}`).set("Authorization", admin);
    expect(tree.body.subject.chapters.map((c: { number: number }) => c.number)).toEqual([1, 2, 3, 6, 4, 5]);

    // Hindi Medium now shows Class 5 publicly
    const pub = await api().get("/api/catalog/mediums/hindi-medium");
    expect(pub.body.classes).toEqual([expect.objectContaining({ name: "Class 5", slug: "class-5", subjectCount: 1 })]);
  });

  it("rejects a part from another subject", async () => {
    const a = await subjectOf("english-medium", 3, "math");
    const b = await subjectOf("english-medium", 4, "environment");
    const foreignPart = await prisma.subjectPart.findFirstOrThrow({ where: { subjectId: b.id } });
    const res = await api()
      .post(`/api/admin/subjects/${a.id}/chapters`)
      .set("Authorization", admin)
      .send({ partId: foreignPart.id });
    expect(res.status).toBe(400);
  });

  it("reorders chapters within a group and validates the full set", async () => {
    const english = await subjectOf("english-medium", 3, "english");
    const chapters = await prisma.chapter.findMany({ where: { subjectId: english.id }, orderBy: { order: "asc" } });
    const reversed = [...chapters].reverse().map((c) => c.id);

    const partial = await api()
      .put(`/api/admin/subjects/${english.id}/chapters/reorder`)
      .set("Authorization", admin)
      .send({ partId: null, ids: reversed.slice(1) });
    expect(partial.status).toBe(400);

    const ok = await api()
      .put(`/api/admin/subjects/${english.id}/chapters/reorder`)
      .set("Authorization", admin)
      .send({ partId: null, ids: reversed });
    expect(ok.status).toBe(200);
    const first = await api().get(`${EN}/classes/3/subjects/english/chapters/chapter-6`);
    expect(first.body.prev).toBeNull();
  });

  it("moving a chapter to another part appends it there", async () => {
    const math = await subjectOf("english-medium", 3, "math");
    const [part1, , , part4] = await prisma.subjectPart.findMany({ where: { subjectId: math.id }, orderBy: { order: "asc" } });
    const ch1 = await prisma.chapter.findFirstOrThrow({ where: { subjectId: math.id, partId: part1.id, order: 0 } });

    await api().patch(`/api/admin/chapters/${ch1.id}`).set("Authorization", admin).send({ partId: part4.id });
    const res = await api().get(`${EN}/classes/3/subjects/math/chapters/${ch1.slug}`);
    expect(res.body.chapter.part.title).toBe("Part 4");
    expect(res.body.next).toBeNull(); // now the very last chapter
  });

  it("deleting a part keeps its chapters (moved to the no-part group)", async () => {
    const env = await subjectOf("english-medium", 4, "environment");
    const part = await prisma.subjectPart.findFirstOrThrow({ where: { subjectId: env.id }, orderBy: { order: "asc" } });
    const res = await api().delete(`/api/admin/parts/${part.id}`).set("Authorization", admin);
    expect(res.body.movedChapters).toBe(2);
    expect(await prisma.chapter.count({ where: { subjectId: env.id } })).toBe(12);
  });

  it("guards destructive deletes", async () => {
    const en = await prisma.medium.findUniqueOrThrow({ where: { slug: "english-medium" } });
    expect((await api().delete(`/api/admin/mediums/${en.id}`).set("Authorization", admin)).status).toBe(409);

    const it7 = await subjectOf("english-medium", 7, "it");
    expect((await api().delete(`/api/admin/subjects/${it7.id}`).set("Authorization", admin)).status).toBe(409);
    expect((await api().delete(`/api/admin/subjects/${it7.id}?force=true`).set("Authorization", admin)).status).toBe(200);
    expect(await prisma.chapter.count({ where: { subjectId: it7.id } })).toBe(0);
  });

  it("hides a class globally", async () => {
    const twelve = await classIdOf(12);
    await api().patch(`/api/admin/classes/${twelve}`).set("Authorization", admin).send({ isActive: false });
    const en = await api().get(EN);
    expect(en.body.classes.map((c: { slug: string }) => c.slug)).not.toContain("class-12");
    expect((await api().get(`${EN}/classes/12`)).status).toBe(404);
    await api().patch(`/api/admin/classes/${twelve}`).set("Authorization", admin).send({ isActive: true });
  });
});

describe("classes are fully admin-managed", () => {
  it("adds, renames, reorders, hides and deletes classes; URLs follow the link", async () => {
    const as = await prisma.medium.findUniqueOrThrow({ where: { slug: "assamese-medium" } });
    const lkg = await api().post("/api/admin/classes").set("Authorization", admin).send({ name: "LKG", nativeName: "এল কে জি" });
    expect(lkg.status).toBe(201);
    expect(lkg.body.classLevel).toMatchObject({ name: "LKG", slug: "lkg", order: 13, isActive: true });
    const id = lkg.body.classLevel.id;

    expect((await api().post("/api/admin/classes").set("Authorization", admin).send({ name: "lkg " })).body.error).toBe('A class called "lkg" already exists.');
    const thirteen = await api().post("/api/admin/classes").set("Authorization", admin).send({ name: "Class 13" });
    expect(thirteen.body.classLevel.slug).toBe("class-13");
    const assamOnly = await api().post("/api/admin/classes").set("Authorization", admin).send({ name: "শিশু শ্ৰেণী" });
    expect(assamOnly.body.classLevel.slug).toMatch(/^class-\d+$/);

    // A class appears for a medium only once it has subjects there; its URL uses the link
    expect((await api().get(AS)).body.classes.map((c: { slug: string }) => c.slug)).not.toContain("lkg");
    const subject = await api().post("/api/admin/subjects").set("Authorization", admin).send({ mediumId: as.id, classId: id, name: "Rhymes" });
    expect(subject.status).toBe(201);
    await api().post(`/api/admin/subjects/${subject.body.subject.id}/chapters/bulk`).set("Authorization", admin).send({ count: 2 });
    const pub = await api().get(AS);
    expect(pub.body.classes.find((c: { slug: string }) => c.slug === "lkg")).toMatchObject({ name: "LKG", nativeName: "এল কে জি", subjectCount: 1 });
    const page = await api().get(`${AS}/classes/lkg`);
    expect(page.body.classLevel).toMatchObject({ name: "LKG", slug: "lkg" });
    expect((await api().get(`${AS}/classes/lkg/subjects/rhymes/chapters/chapter-1`)).status).toBe(200);

    // Rename keeps the link; reorder puts LKG first
    await api().patch(`/api/admin/classes/${id}`).set("Authorization", admin).send({ name: "Lower KG" });
    expect((await api().get(`${AS}/classes/lkg`)).body.classLevel.name).toBe("Lower KG");
    const all = (await api().get("/api/admin/classes").set("Authorization", admin)).body.classes as { id: string }[];
    const order = [id, ...all.map((c) => c.id).filter((x) => x !== id)];
    expect((await api().put("/api/admin/classes/reorder").set("Authorization", admin).send({ ids: order })).status).toBe(200);
    expect((await api().get(AS)).body.classes[0].slug).toBe("lkg");
    expect((await api().put("/api/admin/classes/reorder").set("Authorization", admin).send({ ids: [id] })).status).toBe(400);
    const listed = (await api().get("/api/admin/classes").set("Authorization", admin)).body.classes;
    expect(listed[0]).toMatchObject({ id, subjectCount: 1, subjectsByMedium: { [as.id]: 1 } });

    // Delete is refused while it has subjects; allowed once empty
    const blocked = await api().delete(`/api/admin/classes/${id}`).set("Authorization", admin);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("Lower KG still has 1 subject. Delete or move them first, or hide the class instead.");
    await api().delete(`/api/admin/subjects/${subject.body.subject.id}?force=true`).set("Authorization", admin);
    for (const cid of [id, thirteen.body.classLevel.id, assamOnly.body.classLevel.id]) {
      expect((await api().delete(`/api/admin/classes/${cid}`).set("Authorization", admin)).status).toBe(200);
    }
    // put the seeded order back
    const rest = (await api().get("/api/admin/classes").set("Authorization", admin)).body.classes as { id: string; slug: string }[];
    const sorted = [...rest].sort((a, b) => Number(a.slug.split("-")[1]) - Number(b.slug.split("-")[1]));
    await api().put("/api/admin/classes/reorder").set("Authorization", admin).send({ ids: sorted.map((c) => c.id) });
  });
});

describe("student preferences & users list", () => {
  it("saves the student's medium/class and returns them from /me", async () => {
    const student = await createUserAndLogin("STUDENT");
    const as = await prisma.medium.findUniqueOrThrow({ where: { slug: "assamese-medium" } });
    const res = await api()
      .patch("/api/users/me/preferences")
      .set("Authorization", student.auth)
      .send({ mediumId: as.id, classLevelId: await classIdOf(9) });
    expect(res.status).toBe(200);
    const me = await api().get("/api/auth/me").set("Authorization", student.auth);
    expect(me.body.user).toMatchObject({ mediumId: as.id, classLevel: { name: "Class 9", slug: "class-9" } });

    const bad = await api()
      .patch("/api/users/me/preferences")
      .set("Authorization", student.auth)
      .send({ mediumId: "00000000-0000-4000-8000-000000000000" });
    expect(bad.status).toBe(400);
  });

  it("GET /api/users (every user's email) is admin-only", async () => {
    const student = await createUserAndLogin("STUDENT");
    expect((await api().get("/api/users").set("Authorization", student.auth)).status).toBe(403);
    expect((await api().get("/api/users").set("Authorization", admin)).status).toBe(200);
  });
});
