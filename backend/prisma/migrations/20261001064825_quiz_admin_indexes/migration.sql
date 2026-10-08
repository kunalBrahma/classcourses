-- CreateIndex
CREATE INDEX "QuizAttempt_dayKey_idx" ON "QuizAttempt"("dayKey");

-- CreateIndex
CREATE INDEX "QuizAttempt_chapterId_status_idx" ON "QuizAttempt"("chapterId", "status");
