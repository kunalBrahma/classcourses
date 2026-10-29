"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckCircle2Icon, PlusIcon, ShuffleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { QuizRow, QuizRules, Readiness, SCHEDULE_STATUS } from "@/lib/quiz";
import { cn } from "@/lib/utils";

interface Overview {
  auto: { enabledGlobally: boolean; enabled: boolean; quizMarked: number; rules: QuizRules; readiness: Readiness };
  quizzes: QuizRow[];
}

// The chapter page's MCQs tab: this chapter's automatic quiz and every custom
// quiz that uses it. refreshKey changes whenever the MCQs change.
export function ChapterQuizPanel({ chapterId, refreshKey }: { chapterId: string; refreshKey: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiJson<Overview>(`/api/admin/chapters/${chapterId}/quiz-overview`)
      .then((d) => !cancelled && setData(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chapterId, refreshKey]);

  if (!data) return null;
  const { auto } = data;
  const live = auto.enabledGlobally && auto.enabled;

  const toggleAuto = async (autoQuiz: boolean) => {
    setBusy(true);
    setData((d) => (d ? { ...d, auto: { ...d.auto, enabled: autoQuiz } } : d));
    try {
      await apiJson(`/api/admin/chapters/${chapterId}`, { method: "PATCH", json: { autoQuiz } });
      toast.success(autoQuiz ? "Automatic quiz switched on" : "Automatic quiz switched off for this chapter");
    } catch (err) {
      toast.error((err as ApiError).message);
      setData((d) => (d ? { ...d, auto: { ...d.auto, enabled: !autoQuiz } } : d));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cn(formCard, "gap-0 py-0")}>
      <div className="flex flex-wrap items-start gap-4 border-b px-4 py-4 sm:px-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-brand-amber-text">
          <ShuffleIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold">Automatic chapter quiz</p>
          <p className="text-sm text-muted-foreground">
            {auto.rules.count} random MCQs marked <strong>In quiz</strong>, {auto.rules.secondsPerQuestion} s each, pass {auto.rules.passMark}. Nothing to build.
          </p>
          {!auto.enabledGlobally ? (
            <p className="mt-2 text-sm text-warning">
              Switched off for the whole site in <Link href="/settings/quiz" className="underline">Settings → Quiz &amp; coins</Link>.
            </p>
          ) : !auto.enabled ? (
            <p className="mt-2 text-sm text-muted-foreground">Off for this chapter — students only see the custom quizzes below.</p>
          ) : auto.readiness.ready ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2Icon className="size-4" /> Ready — {auto.quizMarked} MCQs in quiz, each attempt uses {auto.rules.count}.
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-warning">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                Not ready: {auto.quizMarked} MCQs marked In quiz, needs {auto.rules.count}. Add or mark {auto.rules.count - auto.quizMarked} more and it switches on by itself.
              </span>
            </p>
          )}
          {live && auto.readiness.warnings.map((w) => <p key={w} className="mt-1 text-xs text-muted-foreground">ⓘ {w}</p>)}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{auto.enabled ? "On" : "Off"}</span>
          <Switch checked={auto.enabled} disabled={busy || !auto.enabledGlobally} onCheckedChange={toggleAuto} aria-label="Automatic quiz for this chapter" />
        </label>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-heading font-bold">Custom quizzes using this chapter</p>
            <p className="text-sm text-muted-foreground">Your own rules, hand-picked questions, tests across chapters.</p>
          </div>
          <Button asChild variant="outline" className="h-9">
            <Link href={`/quizzes/manage/new?chapterId=${chapterId}`}>
              <PlusIcon /> New quiz from this chapter
            </Link>
          </Button>
        </div>
        {data.quizzes.length > 0 && (
          <ul className="mt-3 divide-y rounded-xl border">
            {data.quizzes.map((q) => (
              <li key={q.id}>
                <Link href={`/quizzes/manage/${q.id}`} className="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-muted/40">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {q.rules.count} Qs · {q.chapterIds.length} chapter{q.chapterIds.length === 1 ? "" : "s"}
                  </span>
                  <Badge variant="outline" className={SCHEDULE_STATUS[q.status].className}>{SCHEDULE_STATUS[q.status].label}</Badge>
                  {!q.readiness.ready && <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Not ready</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
