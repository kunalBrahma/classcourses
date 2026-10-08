// Seeds Class 1–12 and the Assamese + English medium catalogs.
// Run: `npm run seed` (or `npx prisma db seed`).
//
// Idempotent and non-destructive: it only CREATES what is missing. Anything
// that already exists (renamed chapters, hidden subjects, reordered items,
// deleted placeholder chapters) is left exactly as the admin set it.
import prisma from "../src/config/prisma";
import { slugify } from "../src/utils/slug";
import { MEDIUMS, MediumSeed, SubjectSeed } from "./seed-data/catalog";
import { FAQ, PAGES } from "./seed-data/pages";
import { sanitizeRichText } from "../src/utils/sanitizeHtml";
import { hashPassword } from "../src/utils/password";
import { env } from "../src/config/env";

type Db = typeof prisma;

export interface SeedStats {
  classesCreated: number;
  mediumsCreated: number;
  subjectsCreated: number;
  partsCreated: number;
  chaptersCreated: number;
}

const createSubjectTree = async (
  db: Db,
  mediumId: string,
  classLevelId: string,
  seed: SubjectSeed,
  order: number,
  stats: SeedStats
) => {
  await db.$transaction(async (tx) => {
    const subject = await tx.subject.create({
      data: { mediumId, classLevelId, name: seed.name, nativeName: seed.nativeName ?? null, slug: slugify(seed.name), order },
    });
    stats.subjectsCreated += 1;

    // Numbering runs across the whole subject in reading order: loose chapters, then parts.
    let number = 1;
    const chapter = (partId: string | null, orderInGroup: number) => ({
      subjectId: subject.id,
      partId,
      number,
      title: `Chapter ${number}`,
      slug: `chapter-${number++}`,
      order: orderInGroup,
    });

    const loose = Array.from({ length: seed.chapters ?? 0 }, (_, i) => chapter(null, i));
    if (loose.length) {
      await tx.chapter.createMany({ data: loose });
      stats.chaptersCreated += loose.length;
    }

    for (const [partOrder, partSeed] of (seed.parts ?? []).entries()) {
      const part = await tx.subjectPart.create({
        data: { subjectId: subject.id, title: partSeed.title, order: partOrder },
      });
      stats.partsCreated += 1;
      const rows = Array.from({ length: partSeed.chapters }, (_, i) => chapter(part.id, i));
      await tx.chapter.createMany({ data: rows });
      stats.chaptersCreated += rows.length;
    }
  });
};

const seedMedium = async (db: Db, seed: MediumSeed, mediumOrder: number, classIds: Map<number, string>, stats: SeedStats) => {
  let medium = await db.medium.findUnique({ where: { slug: seed.slug } });
  if (!medium) {
    medium = await db.medium.create({
      data: { name: seed.name, nativeName: seed.nativeName, slug: seed.slug, order: mediumOrder },
    });
    stats.mediumsCreated += 1;
  }

  for (const [classNumber, subjects] of Object.entries(seed.classes)) {
    const classLevelId = classIds.get(Number(classNumber))!;
    for (const [order, subjectSeed] of subjects.entries()) {
      const exists = await db.subject.findUnique({
        where: {
          mediumId_classLevelId_slug: { mediumId: medium.id, classLevelId, slug: slugify(subjectSeed.name) },
        },
        select: { id: true },
      });
      if (!exists) {
        await createSubjectTree(db, medium.id, classLevelId, subjectSeed, order, stats);
      }
    }
  }
};

export const seedCatalog = async (db: Db = prisma): Promise<SeedStats> => {
  const stats: SeedStats = { classesCreated: 0, mediumsCreated: 0, subjectsCreated: 0, partsCreated: 0, chaptersCreated: 0 };

  // Classes 1–12 to start with ("Class 5" / class-5). The admin can rename,
  // reorder, hide, delete or add more; existing classes are never overwritten.
  const classIds = new Map<number, string>();
  for (let number = 1; number <= 12; number += 1) {
    const slug = `class-${number}`;
    const existing = await db.classLevel.findUnique({ where: { slug } });
    const classLevel = existing ?? (await db.classLevel.create({ data: { name: `Class ${number}`, slug, order: number } }));
    if (!existing) stats.classesCreated += 1;
    classIds.set(number, classLevel.id);
  }

  for (const [order, medium] of MEDIUMS.entries()) {
    await seedMedium(db, medium, order, classIds, stats);
  }
  return stats;
};

// Draft static pages + FAQ, created UNPUBLISHED (the owner approves them).
// Existing pages are never overwritten; FAQ is seeded only into an empty table.
export const seedPages = async (db: Db = prisma) => {
  let pagesCreated = 0;
  for (const page of PAGES) {
    const exists = await db.page.findUnique({ where: { slug: page.slug }, select: { slug: true } });
    if (!exists) {
      await db.page.create({ data: { slug: page.slug, title: page.title, bodyHtml: sanitizeRichText(page.bodyHtml) } });
      pagesCreated += 1;
    }
  }
  let faqCreated = 0;
  if ((await db.faqItem.count()) === 0) {
    await db.faqItem.createMany({
      data: FAQ.map((f, order) => ({ question: f.question, answerHtml: sanitizeRichText(f.answerHtml), order })),
    });
    faqCreated = FAQ.length;
  }
  return { pagesCreated, faqCreated };
};

// Creates the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (backend/.env)
// if that email isn't registered yet. An existing user is promoted to ADMIN
// but their password is NEVER reset by re-seeding.
export const seedAdmin = async (db: Db = prisma) => {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return { admin: "skipped (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set)" };
  if (env.NODE_ENV === "production" && password.length < 12) {
    return { admin: "skipped: use a password of 12+ characters in production (or npm run create-admin)" };
  }

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (existing) {
    if (existing.role !== "ADMIN") await db.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
    return { admin: existing.role === "ADMIN" ? `exists: ${email}` : `promoted to ADMIN: ${email}` };
  }
  await db.user.create({ data: { email, name: "Admin", password: await hashPassword(password), role: "ADMIN" } });
  return { admin: `created: ${email}` };
};

if (require.main === module) {
  seedCatalog()
    .then(async (stats) => {
      console.log("[seed] catalog:", stats);
      console.log("[seed] pages:", await seedPages());
      console.log("[seed]", await seedAdmin());
    })
    .catch((err) => {
      console.error("[seed] failed:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
