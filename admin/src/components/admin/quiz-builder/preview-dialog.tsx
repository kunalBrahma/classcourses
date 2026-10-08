"use client";

import { useEffect, useState } from "react";
import { CheckIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichView } from "@/components/admin/editor/rich-text-editor";
import { ApiError, apiJson } from "@/lib/api";
import { LETTERS } from "@/lib/content";
import { LEVELS, QuizRules } from "@/lib/quiz";
import { cn } from "@/lib/utils";

interface Sample {
  questions: {
    id: string;
    question: string;
    options: string[];
    correctIndex: number | null;
    source: "TEXTBOOK" | "EXTRA";
    difficulty: string | null;
    chapter: { number: number; title: string; subject: { name: string } };
  }[];
  rules: QuizRules;
}

// One example attempt, drawn exactly like a student's (random pick, shuffles).
export function PreviewDialog({ open, onOpenChange, body }: { open: boolean; onOpenChange: (open: boolean) => void; body: object }) {
  const [sample, setSample] = useState<Sample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const key = JSON.stringify(body);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the previous draw while loading
    setSample(null);
    apiJson<Sample>("/api/admin/quizzes/preview", { method: "POST", json: JSON.parse(key) })
      .then((s) => !cancelled && (setSample(s), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [open, key, round]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Sample attempt</DialogTitle>
          <DialogDescription>
            {sample
              ? `${sample.rules.count} questions · ${sample.rules.secondsPerQuestion} s each · pass ${sample.rules.passMark}. Every student gets a draw like this one.`
              : "Drawing questions…"}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!sample && !error && (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Loading…
          </p>
        )}
        {sample && (
          <ol className="grid gap-3">
            {sample.questions.map((q, i) => (
              <li key={q.id} className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <RichView html={q.question} className="font-medium" />
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {q.options.map((o, oi) => (
                        <li key={oi} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm", oi === q.correctIndex && "border-success/40 bg-success/10")}>
                          <strong className="text-xs">{LETTERS[oi]}</strong>
                          <RichView html={o} className="min-w-0 flex-1" />
                          {oi === q.correctIndex && <CheckIcon className="size-4 shrink-0 text-success" />}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {q.chapter.subject.name} · Ch {q.chapter.number}
                      </span>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{q.source === "TEXTBOOK" ? "Textbook" : "Extra"}</Badge>
                      {q.difficulty && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{LEVELS.find((l) => l.value === q.difficulty)?.label}</Badge>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="h-10" onClick={() => setRound((r) => r + 1)} disabled={!sample}>
            <RefreshCwIcon /> Draw again
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
