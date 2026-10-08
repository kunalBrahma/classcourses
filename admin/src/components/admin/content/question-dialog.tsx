"use client";

import { FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/admin/editor/rich-text-editor";
import { pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { Difficulty, LETTERS, Question, QuestionKind, QuestionSource, toText } from "@/lib/content";
import { cn } from "@/lib/utils";

export interface QuestionDialogTarget {
  question?: Question; // edit; otherwise create in source/kind
  source: QuestionSource;
  kind: QuestionKind;
}

interface Form {
  kind: QuestionKind;
  source: QuestionSource;
  question: string;
  answer: string;
  options: string[];
  correctIndex: number | null;
  explanation: string;
  difficulty: Difficulty | "NONE";
  isPublished: boolean;
  useInQuiz: boolean;
}

const toForm = (t: QuestionDialogTarget): Form => {
  const q = t.question;
  return {
    kind: q?.kind ?? t.kind,
    source: q?.source ?? t.source,
    question: q?.question ?? "",
    answer: q?.answer ?? "",
    // Options are edited as plain text; stored HTML (e.g. "x &lt; 5") is decoded for editing.
    options: q?.options?.map(toText) ?? ["", "", "", ""],
    correctIndex: q?.correctIndex ?? null,
    explanation: q?.explanation ?? "",
    difficulty: q?.difficulty ?? "NONE",
    isPublished: q?.isPublished ?? true,
    useInQuiz: q?.useInQuiz ?? true,
  };
};

// Mirrors the backend's normalizeQuestion() so problems show before saving.
const problems = (f: Form): string[] => {
  const out: string[] = [];
  if (!toText(f.question) && !f.question.includes("<img")) out.push("Write the question.");
  if (f.kind === "QA") {
    if (!toText(f.answer) && !f.answer.includes("<img")) out.push("Write the answer.");
  } else {
    const opts = f.options.map((o) => o.trim());
    if (opts.length < 2) out.push("An MCQ needs at least 2 options.");
    if (opts.some((o) => !o)) out.push("Fill in every option (or remove the empty one).");
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) out.push("Options must be different from each other.");
    if (f.correctIndex === null || f.correctIndex >= opts.length) out.push("Mark the correct option.");
  }
  return out;
};

export function QuestionDialog({
  target,
  chapterId,
  onClose,
  onSaved,
}: {
  target: QuestionDialogTarget | null;
  chapterId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState<Form | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remount the rich editors for each opening so they load the right content.
  const [editorKey, setEditorKey] = useState(0);

  const [lastTarget, setLastTarget] = useState<QuestionDialogTarget | null>(null);
  if (target !== lastTarget) {
    setLastTarget(target);
    if (target) {
      setForm(toForm(target));
      setShowProblems(false);
      setError(null);
      setEditorKey((k) => k + 1);
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target || !form) return;
    if (problems(form).length) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      kind: form.kind,
      source: form.source,
      question: form.question,
      answer: form.kind === "QA" ? form.answer : null,
      options: form.kind === "MCQ" ? form.options.map((o) => o.trim()) : null,
      correctIndex: form.kind === "MCQ" ? form.correctIndex : null,
      explanation: form.explanation || null,
      difficulty: form.difficulty === "NONE" ? null : form.difficulty,
      isPublished: form.isPublished,
      ...(form.kind === "MCQ" ? { useInQuiz: form.useInQuiz } : {}),
    };
    try {
      if (target.question) await apiJson(`/api/admin/questions/${target.question.id}`, { method: "PATCH", json: body });
      else await apiJson(`/api/admin/chapters/${chapterId}/questions`, { method: "POST", json: body });
      toast.success(target.question ? "Question saved" : "Question added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const list = form ? problems(form) : [];

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {form && (
          <form onSubmit={submit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {target?.question ? "Edit" : "New"} {form.kind === "MCQ" ? "MCQ" : "question-answer"}
              </DialogTitle>
              <DialogDescription>Use the toolbar for H₂O-style subscripts, x² superscripts, lists and images.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor={`${id}-kind`}>Type</Label>
                <Select value={form.kind} onValueChange={(v) => set("kind", v as QuestionKind)}>
                  <SelectTrigger id={`${id}-kind`} className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QA">Question-answer</SelectItem>
                    <SelectItem value="MCQ">MCQ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-source`}>Section</Label>
                <Select value={form.source} onValueChange={(v) => set("source", v as QuestionSource)}>
                  <SelectTrigger id={`${id}-source`} className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXTBOOK">Textbook</SelectItem>
                    <SelectItem value="EXTRA">Extra (advanced)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-difficulty`}>Difficulty</Label>
                <Select value={form.difficulty} onValueChange={(v) => set("difficulty", v as Form["difficulty"])}>
                  <SelectTrigger id={`${id}-difficulty`} className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Not set</SelectItem>
                    <SelectItem value="EASY">Easy</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HARD">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${id}-q`}>Question</Label>
              <RichTextEditor
                key={`q-${editorKey}`}
                id={`${id}-q`}
                ariaLabel="Question"
                compact
                minHeight="4.5rem"
                value={form.question}
                onChange={(v) => set("question", v)}
                placeholder="Type the question…"
              />
            </div>

            {form.kind === "QA" ? (
              <div className="grid gap-2">
                <Label htmlFor={`${id}-a`}>Answer</Label>
                <RichTextEditor
                  key={`a-${editorKey}`}
                  id={`${id}-a`}
                  ariaLabel="Answer"
                  minHeight="8rem"
                  value={form.answer}
                  onChange={(v) => set("answer", v)}
                  placeholder="Type the answer…"
                />
              </div>
            ) : (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">
                  Options <span className="font-normal text-muted-foreground">— select the correct one</span>
                </legend>
                <div role="radiogroup" aria-label="Correct option" className="grid gap-2">
                  {form.options.map((option, i) => {
                    const correct = form.correctIndex === i;
                    return (
                      <div key={i} className={cn("flex items-center gap-2 rounded-xl border p-1.5 pl-2 transition", correct && "border-success/50 bg-success/5")}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={correct}
                          aria-label={`Option ${LETTERS[i]} is correct`}
                          onClick={() => set("correctIndex", i)}
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-lg border text-sm font-bold transition",
                            correct ? "border-success bg-success text-white" : "hover:border-success/60 hover:bg-success/10"
                          )}
                        >
                          {LETTERS[i]}
                        </button>
                        <Input
                          value={option}
                          onChange={(e) => set("options", form.options.map((o, j) => (j === i ? e.target.value : o)))}
                          placeholder={`Option ${LETTERS[i]}`}
                          aria-label={`Option ${LETTERS[i]}`}
                          lang="as"
                          className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                        />
                        {form.options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 shrink-0"
                            aria-label={`Remove option ${LETTERS[i]}`}
                            onClick={() => {
                              const options = form.options.filter((_, j) => j !== i);
                              const ci = form.correctIndex;
                              setForm({ ...form, options, correctIndex: ci === null || ci === i ? null : ci > i ? ci - 1 : ci });
                            }}
                          >
                            <XIcon />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {form.options.length < 6 && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 justify-self-start" onClick={() => set("options", [...form.options, ""])}>
                    <PlusIcon /> Add option
                  </Button>
                )}
              </fieldset>
            )}

            <div className="grid gap-2">
              <Label htmlFor={`${id}-ex`}>
                Explanation <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <RichTextEditor
                key={`e-${editorKey}`}
                id={`${id}-ex`}
                ariaLabel="Explanation"
                compact
                minHeight="3.5rem"
                value={form.explanation}
                onChange={(v) => set("explanation", v)}
                placeholder={form.kind === "MCQ" ? "Why is this the right answer? Shown after answering." : "Extra notes for students…"}
              />
            </div>

            <label htmlFor={`${id}-pub`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Published</span>
                <span className="block text-xs text-muted-foreground">Drafts are hidden from students and from quizzes.</span>
              </span>
              <Switch id={`${id}-pub`} checked={form.isPublished} onCheckedChange={(v) => set("isPublished", v)} />
            </label>

            {form.kind === "MCQ" && (
              <label htmlFor={`${id}-quiz`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold">Use in quizzes</span>
                  <span className="block text-xs text-muted-foreground">Off = practice on the chapter page only, never in a timed quiz.</span>
                </span>
                <Switch id={`${id}-quiz`} checked={form.useInQuiz} onCheckedChange={(v) => set("useInQuiz", v)} />
              </label>
            )}

            {showProblems && list.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {list.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" className="h-10" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className={pressable} disabled={busy}>
                {busy && <Loader2Icon className="animate-spin" />} {target?.question ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
