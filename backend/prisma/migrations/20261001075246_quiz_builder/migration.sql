-- CreateEnum
CREATE TYPE "QuizPickMode" AS ENUM ('RANDOM', 'FIXED');

-- CreateEnum
CREATE TYPE "AnswerReveal" AS ENUM ('AFTER_EACH', 'AT_END', 'NEVER');

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "autoQuiz" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "useInQuiz" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "answerReveal" "AnswerReveal" NOT NULL DEFAULT 'AFTER_EACH',
ADD COLUMN     "coinsPerPass" INTEGER,
ADD COLUMN     "optionOrders" JSONB,
ADD COLUMN     "quizId" TEXT,
ADD COLUMN     "quizTitle" TEXT,
ALTER COLUMN "chapterId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mediumId" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "subjectId" TEXT,
    "chapterId" TEXT,
    "pickMode" "QuizPickMode" NOT NULL DEFAULT 'RANDOM',
    "questionCount" INTEGER,
    "sources" "QuestionSource"[],
    "difficulties" "Difficulty"[],
    "difficultyMix" JSONB,
    "onlyQuizMarked" BOOLEAN NOT NULL DEFAULT true,
    "secondsPerQuestion" INTEGER,
    "passMark" INTEGER,
    "coinsPerPass" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "answerReveal" "AnswerReveal" NOT NULL DEFAULT 'AFTER_EACH',
    "maxAttemptsPerStudent" INTEGER,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizChapter" (
    "quizId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,

    CONSTRAINT "QuizChapter_pkey" PRIMARY KEY ("quizId","chapterId")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "quizId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("quizId","questionId")
);

-- CreateIndex
CREATE INDEX "Quiz_mediumId_classLevelId_idx" ON "Quiz"("mediumId", "classLevelId");

-- CreateIndex
CREATE INDEX "Quiz_subjectId_idx" ON "Quiz"("subjectId");

-- CreateIndex
CREATE INDEX "Quiz_chapterId_idx" ON "Quiz"("chapterId");

-- CreateIndex
CREATE INDEX "QuizChapter_chapterId_idx" ON "QuizChapter"("chapterId");

-- CreateIndex
CREATE INDEX "QuizQuestion_questionId_idx" ON "QuizQuestion"("questionId");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_quizId_status_idx" ON "QuizAttempt"("userId", "quizId", "status");

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_status_idx" ON "QuizAttempt"("quizId", "status");

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_mediumId_fkey" FOREIGN KEY ("mediumId") REFERENCES "Medium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizChapter" ADD CONSTRAINT "QuizChapter_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizChapter" ADD CONSTRAINT "QuizChapter_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
