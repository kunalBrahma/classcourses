-- CreateEnum
CREATE TYPE "QuestionKind" AS ENUM ('QA', 'MCQ');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('TEXTBOOK', 'EXTRA');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "kind" "QuestionKind" NOT NULL,
    "source" "QuestionSource" NOT NULL DEFAULT 'TEXTBOOK',
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "options" JSONB,
    "correctIndex" INTEGER,
    "explanation" TEXT,
    "difficulty" "Difficulty",
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_chapterId_source_kind_order_idx" ON "Question"("chapterId", "source", "kind", "order");

-- CreateIndex
CREATE INDEX "Video_chapterId_order_idx" ON "Video"("chapterId", "order");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
