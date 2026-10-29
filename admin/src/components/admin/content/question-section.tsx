"use client";

import { toast } from "sonner";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TargetIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { useConfirm } from "@/components/admin/confirm";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";
import { LETTERS, Question, QuestionKind, QuestionSource, toText } from "@/lib/content";
import { cn } from "@/lib/utils";

const DIFFICULTY: Record<string, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

export function QuestionSection({
  title,
  hint,
  source,
  kind,
  questions,
  chapterId,
  onAdd,
  onEdit,
  onChanged,
  setQuestions,
}: {
  title: string;
  hint: string;
  source: QuestionSource;
  kind: QuestionKind;
  questions: Question[];
  chapterId: string;
  onAdd: () => void;
  onEdit: (q: Question) => void;
  onChanged: () => void;
  setQuestions: (update: (all: Question[]) => Question[]) => void;
}) {
  const confirm = useConfirm();

  const reorder = async (index: number, direction: -1 | 1) => {
    const next = move(questions, index, direction);
    const order = new Map(next.map((q, i) => [q.id, i]));
    setQuestions((all) => all.map((q) => (order.has(q.id) ? { ...q, order: order.get(q.id)! } : q)));
    try {
      await apiJson(`/api/admin/chapters/${chapterId}/questions/reorder`, { method: "PUT", json: { source, kind, ids: next.map((q) => q.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      onChanged();
    }
  };

  const togglePublish = async (q: Question, isPublished: boolean) => {
    setQuestions((all) => all.map((x) => (x.id === q.id ? { ...x, isPublished } : x)));
    try {
      await apiJson(`/api/admin/questions/${q.id}`, { method: "PATCH", json: { isPublished } });
    } catch (err) {
      toast.error((err as ApiError).message);
      onChanged();
    }
  };

  // MCQs: may this question appear in quizzes? (off = practice on the chapter page only)
  const setInQuiz = async (ids: string[], useInQuiz: boolean) => {
    if (!ids.length) return;
    const set = new Set(ids);
    setQuestions((all) => all.map((x) => (set.has(x.id) ? { ...x, useInQuiz } : x)));
    try {
      await apiJson(`/api/admin/chapters/${chapterId}/questions/quiz-flag`, { method: "POST", json: { ids, useInQuiz } });
      if (ids.length > 1) toast.success(useInQuiz ? `${ids.length} MCQs will be used in quizzes` : `${ids.length} MCQs set to practice only`);
    } catch (err) {
      toast.error((err as ApiError).message);
    }
    onChanged();
  };
  const isMcq = kind === "MCQ";
  const inQuiz = questions.filter((q) => q.useInQuiz).length;

  const remove = async (q: Question, index: number) => {
    if (!(await confirm({ title: `Delete question ${index + 1}?`, description: toText(q.question).slice(0, 140), confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/questions/${q.id}`, { method: "DELETE" });
      toast.success("Question deleted");
      onChanged();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <Card className={`${formCard} gap-0 py-0`}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold">
            {title} <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{questions.length}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {hint}
            {isMcq && questions.length > 0 && ` · ${inQuiz} of ${questions.length} in quiz`}
          </p>
        </div>
        {isMcq && questions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-9">
                <TargetIcon /> <span className="hidden sm:inline">Quiz</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setInQuiz(questions.filter((q) => !q.useInQuiz).map((q) => q.id), true)}>Use all in quizzes</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setInQuiz(questions.filter((q) => q.useInQuiz).map((q) => q.id), false)}>Set all to practice only</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="outline" size="sm" className="h-9" onClick={onAdd}>
          <PlusIcon /> Add
        </Button>
      </div>
      <ol className="divide-y">
        {questions.map((q, index) => {
          const text = toText(q.question) || (q.question.includes("<img") ? "[image]" : "(empty)");
          const detail =
            q.kind === "MCQ" && q.options && q.correctIndex !== null
              ? `✓ ${LETTERS[q.correctIndex]}. ${toText(q.options[q.correctIndex])}`
              : toText(q.answer);
          return (
            <li key={q.id} className={cn("flex items-start gap-1.5 px-2 py-2.5 sm:gap-3 sm:px-4", !q.isPublished && "bg-muted/40")}>
              <ReorderButtons index={index} count={questions.length} onMove={(d) => reorder(index, d)} label={`question ${index + 1}`} />
              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold tabular-nums text-secondary-foreground">
                {index + 1}
              </span>
              <button type="button" onClick={() => onEdit(q)} className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left hover:bg-muted/50">
                <span className="line-clamp-2 text-sm font-medium" lang="as">
                  {text}
                </span>
                <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground" lang="as">
                  {detail}
                </span>
                {(!q.isPublished || q.difficulty || q.explanation) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {!q.isPublished && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Draft</Badge>}
                    {q.difficulty && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{DIFFICULTY[q.difficulty]}</Badge>}
                    {q.explanation && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Explanation</Badge>}
                  </span>
                )}
              </button>
              {isMcq && (
                <button
                  type="button"
                  onClick={() => setInQuiz([q.id], !q.useInQuiz)}
                  aria-pressed={q.useInQuiz}
                  title={q.useInQuiz ? "Can appear in quizzes — click for practice only" : "Practice only — click to use in quizzes"}
                  className={cn(
                    "mt-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
                    q.useInQuiz ? "border-primary/30 bg-primary/10 text-brand-amber-text" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <TargetIcon className="size-3.5" />
                  <span className="sm:hidden">{q.useInQuiz ? "Quiz" : "Practice"}</span>
                  <span className="hidden sm:inline">{q.useInQuiz ? "In quiz" : "Practice only"}</span>
                </button>
              )}
              <Switch className="mt-1.5" checked={q.isPublished} onCheckedChange={(v) => togglePublish(q, v)} aria-label={`Question ${index + 1} published`} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for question ${index + 1}`}>
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onEdit(q)}>
                    <PencilIcon /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => remove(q, index)}>
                    <Trash2Icon /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
        {questions.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            None yet —{" "}
            <button type="button" className="font-medium text-brand-amber-text hover:underline" onClick={onAdd}>
              add one
            </button>{" "}
            or use <strong>Import</strong>.
          </li>
        )}
      </ol>
    </Card>
  );
}
