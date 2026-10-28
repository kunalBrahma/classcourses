"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlayIcon } from "lucide-react";
import { apiJson } from "@/lib/api";
import { Attempt, attemptLabel, isFinished, quizHref } from "@/lib/quiz";
import { useSignedIn } from "@/components/site/account-menu";

interface Usage {
  used: number;
  limit: number;
  remaining: number;
}

// Signed-in students: quizzes left today (resets at midnight IST) and any
// paused quiz to resume.
export function QuizUsage() {
  const signedIn = useSignedIn();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [open, setOpen] = useState<Attempt[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    apiJson<{ usage: Usage; attempts: Attempt[] }>("/api/quiz/today")
      .then(({ usage, attempts }) => {
        if (cancelled) return;
        setUsage(usage);
        setOpen(attempts.filter((a) => !isFinished(a)));
      })
      .catch(() => !cancelled && setUsage(null));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn || !usage) return null;
  return (
    <div className="mt-3 grid gap-2">
      <p className="rounded-xl bg-accent px-3 py-2 text-[15px] font-semibold">
        {usage.remaining > 0
          ? `You can take ${usage.remaining} more ${usage.remaining === 1 ? "quiz" : "quizzes"} today.`
          : "You've used all your quizzes for today. Come back after midnight!"}
      </p>
      {open.map((a) => (
        <Link key={a.id} href={quizHref(a.id)} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-brand-amber px-3 py-2 font-semibold hover:bg-accent">
          <PlayIcon className="size-4 shrink-0 fill-current text-brand-amber-text" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate" lang="as">
            Resume: {attemptLabel(a)}
          </span>
          <span className="shrink-0 text-sm text-muted-foreground">
            {a.answered}/{a.total}
          </span>
        </Link>
      ))}
    </div>
  );
}
