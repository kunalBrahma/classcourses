"use client";

import { useState } from "react";
import { CheckIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { DifficultyBadge } from "@/components/chapter/difficulty-badge";
import { ApiError, publicJson } from "@/lib/api";
import type { McqItem } from "@/lib/server-api";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEF";

type Result = { picked: number; correct: boolean; correctIndex: number; explanation: string | null };

// Practice MCQ: tap an option and the server says if it's right (answers are
// never sent with the page, because quizzes reuse these questions).
function Mcq({ item, index }: { item: McqItem; index: number }) {
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (optionIndex: number) => {
    if (result || checking !== null) return;
    setChecking(optionIndex);
    setError(null);
    try {
      const r = await publicJson<Omit<Result, "picked">>(`/api/catalog/questions/${item.id}/check`, {
        method: "POST",
        json: { optionIndex },
      });
      setResult({ ...r, picked: optionIndex });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setChecking(null);
    }
  };

  return (
    <li className="card-3d rounded-xl p-4 sm:p-5">
      <div role="group" aria-labelledby={`mcq-${item.id}`}>
        <div className="flex w-full items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-lg bg-accent px-2 py-0.5 font-heading text-sm font-extrabold tabular-nums text-brand-amber-text">
            Q{index + 1}
          </span>
          <div id={`mcq-${item.id}`} className="rich min-w-0 flex-1 font-semibold" lang="as" dangerouslySetInnerHTML={{ __html: item.question }} />
          <DifficultyBadge value={item.difficulty} />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {item.options.map((option, i) => {
            const isPicked = result?.picked === i;
            const isAnswer = result?.correctIndex === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                disabled={result !== null || checking !== null}
                aria-pressed={isPicked}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border-2 bg-card px-3 py-2 text-left transition",
                  !result && "hover:border-brand-amber hover:bg-accent active:scale-[0.99] disabled:cursor-wait",
                  result && "cursor-default",
                  isAnswer && "border-success bg-success/10",
                  isPicked && !result?.correct && "border-destructive bg-destructive/10",
                  result && !isAnswer && !isPicked && "opacity-60"
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg border font-heading text-sm font-extrabold",
                    isAnswer ? "border-success bg-success text-white" : isPicked ? "border-destructive bg-destructive text-white" : "bg-accent text-brand-amber-text"
                  )}
                  aria-hidden="true"
                >
                  {checking === i ? <Loader2Icon className="size-4 animate-spin" /> : isAnswer ? <CheckIcon className="size-4" /> : isPicked ? <XIcon className="size-4" /> : LETTERS[i]}
                </span>
                <span className="rich min-w-0 flex-1" lang="as" dangerouslySetInnerHTML={{ __html: option }} />
                <span className="sr-only">{isAnswer ? "(correct answer)" : isPicked ? "(your answer, wrong)" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div aria-live="polite">
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {result && (
          <div className={cn("mt-3 rounded-xl px-4 py-3", result.correct ? "bg-success/10" : "bg-destructive/10")}>
            <p className={cn("font-heading font-extrabold", result.correct ? "text-success" : "text-destructive")}>
              {result.correct ? "Correct! Well done." : `Not quite. The answer is ${LETTERS[result.correctIndex]}.`}
            </p>
            {result.explanation && <div className="rich mt-1 text-[15px]" lang="as" dangerouslySetInnerHTML={{ __html: result.explanation }} />}
            <button
              type="button"
              onClick={() => setResult(null)}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-brand-amber-text hover:underline"
            >
              <RotateCcwIcon className="size-4" aria-hidden="true" /> Try again
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function McqPractice({ items }: { items: McqItem[] }) {
  return (
    <ol className="grid gap-4">
      {items.map((item, i) => (
        <Mcq key={item.id} item={item} index={i} />
      ))}
    </ol>
  );
}
