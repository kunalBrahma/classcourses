"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RichView } from "@/components/admin/editor/rich-text-editor";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { LETTERS } from "@/lib/content";
import { formatDate, QUIZ_STATUS } from "@/lib/people";
import { AttemptDetail, attemptScope, attemptTitle, OUTCOME } from "@/lib/quiz";
import { cn } from "@/lib/utils";

export default function AttemptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<AttemptDetail>(`/api/admin/quiz/attempts/${id}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.status === 404 ? "This quiz attempt doesn't exist." : err.message));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="-ml-2 h-9 px-2"><Link href="/quizzes/attempts"><ArrowLeftIcon /> All attempts</Link></Button>
        <Alert variant="destructive"><AlertTitle>Couldn&apos;t open this attempt</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const { attempt: a, items } = data;
  const st = QUIZ_STATUS[a.status];
  const ch = a.chapter;
  // Single-chapter quizzes link to that chapter's MCQs; multi-chapter quizzes to the quiz.
  const editHref = ch ? `/catalog/subjects/${ch.subject.id}/chapters/${ch.id}?tab=mcq` : a.quizId ? `/quizzes/manage/${a.quizId}` : null;
  const counts = items.reduce<Record<string, number>>((m, i) => ((m[i.outcome] = (m[i.outcome] ?? 0) + 1), m), {});

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground">
        <Link href="/quizzes/attempts"><ArrowLeftIcon /> All attempts</Link>
      </Button>

      <Card className={cn(formCard, "gap-4 p-5 sm:p-6")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link href={`/users/${a.user.id}`} className="font-heading text-2xl font-bold tracking-tight hover:underline">
              {a.user.name || a.user.email}
            </Link>
            {a.user.name && <p className="text-sm text-muted-foreground">{a.user.email}</p>}
            <p className="mt-2 text-sm font-semibold">
              {a.quizId ? <Link href={`/quizzes/manage/${a.quizId}`} className="hover:underline">{attemptTitle(a)}</Link> : attemptTitle(a)}
              {a.quizTitle && !a.quizId && <span className="font-normal text-muted-foreground"> (quiz deleted)</span>}
            </p>
            <p className="text-sm text-muted-foreground" lang="as">
              {attemptScope(a)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <p className="font-heading text-4xl font-bold tabular-nums leading-none">
                {a.score}<span className="text-lg font-normal text-muted-foreground">/{a.totalQuestions}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">pass mark {a.passMark}</p>
            </div>
            <Badge variant="outline" className={cn("text-sm", st.className)}>{st.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
          <span>Started {formatDate(a.startedAt, true)}</span>
          {a.finishedAt && <span>Ended {formatDate(a.finishedAt, true)}</span>}
          <span>{a.secondsPerQuestion} s per question</span>
          <span>{a.coinsAwarded > 0 ? `+${a.coinsAwarded} coins earned` : "No coins"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts).map(([outcome, n]) => (
            <Badge key={outcome} variant="outline" className={OUTCOME[outcome as keyof typeof OUTCOME].className}>
              {n} {OUTCOME[outcome as keyof typeof OUTCOME].label.toLowerCase()}
            </Badge>
          ))}
        </div>
      </Card>

      <ol className="grid gap-4">
        {items.map((item) => {
          const o = OUTCOME[item.outcome];
          const q = item.question;
          return (
            <li key={item.index}>
              <Card className={cn(formCard, "gap-3 p-5")}>
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-bold tabular-nums">{item.index + 1}</span>
                  <div className="min-w-0 flex-1">
                    {q ? <RichView html={q.html} className="font-medium" /> : <p className="text-sm italic text-muted-foreground">This question was deleted after the quiz.</p>}
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", o.className)}>{o.label}</Badge>
                </div>
                {q && (
                  <ul className="grid gap-1.5 sm:pl-11">
                    {q.options.map((opt, i) => {
                      const correct = i === q.correctIndex;
                      const chosen = i === item.chosenIndex;
                      return (
                        <li
                          key={i}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm",
                            correct && "border-success/40 bg-success/10",
                            chosen && !correct && "border-destructive/40 bg-destructive/10"
                          )}
                        >
                          <span className="grid size-6 shrink-0 place-items-center rounded-md border text-xs font-bold">{LETTERS[i]}</span>
                          <RichView html={opt} className="min-w-0 flex-1" />
                          {correct && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-success"><CheckIcon className="size-4" /> Correct</span>}
                          {chosen && !correct && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-destructive"><XIcon className="size-4" /> Their answer</span>}
                          {chosen && correct && <span className="shrink-0 text-xs text-success">(their answer)</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {q?.explanation && (
                  <details className="text-sm sm:pl-11">
                    <summary className="cursor-pointer text-muted-foreground">Explanation</summary>
                    <RichView html={q.explanation} className="mt-2" />
                  </details>
                )}
                {q && editHref && (
                  <div className="sm:pl-11">
                    <Link href={editHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                      <PencilIcon className="size-3" /> {ch ? "Edit this chapter's MCQs" : "Open the quiz"}
                    </Link>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
