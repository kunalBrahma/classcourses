"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShuffleIcon,
  Trash2Icon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { ScopeFilters, useFilterParams } from "@/components/admin/quiz/filters";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatIst, QuizRow, REVEAL_LABEL, SCHEDULE_STATUS } from "@/lib/quiz";
import { cn } from "@/lib/utils";

type Counts = Record<"all" | "LIVE" | "DRAFT" | "SCHEDULED" | "CLOSED" | "ATTENTION", number>;

const TABS: { value: keyof Counts; label: string }[] = [
  { value: "all", label: "All" },
  { value: "LIVE", label: "Live" },
  { value: "DRAFT", label: "Drafts" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "CLOSED", label: "Closed" },
  { value: "ATTENTION", label: "Needs attention" },
];

function QuizCard({ quiz, onChanged }: { quiz: QuizRow; onChanged: () => void }) {
  const confirm = useConfirm();
  const st = SCHEDULE_STATUS[quiz.status];
  const r = quiz.rules;

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
      onChanged();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const togglePublish = () =>
    act(() => apiJson(`/api/admin/quizzes/${quiz.id}`, { method: "PATCH", json: { isPublished: !quiz.isPublished } }), quiz.isPublished ? "Quiz unpublished" : "Quiz published");

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${quiz.title}"?`,
      description: quiz.stats?.attempts
        ? `Students took it ${quiz.stats.attempts} time(s). Their results stay in Attempts, but nobody can take it again.`
        : "Nobody has taken it yet.",
      confirmLabel: "Delete quiz",
      destructive: true,
    });
    if (ok) await act(() => apiJson(`/api/admin/quizzes/${quiz.id}`, { method: "DELETE" }), "Quiz deleted");
  };

  return (
    <Card className={cn(formCard, "gap-3 p-4 sm:p-5")}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            quiz.pickMode === "FIXED" ? "bg-brand-amber/15 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"
          )}
          aria-hidden="true"
        >
          {quiz.pickMode === "FIXED" ? <ListChecksIcon className="size-5" /> : <ShuffleIcon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/quizzes/manage/${quiz.id}`} className="font-heading text-base font-bold hover:underline">
              {quiz.title}
            </Link>
            <Badge variant="outline" className={st.className}>{st.label}</Badge>
            {!quiz.readiness.ready && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                <AlertTriangleIcon /> Not ready
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {quiz.medium.name} · {quiz.classLevel.name} · shown on the {quiz.placement.label} · {quiz.chapterIds.length} chapter
            {quiz.chapterIds.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm">
            {quiz.pickMode === "FIXED" ? `${r.count} hand-picked questions` : `${r.count} random questions (from ${quiz.readiness.poolSize})`} · {r.secondsPerQuestion} s each ·
            pass {r.passMark} · {r.coinsPerPass} coins
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {REVEAL_LABEL[quiz.answerReveal]}
            {quiz.maxAttemptsPerStudent && ` · ${quiz.maxAttemptsPerStudent} attempt${quiz.maxAttemptsPerStudent === 1 ? "" : "s"} per student`}
            {quiz.availableFrom && ` · opens ${formatIst(quiz.availableFrom)}`}
            {quiz.availableUntil && ` · closes ${formatIst(quiz.availableUntil)}`}
          </p>
          {quiz.readiness.problems.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-destructive">
              {quiz.readiness.problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="font-heading text-xl font-bold tabular-nums">{quiz.stats?.attempts ?? 0}</p>
          <p className="text-xs text-muted-foreground">attempts{quiz.stats?.passRate != null && ` · ${quiz.stats.passRate}% pass`}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`Actions for ${quiz.title}`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/quizzes/manage/${quiz.id}`}>
                <PencilIcon /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={togglePublish} disabled={!quiz.isPublished && !quiz.readiness.ready}>
              {quiz.isPublished ? <EyeOffIcon /> : <EyeIcon />} {quiz.isPublished ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => act(() => apiJson(`/api/admin/quizzes/${quiz.id}/duplicate`, { method: "POST" }), "Copy created as a draft")}>
              <CopyIcon /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/quizzes/attempts?quizId=${quiz.id}&range=all`}>
                <ListChecksIcon /> View attempts
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={remove}>
              <Trash2Icon /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function QuizList() {
  const { params, set } = useFilterParams();
  const status = (params.get("status") ?? "all") as keyof Counts;
  const query = params.get("q") ?? "";
  const [search, setSearch] = useState(query);
  const [data, setData] = useState<{ quizzes: QuizRow[]; counts: Counts } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => set({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const key = params.toString();
  const load = useCallback(() => {
    const p = new URLSearchParams(key);
    const q = new URLSearchParams();
    for (const k of ["mediumId", "classId", "subjectId", "status"]) {
      const v = p.get(k);
      if (v) q.set(k, v);
    }
    if (p.get("q")) q.set("search", p.get("q")!);
    return apiJson<{ quizzes: QuizRow[]; counts: Counts }>(`/api/admin/quizzes?${q.toString()}`)
      .then((res) => (setData(res), setError(null)))
      .catch((err: ApiError) => setError(err.message));
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quiz builder"
        description="Every chapter already has its own quiz — you don't need to build those. Build one here only when you want a test across chapters or subjects, hand-picked questions, or different rules."
        actions={
          <Button asChild className={pressable}>
            <Link href="/quizzes/manage/new">
              <PlusIcon /> New quiz
            </Link>
          </Button>
        }
      />

      <ScopeFilters showRange={false} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => set({ status: v === "all" ? null : v })}>
          <TabsList className="h-auto flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="h-9 px-3">
                {t.label}
                {data && <span className="ml-1 text-xs text-muted-foreground tabular-nums">{data.counts[t.value]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quiz titles" aria-label="Search quizzes" className="h-10 pl-9" />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!data && !error && <Skeleton className="h-64 rounded-2xl" />}
      {data && data.quizzes.length === 0 && (
        <div className="rounded-2xl border border-dashed px-4 py-14 text-center">
          <p className="font-heading text-lg font-bold">{data.counts.all === 0 ? "No custom quizzes yet" : "No quizzes match"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {data.counts.all === 0
              ? "Chapter quizzes already work automatically. Build one when you want a test across chapters or subjects, hand-picked questions, or different rules."
              : "Try another tab or clear the filters."}
          </p>
          {data.counts.all === 0 && (
            <Button asChild className={cn(pressable, "mt-5")}>
              <Link href="/quizzes/manage/new">
                <PlusIcon /> Build your first quiz
              </Link>
            </Button>
          )}
        </div>
      )}
      {data && data.quizzes.length > 0 && (
        <div className="grid gap-3 xl:grid-cols-2">
          {data.quizzes.map((q) => (
            <QuizCard key={q.id} quiz={q} onChanged={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuizBuilderListPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <QuizList />
    </Suspense>
  );
}
