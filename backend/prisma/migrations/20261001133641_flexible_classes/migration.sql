-- Flexible classes: ClassLevel gets name / nativeName / slug / order instead of
-- a fixed 1–12 number. Generated with `prisma migrate diff`, then split so the
-- existing rows are backfilled before the NOT NULL / drop steps.

-- 1. New columns (nullable first)
ALTER TABLE "ClassLevel"
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "nativeName" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "User" ADD COLUMN "classLevelId" TEXT;

-- 2. Backfill: "Class 5" / class-5 / order 5 — the same links as before
UPDATE "ClassLevel" SET "name" = 'Class ' || "number", "slug" = 'class-' || "number", "order" = "number";
UPDATE "User" u SET "classLevelId" = c."id" FROM "ClassLevel" c WHERE c."number" = u."classLevel";

-- 3. Tighten and drop the old columns
ALTER TABLE "ClassLevel" ALTER COLUMN "name" SET NOT NULL, ALTER COLUMN "slug" SET NOT NULL, ALTER COLUMN "updatedAt" DROP DEFAULT;
DROP INDEX "ClassLevel_number_key";
ALTER TABLE "ClassLevel" DROP COLUMN "number";
ALTER TABLE "User" DROP COLUMN "classLevel";

-- CreateIndex
CREATE UNIQUE INDEX "ClassLevel_slug_key" ON "ClassLevel"("slug");

-- CreateIndex
CREATE INDEX "ClassLevel_order_idx" ON "ClassLevel"("order");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
