"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { QuizBuilder } from "@/components/admin/quiz-builder/quiz-builder";
import { apiJson } from "@/lib/api";
import { ChapterContent } from "@/lib/content";
import { QuizForm } from "@/lib/quiz";

// "New quiz", optionally pre-filled from a chapter (?chapterId=…).
function NewQuiz() {
  const chapterId = useSearchParams().get("chapterId");
  const [prefill, setPrefill] = useState<Partial<QuizForm> | null>(chapterId ? null : {});

  useEffect(() => {
    if (!chapterId) return;
    apiJson<{ chapter: ChapterContent }>(`/api/admin/chapters/${chapterId}/content`)
      .then(({ chapter }) =>
        setPrefill({
          title: `${chapter.subject.name} — Chapter ${chapter.number} quiz`,
          mediumId: chapter.subject.medium.id,
          classId: chapter.subject.classLevel.id,
          chapterIds: [chapter.id],
        })
      )
      .catch(() => setPrefill({}));
  }, [chapterId]);

  if (!prefill) return <Skeleton className="h-[600px] w-full rounded-2xl" />;
  return <QuizBuilder prefill={prefill} />;
}

export default function NewQuizPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-2xl" />}>
      <NewQuiz />
    </Suspense>
  );
}
