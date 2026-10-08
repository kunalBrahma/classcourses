"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ListIcon, PencilIcon, TimerIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RichView } from "@/components/admin/editor/rich-text-editor";
import { PageHeader } from "@/components/admin/page-header";
import { ScopeFilters, useFilterParams } from "@/components/admin/quiz/filters";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { LETTERS } from "@/lib/content";
import { ChapterStat, QuestionStat, QuizStat, rangeToDays } from "@/lib/quiz";
import { cn } from "@/lib/utils";

interface StatsResponse {
  chapters: ChapterStat[];
  quizzes: QuizStat[];
  questions: QuestionStat[] | null;
}

// Green when most students get it, amber in the middle, red when most don't.
const rateTone = (rate: number | null) =>
  rate === null ? "bg-muted-foreground/30" : rate >= 70 ? "bg-success" : rate >= 40 ? "bg-warning" : "bg-destructive";

function RateBar({ rate }: { rate: number | null }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-20 overflow-hidden rounded-full bg-muted sm:w-28" aria-hidden="true">
        <span className={cn("block h-full rounded-full", rateTone(rate))} style={{ width: `${rate ?? 0}%` }} />
      </span>
      <span className="w-12 text-right text-sm tabular-nums">{rate === null ? "—" : `${rate}%`}</span>
    </span>
  );
}

function StatsView() {
  const { params, set } = useFilterParams();
  const chapterId = params.get("chapterId");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = params.toString();
  useEffect(() => {
    const p = new URLSearchParams(key);
    const q = new URLSearchParams(rangeToDays(p.get("range") ?? "30d"));
    for (const k of ["mediumId", "classId", "subjectId", "chapterId"]) {
      const v = p.get(k);
      if (v) q.set(k, v);
    }
    let cancelled = false;
    apiJson<StatsResponse>(`/api/admin/quiz/stats?${q.toString()}`)
      .then((res) => !cancelled && (setData(res), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const selected = chapterId ? data?.chapters.find((c) => c.chapter.id === chapterId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quiz stats"
        description="How each chapter's quiz is going. Open a chapter to find the questions students get wrong most — often a sign the answer key or wording needs a look."
      />
      <ScopeFilters />

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!data && !error && <Skeleton className="h-80 rounded-2xl" />}

      {data && !chapterId && (
        <Card className={`${formCard} gap-0 py-0`}>
          <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-6 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
            <span>Chapter</span>
            <span className="w-16 text-right">Attempts</span>
            <span className="w-[10.5rem]">Pass rate</span>
            <span className="w-16 text-right">Avg score</span>
          </div>
          <ul className="divide-y">
            {data.chapters.map((c) => (
              <li key={c.chapter.id}>
                <button
                  type="button"
                  onClick={() => set({ chapterId: c.chapter.id })}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-4 py-3 text-left hover:bg-muted/40 sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium" lang="as">{c.chapter.number}. {c.chapter.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.chapter.subject.medium.name} · {c.chapter.subject.classLevel.name} · {c.chapter.subject.name}
                    </span>
                  </span>
                  <span className="w-16 text-right tabular-nums">
                    {c.attempts}
                    <span className="block text-xs text-muted-foreground sm:hidden">attempts</span>
                  </span>
                  <span className="col-span-2 sm:col-span-1"><RateBar rate={c.passRate} /></span>
                  <span className="hidden w-16 text-right tabular-nums sm:block">{c.averageScore ?? "—"}</span>
                </button>
              </li>
            ))}
          </ul>
          {data.chapters.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">No chapter quizzes taken for these filters yet.</p>}
        </Card>
      )}

      {data && !chapterId && data.quizzes.length > 0 && (
        <Card className={`${formCard} gap-0 py-0`}>
          <div className="border-b px-4 py-3">
            <p className="font-heading font-bold">Custom quizzes</p>
            <p className="text-xs text-muted-foreground">Quizzes built in the Quiz builder. Open one to see its attempts.</p>
          </div>
          <ul className="divide-y">
            {data.quizzes.map((q) => (
              <li key={q.quiz.id}>
                <Link
                  href={`/quizzes/attempts?quizId=${q.quiz.id}&range=${params.get("range") ?? "30d"}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-4 py-3 hover:bg-muted/40 sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{q.quiz.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {q.quiz.medium.name} · {q.quiz.classLevel.name}
                      {!q.quiz.isPublished && " · unpublished"}
                    </span>
                  </span>
                  <span className="w-16 text-right tabular-nums">
                    {q.attempts}
                    <span className="block text-xs text-muted-foreground sm:hidden">attempts</span>
                  </span>
                  <span className="col-span-2 sm:col-span-1"><RateBar rate={q.passRate} /></span>
                  <span className="hidden w-16 text-right tabular-nums sm:block">{q.averageScore ?? "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && chapterId && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground" onClick={() => set({ chapterId: null })}>
              <ArrowLeftIcon /> All chapters
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href={`/quizzes/attempts?chapterId=${chapterId}&range=${params.get("range") ?? "30d"}`}><ListIcon /> This chapter&apos;s attempts</Link>
            </Button>
          </div>

          {selected ? (
            <Card className={cn(formCard, "gap-3 p-5")}>
              <div>
                <p className="font-heading text-xl font-bold" lang="as">{selected.chapter.number}. {selected.chapter.title}</p>
                <p className="text-sm text-muted-foreground">
                  {selected.chapter.subject.medium.name} · {selected.chapter.subject.classLevel.name} · {selected.chapter.subject.name}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span><strong className="tabular-nums">{selected.attempts}</strong> attempts</span>
                <span><strong className="tabular-nums">{selected.passed}</strong> passed · <strong className="tabular-nums">{selected.failed}</strong> failed</span>
                <span className="flex items-center gap-2">pass rate <RateBar rate={selected.passRate} /></span>
                <span>avg score <strong className="tabular-nums">{selected.averageScore ?? "—"}</strong></span>
              </div>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">No attempts on this chapter in the selected range.</p>
          )}

          <div>
            <h2 className="font-heading text-lg font-bold">Questions, hardest first</h2>
            <p className="text-sm text-muted-foreground">Accuracy over every time a question was asked in this range. Questions never asked are listed last.</p>
          </div>

          {data.questions && data.questions.length > 0 ? (
            <ol className="grid gap-3">
              {data.questions.map((q) => {
                const subjectId = selected?.chapter.subject.id;
                return (
                  <li key={q.questionId}>
                    <Card className={cn(formCard, "gap-3 p-4 sm:p-5")}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <RichView html={q.question} className="font-medium" />
                          <div className="flex flex-wrap gap-1.5">
                            {q.options.map((opt, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                                  i === q.correctIndex && "border-success/40 bg-success/10",
                                  q.mostPickedWrong?.index === i && "border-destructive/40 bg-destructive/10"
                                )}
                              >
                                <strong>{LETTERS[i]}</strong>
                                <RichView html={opt} className="min-w-0 truncate" />
                                {q.mostPickedWrong?.index === i && <span className="text-destructive">· picked {q.mostPickedWrong.count}×</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-row items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                          <RateBar rate={q.accuracy} />
                          <span className="text-xs text-muted-foreground tabular-nums">{q.correct}/{q.asked} correct</span>
                          {q.timedOut > 0 && (
                            <span className="flex items-center gap-1 text-xs text-warning tabular-nums"><TimerIcon className="size-3" /> {q.timedOut} timed out</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!q.isPublished && <Badge variant="outline" className="text-muted-foreground">Unpublished</Badge>}
                        {!q.useInQuiz && <Badge variant="outline" className="text-muted-foreground">Practice only</Badge>}
                        {q.mostPickedWrong && q.asked >= 5 && q.accuracy !== null && q.accuracy < 40 && (
                          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Check the answer key</Badge>
                        )}
                        {subjectId && (
                          <Link
                            href={`/catalog/subjects/${subjectId}/chapters/${chapterId}?tab=mcq`}
                            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            <PencilIcon className="size-3" /> Edit MCQs
                          </Link>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">This chapter has no MCQs.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuizStatsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <StatsView />
    </Suspense>
  );
}
