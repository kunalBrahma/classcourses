"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { ScopeFilters, useFilterParams } from "@/components/admin/quiz/filters";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate, QUIZ_STATUS } from "@/lib/people";
import { attemptScope, attemptTitle, AttemptsPage, rangeToDays } from "@/lib/quiz";
import { cn } from "@/lib/utils";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className={cn(formCard, "gap-1 px-4 py-3")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-heading text-2xl font-bold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}

function AttemptsList() {
  const { params, set } = useFilterParams();
  const status = params.get("status") ?? "all";
  const query = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(query);
  const [data, setData] = useState<AttemptsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => set({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const key = params.toString();
  useEffect(() => {
    const p = new URLSearchParams(key);
    const q = new URLSearchParams({ page: String(page), pageSize: "25", ...rangeToDays(p.get("range") ?? "30d") });
    if (status !== "all") q.set("status", status);
    if (query) q.set("search", query);
    for (const k of ["mediumId", "classId", "subjectId", "chapterId", "userId", "quizId"]) {
      const v = p.get(k);
      if (v) q.set(k, v);
    }
    let cancelled = false;
    apiJson<AttemptsPage>(`/api/admin/quiz/attempts?${q.toString()}`)
      .then((res) => !cancelled && (setData(res), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [key, page, status, query]);

  const s = data?.summary;
  const goPage = (n: number) => set({ page: String(n) });

  return (
    <div className="space-y-6">
      <PageHeader title="Quiz attempts" description="Every chapter quiz students have started. Open one to see each question, what they chose and the right answer." />

      <ScopeFilters />
      {params.get("quizId") && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Showing one quiz{data?.attempts[0] ? ` (${attemptTitle(data.attempts[0])})` : ""}.
          <Button variant="link" className="h-auto p-0" onClick={() => set({ quizId: null })}>Show all quizzes</Button>
        </p>
      )}
      {params.get("userId") && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Showing one student&apos;s attempts{data?.attempts[0] ? ` (${data.attempts[0].user.name || data.attempts[0].user.email})` : ""}.
          <Button variant="link" className="h-auto p-0" onClick={() => set({ userId: null })}>Show everyone</Button>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Attempts" value={s ? s.attempts.toLocaleString("en-IN") : "—"} />
        <Stat label="Pass rate" value={s?.passRate != null ? `${s.passRate}%` : "—"} hint={s ? `${s.passed} passed · ${s.failed} failed` : undefined} />
        <Stat label="Average score" value={s?.averageScore != null ? String(s.averageScore) : "—"} hint="finished quizzes" />
        <Stat label="Unfinished" value={s ? String(s.unfinished) : "—"} hint={s ? `${s.expired} expired` : undefined} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => set({ status: v === "all" ? null : v })}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="all" className="h-9 px-3">All</TabsTrigger>
            <TabsTrigger value="PASSED" className="h-9 px-3">Passed</TabsTrigger>
            <TabsTrigger value="FAILED" className="h-9 px-3">Failed</TabsTrigger>
            <TabsTrigger value="UNFINISHED" className="h-9 px-3">Unfinished</TabsTrigger>
            <TabsTrigger value="EXPIRED" className="h-9 px-3">Expired</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student name or email" aria-label="Search student" className="h-10 pl-9" />
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!data && !error && <Skeleton className="h-80 rounded-2xl" />}

      {data && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {data.attempts.map((a) => {
              const st = QUIZ_STATUS[a.status];
              return (
                <li key={a.id}>
                  <Link href={`/quizzes/attempts/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{a.user.name || a.user.email}</span>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", st.className)}>{st.label}</Badge>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground" lang="as">
                        <span className={cn("font-medium", a.quizId || a.quizTitle ? "text-primary" : "text-foreground/80")}>{attemptTitle(a)}</span> · {attemptScope(a)}
                      </span>
                      <span className="block text-xs text-muted-foreground">{formatDate(a.startedAt, true)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-heading text-lg font-bold tabular-nums">
                        {a.score}<span className="text-sm font-normal text-muted-foreground">/{a.totalQuestions}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {a.answered < a.totalQuestions ? `${a.answered} answered` : `pass ${a.passMark}`}
                        {a.coinsAwarded > 0 && ` · +${a.coinsAwarded}`}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {data.attempts.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">No quiz attempts match these filters.</p>}
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">{data.total.toLocaleString("en-IN")} attempt{data.total === 1 ? "" : "s"}</span>
            {data.totalPages > 1 && (
              <span className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label="Previous page"><ChevronLeftIcon /></Button>
                <span className="tabular-nums">{page} / {data.totalPages}</span>
                <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => goPage(page + 1)} aria-label="Next page"><ChevronRightIcon /></Button>
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function QuizAttemptsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AttemptsList />
    </Suspense>
  );
}
