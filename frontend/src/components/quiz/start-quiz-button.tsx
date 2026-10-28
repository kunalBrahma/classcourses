"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2Icon, PlayIcon, RotateCwIcon } from "lucide-react";
import { useSignedIn } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { AvailableQuiz, quizHref, startQuiz, targetOf } from "@/lib/quiz";

// Start / Resume for one quiz on a chapter page. Guests are sent to sign in
// and come straight back here. The student's own state (an unfinished attempt
// today, attempts left) comes from /api/quiz/available.
export function StartQuizButton({ quizId, chapterId }: { quizId: string; chapterId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = useSignedIn();
  const [mine, setMine] = useState<AvailableQuiz | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    apiJson<{ quizzes: AvailableQuiz[] }>(`/api/quiz/available?chapterId=${chapterId}`)
      .then(({ quizzes }) => !cancelled && setMine(quizzes.find((q) => q.id === quizId) ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn, chapterId, quizId]);

  if (!signedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname + "#quiz")}`}
        className="press-3d inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-bold sm:w-auto"
      >
        Sign in to take the quiz
      </Link>
    );
  }

  const noneLeft = mine?.attemptsLeft === 0 && !mine.resumeAttemptId;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mine?.resumeAttemptId) {
        router.push(quizHref(mine.resumeAttemptId));
        return;
      }
      const { attempt } = await startQuiz(targetOf({ id: quizId }, chapterId));
      router.push(quizHref(attempt.id));
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid w-full gap-2 sm:w-auto">
      <button
        type="button"
        onClick={go}
        disabled={busy || noneLeft}
        className="press-3d inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-bold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2Icon className="size-5 animate-spin" /> : mine?.resumeAttemptId ? <RotateCwIcon className="size-5" /> : <PlayIcon className="size-5 fill-current" />}
        {mine?.resumeAttemptId ? "Resume quiz" : noneLeft ? "No attempts left" : "Start quiz"}
      </button>
      {mine && mine.attemptsLeft !== null && !noneLeft && (
        <p className="text-center text-sm text-muted-foreground">{mine.attemptsLeft} {mine.attemptsLeft === 1 ? "attempt" : "attempts"} left</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
