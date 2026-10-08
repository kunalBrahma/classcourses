"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuizBuilder } from "@/components/admin/quiz-builder/quiz-builder";
import { ApiError, apiJson } from "@/lib/api";
import { QuizRow } from "@/lib/quiz";

export default function EditQuizPage() {
  const { id } = useParams<{ id: string }>();
  const [quiz, setQuiz] = useState<QuizRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ quiz: QuizRow }>(`/api/admin/quizzes/${id}`)
      .then(({ quiz }) => setQuiz(quiz))
      .catch((err: ApiError) => setError(err.status === 404 ? "This quiz doesn't exist (it may have been deleted)." : err.message));
  }, [id]);

  if (error)
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="-ml-2 h-9 px-2">
          <Link href="/quizzes/manage">
            <ArrowLeftIcon /> All quizzes
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t open this quiz</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  if (!quiz) return <Skeleton className="h-[600px] w-full rounded-2xl" />;
  // key: a fresh builder state per quiz
  return <QuizBuilder key={quiz.id} quiz={quiz} />;
}
