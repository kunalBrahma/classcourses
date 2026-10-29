"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  EyeIcon,
  ListChecksIcon,
  Loader2Icon,
  SearchIcon,
  ShuffleIcon,
  XIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/settings/field";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { ClassLevel, Medium, move, SubjectRow, SubjectTree } from "@/lib/catalog";
import { LETTERS, toText } from "@/lib/content";
import {
  AnswerReveal,
  bodyFromForm,
  emptyQuizForm,
  formFromQuiz,
  Level,
  LEVELS,
  PickableQuestion,
  PoolInfo,
  QuizForm,
  QuizRow,
  SCHEDULE_STATUS,
} from "@/lib/quiz";
import { cn } from "@/lib/utils";
import { PreviewDialog } from "./preview-dialog";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className={cn(formCard, "gap-5 p-5 sm:p-6")}>
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-brown font-heading text-xs font-bold text-white">{step}</span>
        <div>
          <h2 className="font-heading text-lg font-bold leading-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

// Number input where empty = "use the default" (null).
function NumberInput({
  id,
  value,
  onChange,
  placeholder,
  min,
  max,
  suffix,
  readOnly,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  suffix?: string;
  readOnly?: boolean;
}) {
  // While typing, the box may be empty; it only becomes "default" (null) when you leave it empty.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="relative">
      <Input
        id={id}
        readOnly={readOnly}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className={cn(inputClass, suffix && "pr-16")}
        value={draft ?? value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value !== "") onChange(Math.max(min ?? 0, Math.min(max ?? 100000, Math.round(Number(e.target.value)))));
        }}
        onBlur={() => {
          if (draft === "") onChange(null);
          setDraft(null);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function ToggleRow({ id, title, hint, checked, onChange, disabled }: { id: string; title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3", disabled && "cursor-not-allowed opacity-60")}>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

// Checkbox chips where "all ticked" is stored as [] (= any).
function AnyOfChips<T extends string>({ options, value, onChange, counts }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; counts?: Partial<Record<T, number>> }) {
  const isOn = (v: T) => value.length === 0 || value.includes(v);
  const toggle = (v: T) => {
    const on = options.filter((o) => isOn(o.value)).map((o) => o.value);
    const next = on.includes(v) ? on.filter((x) => x !== v) : [...on, v];
    if (next.length === 0) return; // at least one
    onChange(next.length === options.length ? [] : next);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="checkbox"
          aria-checked={isOn(o.value)}
          onClick={() => toggle(o.value)}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors",
            isOn(o.value) ? "border-primary/40 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60"
          )}
        >
          <span className={cn("grid size-4 place-items-center rounded border", isOn(o.value) && "border-primary bg-primary text-primary-foreground")}>
            {isOn(o.value) && <CheckCircle2Icon className="size-3" />}
          </span>
          {o.label}
          {counts && counts[o.value] !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{counts[o.value]}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chapter picker: every subject of the medium + class, expandable
// ---------------------------------------------------------------------------

type IdsUpdate = (update: (ids: string[]) => string[]) => void;

function ChapterPicker({ trees, value, onChange }: { trees: SubjectTree[]; value: string[]; onChange: IdsUpdate }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const selected = new Set(value);

  if (trees.length === 0) return <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">This class has no subjects in this medium yet.</p>;

  return (
    <ul className="divide-y rounded-xl border">
      {trees.map((s) => {
        const ids = s.chapters.map((c) => c.id);
        const count = ids.filter((id) => selected.has(id)).length;
        const all = count > 0 && count === ids.length;
        const isOpen = open[s.id] ?? count > 0;
        const setSubject = (on: boolean) => onChange((cur) => (on ? [...new Set([...cur, ...ids])] : cur.filter((id) => !ids.includes(id))));
        return (
          <li key={s.id}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Checkbox
                checked={all ? true : count > 0 ? "indeterminate" : false}
                onCheckedChange={(v) => setSubject(v === true)}
                aria-label={`Whole subject: ${s.name}`}
                disabled={ids.length === 0}
              />
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))} aria-expanded={isOpen}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {count === 0 ? `${ids.length} chapters` : all ? `Whole subject · ${ids.length} chapters` : `${count} of ${ids.length} chapters`}
                  </span>
                </span>
                <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>
            </div>
            {isOpen && ids.length > 0 && (
              <div className="grid gap-1 border-t bg-muted/30 px-3 py-2 sm:grid-cols-2 xl:grid-cols-3">
                {s.chapters.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-background">
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={(v) => onChange((cur) => (v === true ? [...new Set([...cur, c.id])] : cur.filter((id) => id !== c.id)))}
                    />
                    <span className="w-7 shrink-0 text-xs text-muted-foreground tabular-nums">{c.number}.</span>
                    <span className="min-w-0 truncate" lang="as">
                      {c.title}
                    </span>
                    {!c.isPublished && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">hidden</span>}
                  </label>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Hand-pick: search the chosen chapters' MCQs, tick, order
// ---------------------------------------------------------------------------

function QuestionTags({ q }: { q: PickableQuestion }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{q.source === "TEXTBOOK" ? "Textbook" : "Extra"}</Badge>
      {q.difficulty && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{LEVELS.find((l) => l.value === q.difficulty)?.label}</Badge>}
      {!q.isPublished && <Badge variant="outline" className="h-5 border-warning/40 bg-warning/10 px-1.5 text-[10px] text-warning">Unpublished — skipped</Badge>}
      {!q.useInQuiz && <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">Practice only</Badge>}
    </span>
  );
}

function HandPicker({ questions, loading, value, onChange }: { questions: PickableQuestion[]; loading: boolean; value: string[]; onChange: IdsUpdate }) {
  const [search, setSearch] = useState("");
  const [showPicked, setShowPicked] = useState(true);
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const picked = new Set(value);
  const term = search.trim().toLowerCase();
  const visible = term ? questions.filter((q) => toText(q.question).toLowerCase().includes(term)) : questions;

  // Group by chapter for scanning.
  const groups: { key: string; label: string; items: PickableQuestion[] }[] = [];
  for (const q of visible) {
    const label = `${q.chapter.subject.name} · Chapter ${q.chapter.number}`;
    const g = groups.find((x) => x.key === q.chapterId);
    if (g) g.items.push(q);
    else groups.push({ key: q.chapterId, label, items: [q] });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_minmax(0,380px)]">
      <div className="min-w-0 rounded-xl border">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions" aria-label="Search questions" className="h-10 pl-9" />
          </div>
          <Button type="button" variant="outline" className="h-10" onClick={() => onChange((cur) => [...new Set([...cur, ...visible.filter((q) => q.isPublished).map((q) => q.id)])])} disabled={!visible.length}>
            Pick all {term ? "shown" : ""}
          </Button>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {loading && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading questions…</p>}
          {!loading && questions.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">The chosen chapters have no MCQs yet. Add them on each chapter&apos;s MCQs tab.</p>}
          {!loading && questions.length > 0 && visible.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No question matches “{search}”.</p>}
          {groups.map((g) => (
            <div key={g.key}>
              <p className="sticky top-0 z-10 border-b bg-muted/80 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">{g.label}</p>
              <ul className="divide-y">
                {g.items.map((q) => (
                  <li key={q.id}>
                    <label className={cn("flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40", picked.has(q.id) && "bg-primary/5")}>
                      <Checkbox
                        className="mt-1"
                        checked={picked.has(q.id)}
                        onCheckedChange={(v) => onChange((cur) => (v === true ? [...new Set([...cur, q.id])] : cur.filter((id) => id !== q.id)))}
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="line-clamp-2 block text-sm font-medium">{toText(q.question)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          Answer: {LETTERS[q.correctIndex]}. {toText(q.options[q.correctIndex])}
                        </span>
                        <QuestionTags q={q} />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 rounded-xl border">
        <button type="button" className="flex w-full items-center justify-between gap-2 border-b px-4 py-3 text-left" onClick={() => setShowPicked((v) => !v)} aria-expanded={showPicked}>
          <span>
            <span className="block text-sm font-semibold">Picked: {value.length}</span>
            <span className="block text-xs text-muted-foreground">Students get them in this order unless you shuffle.</span>
          </span>
          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform xl:hidden", showPicked && "rotate-180")} />
        </button>
        <ol className={cn("max-h-[520px] divide-y overflow-y-auto", !showPicked && "hidden xl:block")}>
          {value.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Tick questions on the left.</li>}
          {value.map((id, i) => {
            const q = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 px-2 py-2">
                <ReorderButtons index={i} count={value.length} onMove={(d) => onChange((cur) => move(cur, i, d))} label={q ? toText(q.question) : "question"} />
                <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                <span className={cn("min-w-0 flex-1 truncate text-sm", q && !q.isPublished && "text-muted-foreground line-through")}>{q ? toText(q.question) : "Question not in the chosen chapters"}</span>
                <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Remove" onClick={() => onChange((cur) => cur.filter((x) => x !== id))}>
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

const REVEALS: { value: AnswerReveal; title: string; hint: string; short: string }[] = [
  { value: "AFTER_EACH", title: "After each question", hint: "Students see if they were right straight away. Best for practice.", short: "answers after each question" },
  { value: "AT_END", title: "At the end", hint: "Nothing during the quiz; a full review after the last question. Best for tests.", short: "answers at the end" },
  { value: "NEVER", title: "Never", hint: "Only the final score. For strict tests you want to reuse.", short: "answers never shown" },
];

export function QuizBuilder({ quiz, prefill }: { quiz?: QuizRow; prefill?: Partial<QuizForm> }) {
  const router = useRouter();
  const [form, setForm] = useState<QuizForm>(() => (quiz ? formFromQuiz(quiz) : emptyQuizForm(prefill)));
  // The last saved state, to show "Unsaved changes" and warn before leaving.
  const [saved, setSaved] = useState(() => JSON.stringify(form));
  const dirty = JSON.stringify(form) !== saved;
  const set = <K extends keyof QuizForm>(key: K, value: QuizForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const [mediums, setMediums] = useState<Medium[]>([]);
  const [classes, setClasses] = useState<ClassLevel[]>([]);
  const [trees, setTrees] = useState<SubjectTree[] | null>(null);
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [pickable, setPickable] = useState<PickableQuestion[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const scope = form.mediumId && form.classId ? `${form.mediumId}:${form.classId}` : null;

  useEffect(() => {
    apiJson<{ mediums: Medium[] }>("/api/admin/mediums").then(({ mediums }) => setMediums(mediums)).catch(() => undefined);
    apiJson<{ classes: ClassLevel[] }>("/api/admin/classes").then(({ classes }) => setClasses(classes)).catch(() => undefined);
  }, []);

  // All subjects (with chapters) of the chosen medium + class.
  useEffect(() => {
    if (!scope) return;
    const [mediumId, classId] = scope.split(":");
    let cancelled = false;
    apiJson<{ subjects: SubjectRow[] }>(`/api/admin/subjects?mediumId=${mediumId}&classId=${classId}`)
      .then(({ subjects }) => Promise.all(subjects.sort((a, b) => a.order - b.order).map((s) => apiJson<{ subject: SubjectTree }>(`/api/admin/subjects/${s.id}`).then((r) => r.subject))))
      .then((t) => !cancelled && setTrees(t))
      .catch(() => !cancelled && setTrees([]));
    return () => {
      cancelled = true;
    };
  }, [scope]);

  // Live counts / rules / readiness, debounced.
  const poolKey = scope ? JSON.stringify({ ...bodyFromForm(form), title: "x", description: null, isPublished: false }) : null;
  useEffect(() => {
    if (!poolKey) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiJson<PoolInfo>("/api/admin/quizzes/pool", { method: "POST", json: JSON.parse(poolKey) })
        .then((p) => !cancelled && (setPool(p), setPoolError(null)))
        .catch((err: ApiError) => !cancelled && setPoolError(err.message));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [poolKey]);

  // MCQs of the chosen chapters, for hand-picking.
  const chapterKey = form.pickMode === "FIXED" ? form.chapterIds.join(",") : "";
  useEffect(() => {
    if (!chapterKey) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch below
    setPickLoading(true);
    apiJson<{ questions: PickableQuestion[] }>(`/api/admin/quiz-questions?chapterIds=${chapterKey}`)
      .then(({ questions }) => !cancelled && setPickable(questions))
      .catch(() => !cancelled && setPickable([]))
      .finally(() => !cancelled && setPickLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chapterKey]);

  // Leaving with unsaved changes asks first — but never right after a save
  // (the create page's listener can outlive the redirect to the edit page).
  const justSaved = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (!justSaved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setScope = (patch: Partial<QuizForm>) => {
    setTrees(null);
    setPool(null);
    setForm((f) => ({ ...f, ...patch, chapterIds: [], questionIds: [] }));
  };

  const setChapters: IdsUpdate = (update) =>
    setForm((f) => {
      const chapterIds = update(f.chapterIds);
      const keep = new Set(chapterIds);
      // Hand-picked questions from chapters that were just removed go too.
      const questionIds = f.questionIds.filter((id) => {
        const q = pickable.find((p) => p.id === id);
        return !q || keep.has(q.chapterId);
      });
      return { ...f, chapterIds, questionIds };
    });

  const rules = pool?.rules;
  const readiness = pool?.readiness;
  const chapterTitle = (id: string) => trees?.flatMap((t) => t.chapters.map((c) => ({ ...c, subject: t.name }))).find((c) => c.id === id);
  const subjectsChosen = trees?.filter((t) => t.chapters.some((c) => form.chapterIds.includes(c.id))) ?? [];
  const placement =
    form.chapterIds.length === 1
      ? `the ${chapterTitle(form.chapterIds[0])?.subject ?? ""} · Chapter ${chapterTitle(form.chapterIds[0])?.number ?? ""} page`
      : subjectsChosen.length === 1
        ? `the ${subjectsChosen[0].name} subject page`
        : form.classId
          ? `the ${classes.find((c) => c.id === form.classId)?.name ?? "class"} page`
          : "—";

  const missing = !form.title.trim() ? "Give the quiz a title." : !form.mediumId || !form.classId ? "Choose a medium and class." : null;
  const publishBlocked = form.isPublished && readiness && !readiness.ready;

  const save = async () => {
    if (missing) return setError(missing);
    setBusy(true);
    setError(null);
    try {
      const body = bodyFromForm(form);
      if (quiz) {
        const { quiz: saved } = await apiJson<{ quiz: QuizRow }>(`/api/admin/quizzes/${quiz.id}`, { method: "PATCH", json: body });
        const next = formFromQuiz(saved);
        setSaved(JSON.stringify(next));
        setForm(next);
        toast.success("Quiz saved");
      } else {
        const { quiz: saved } = await apiJson<{ quiz: QuizRow }>("/api/admin/quizzes", { method: "POST", json: body });
        setSaved(JSON.stringify(form));
        justSaved.current = true;
        toast.success(saved.isPublished ? "Quiz created and published" : "Quiz saved as a draft");
        router.replace(`/quizzes/manage/${saved.id}`);
      }
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const id = "qb";
  const studentLine = rules
    ? `${rules.count} question${rules.count === 1 ? "" : "s"}, ${rules.secondsPerQuestion} seconds each. Score ${Math.min(rules.passMark, rules.count)} or more to pass and earn ${rules.coinsPerPass} coins.`
    : null;

  // "More options" opens by itself when the quiz already uses any of them.
  const usesMore =
    form.secondsPerQuestion !== null ||
    form.passMark !== null ||
    form.coinsPerPass !== null ||
    form.maxAttemptsPerStudent !== null ||
    form.sources.length > 0 ||
    form.difficulties.length > 0 ||
    form.useMix ||
    !form.onlyQuizMarked ||
    form.shuffleOptions ||
    (form.pickMode === "FIXED" && !form.shuffleQuestions) ||
    form.answerReveal !== "AFTER_EACH" ||
    Boolean(form.availableFrom || form.availableUntil);
  const [moreOpen, setMoreOpen] = useState(usesMore);
  const [chaptersOpen, setChaptersOpen] = useState(form.chapterIds.length === 0);

  // One-line description of what "More options" currently does, so nothing is hidden by surprise.
  const moreSummary = [
    rules && `${rules.secondsPerQuestion} s per question`,
    rules && `pass ${Math.min(rules.passMark, rules.count)}`,
    rules && `${rules.coinsPerPass} coins`,
    form.maxAttemptsPerStudent ? `${form.maxAttemptsPerStudent} attempt${form.maxAttemptsPerStudent === 1 ? "" : "s"} each` : "unlimited attempts",
    REVEALS.find((r) => r.value === form.answerReveal)?.short,
    form.availableFrom || form.availableUntil ? "scheduled" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const summary = (
    <Card className={cn(formCard, "gap-4 p-5")}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</p>
        <p className="mt-1 font-heading text-lg font-bold leading-tight">{form.title.trim() || "Untitled quiz"}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant="outline" className={SCHEDULE_STATUS[form.isPublished ? "LIVE" : "DRAFT"].className}>{form.isPublished ? "Published" : "Draft"}</Badge>
          <Badge variant="outline">{form.pickMode === "FIXED" ? "Hand-picked" : "Random"}</Badge>
          {dirty && <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Unsaved changes</Badge>}
        </div>
      </div>
      {studentLine && (
        <p className="rounded-xl bg-primary/5 px-3 py-2.5 text-sm">
          <strong>Students will see:</strong> {studentLine}
        </p>
      )}
      <dl className="grid gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Chapters</dt>
          <dd className="text-right font-medium">
            {form.chapterIds.length}
            {subjectsChosen.length > 1 && ` from ${subjectsChosen.length} subjects`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Students find it on</dt>
          <dd className="text-right font-medium">{placement}</dd>
        </div>
      </dl>

      {poolError && <p className="text-sm text-destructive">{poolError}</p>}
      {readiness &&
        (readiness.ready ? (
          <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
            <CheckCircle2Icon className="size-4 shrink-0" /> Ready — students can take it once published.
          </p>
        ) : (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <AlertTriangleIcon className="size-4 shrink-0" /> Not ready yet
            </p>
            <ul className="mt-1 space-y-0.5 text-destructive">
              {readiness.problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </div>
        ))}
      {readiness?.warnings.map((w) => (
        <p key={w} className="text-xs text-muted-foreground">
          ⓘ {w}
        </p>
      ))}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={() => setPreview(true)} disabled={!readiness?.ready}>
          <EyeIcon /> Preview a sample
        </Button>
        <Button type="button" className={pressable} onClick={save} disabled={busy || Boolean(publishBlocked)}>
          {busy && <Loader2Icon className="animate-spin" />}
          {quiz ? "Save changes" : form.isPublished ? "Create & publish" : "Save as draft"}
        </Button>
        {publishBlocked && <p className="text-xs text-muted-foreground">Fix the problems above, or switch Published off to save a draft.</p>}
        {missing && <p className="text-xs text-muted-foreground">{missing}</p>}
      </div>
    </Card>
  );

  const chosenChips = (
    <div className="flex flex-wrap items-center gap-1.5">
      {form.chapterIds.slice(0, 12).map((cid) => {
        const c = chapterTitle(cid);
        return (
          <Badge key={cid} variant="secondary" className="gap-1">
            {c ? `${c.subject} ${c.number}` : "…"}
            <button type="button" aria-label="Remove chapter" onClick={() => setChapters((cur) => cur.filter((x) => x !== cid))}>
              <XIcon className="size-3" />
            </button>
          </Badge>
        );
      })}
      {form.chapterIds.length > 12 && <span className="text-xs text-muted-foreground">+{form.chapterIds.length - 12} more</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground">
          <Link href="/quizzes/manage">
            <ArrowLeftIcon /> All quizzes
          </Link>
        </Button>
        {quiz && (
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href={`/quizzes/attempts?quizId=${quiz.id}&range=all`}>
              <ListChecksIcon /> Attempts{quiz.stats ? ` (${quiz.stats.attempts})` : ""}
            </Link>
          </Button>
        )}
      </div>
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">{quiz ? "Edit quiz" : "New quiz"}</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground md:text-[15px]">
          Four quick steps. Everything else has sensible defaults under <strong>More options</strong>.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Section step={1} title="Name the quiz">
            <Field id={`${id}-title`} label="Title" hint="Students see this before they start.">
              <Input id={`${id}-title`} className={inputClass} value={form.title} maxLength={160} placeholder="e.g. Unit test: Chapters 1–3" onChange={(e) => set("title", e.target.value)} />
            </Field>
          </Section>

          <Section step={2} title="Choose chapters" hint="One chapter, a few, a whole subject — or several subjects of the same class.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${id}-medium`} label="Medium">
                <Select value={form.mediumId} onValueChange={(v) => (setScope({ mediumId: v }), setChaptersOpen(true))}>
                  <SelectTrigger id={`${id}-medium`} className="h-10 w-full">
                    <SelectValue placeholder="Choose a medium" />
                  </SelectTrigger>
                  <SelectContent>
                    {mediums.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id={`${id}-class`} label="Class">
                <Select value={form.classId} onValueChange={(v) => (setScope({ classId: v }), setChaptersOpen(true))}>
                  <SelectTrigger id={`${id}-class`} className="h-10 w-full">
                    <SelectValue placeholder="Choose a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {!c.isActive && " (hidden)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {scope && !trees && <p className="text-sm text-muted-foreground">Loading subjects…</p>}
            {trees &&
              (chaptersOpen ? (
                <>
                  <ChapterPicker trees={trees} value={form.chapterIds} onChange={setChapters} />
                  {form.chapterIds.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">
                        {form.chapterIds.length} chapter{form.chapterIds.length === 1 ? "" : "s"} chosen
                      </span>
                      <span className="flex gap-2">
                        <Button type="button" variant="ghost" className="h-9" onClick={() => setChapters(() => [])}>
                          Clear
                        </Button>
                        <Button type="button" variant="outline" className="h-9" onClick={() => setChaptersOpen(false)}>
                          Done
                        </Button>
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid gap-3 rounded-xl border bg-muted/30 p-3">
                  <p className="text-sm font-medium">
                    {form.chapterIds.length === 0
                      ? "No chapters chosen yet."
                      : `${form.chapterIds.length} chapter${form.chapterIds.length === 1 ? "" : "s"}${subjectsChosen.length > 1 ? ` from ${subjectsChosen.length} subjects` : subjectsChosen[0] ? ` of ${subjectsChosen[0].name}` : ""}`}
                  </p>
                  {form.chapterIds.length > 0 && chosenChips}
                  <Button type="button" variant="outline" className="h-9 justify-self-start" onClick={() => setChaptersOpen(true)}>
                    Change chapters
                  </Button>
                </div>
              ))}
          </Section>

          <Section step={3} title="Questions">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1" role="radiogroup" aria-label="How questions are chosen">
              {(
                [
                  { value: "RANDOM", icon: ShuffleIcon, title: "Random", hint: "Different questions every attempt" },
                  { value: "FIXED", icon: ListChecksIcon, title: "Hand-pick", hint: "Exactly the questions you choose" },
                ] as const
              ).map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={form.pickMode === m.value}
                  onClick={() => set("pickMode", m.value)}
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors", form.pickMode === m.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <m.icon className="size-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">{m.title}</span>
                    <span className="hidden text-xs text-muted-foreground sm:block">{m.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            {form.pickMode === "RANDOM" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`${id}-count`} label="How many questions?" hint={form.useMix ? "Set by the easy / medium / hard mix in More options." : undefined}>
                  <NumberInput
                    id={`${id}-count`}
                    value={form.useMix ? form.mix.EASY + form.mix.MEDIUM + form.mix.HARD : (form.questionCount ?? pool?.rules.count ?? 10)}
                    onChange={(v) => set("questionCount", v)}
                    min={1}
                    max={100}
                    suffix="questions"
                    readOnly={form.useMix}
                  />
                </Field>
                <div className="grid content-start gap-2">
                  <span className="text-sm font-semibold">Questions to choose from</span>
                  <p
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                      !pool ? "text-muted-foreground" : rules && pool.counts.matching >= rules.count ? "border-success/30 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning"
                    )}
                  >
                    {pool
                      ? `${pool.counts.matching} available — each student gets a random ${rules?.count ?? ""}`
                      : form.chapterIds.length
                        ? "Counting…"
                        : "Choose chapters first"}
                  </p>
                </div>
              </div>
            ) : form.chapterIds.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Choose chapters first — then tick the questions you want.</p>
            ) : (
              <HandPicker questions={pickable} loading={pickLoading} value={form.questionIds} onChange={(update) => setForm((f) => ({ ...f, questionIds: update(f.questionIds) }))} />
            )}
          </Section>

          <Section step={4} title="Publish">
            <ToggleRow
              id={`${id}-pub`}
              title="Students can take this quiz"
              hint={readiness && !readiness.ready ? "Fix the problems in the summary first." : "Off = saved as a draft that only admins see."}
              checked={form.isPublished}
              onChange={(v) => set("isPublished", v)}
              disabled={!form.isPublished && Boolean(readiness && !readiness.ready)}
            />
          </Section>

          {/* Everything optional, closed by default */}
          <Card className={cn(formCard, "gap-0 py-0")}>
            <button type="button" className="flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold">More options</span>
                <span className="block truncate text-sm text-muted-foreground">{moreOpen ? "Optional — the defaults work for most quizzes." : moreSummary || "Timing, pass mark, coins, answers, dates"}</span>
              </span>
              <ChevronDownIcon className={cn("size-5 shrink-0 text-muted-foreground transition-transform", moreOpen && "rotate-180")} />
            </button>

            {moreOpen && (
              <div className="grid gap-7 border-t px-5 py-5 sm:px-6">
                <OptionGroup title="Timing & scoring" hint="“Default” means the value from Settings → Quiz & coins.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DefaultNumber id={`${id}-secs`} label="Time per question" unit="seconds" value={form.secondsPerQuestion} fallback={rules?.secondsPerQuestion} onChange={(v) => set("secondsPerQuestion", v)} min={3} max={600} />
                    <DefaultNumber id={`${id}-pass`} label={`Correct answers needed to pass${rules ? ` (out of ${rules.count})` : ""}`} unit="correct" value={form.passMark} fallback={rules ? Math.min(rules.passMark, rules.count) : undefined} onChange={(v) => set("passMark", v)} min={1} max={200} />
                    <DefaultNumber id={`${id}-coins`} label="Coins for passing" unit="coins" value={form.coinsPerPass} fallback={rules?.coinsPerPass} onChange={(v) => set("coinsPerPass", v)} min={0} max={100000} />
                    <DefaultNumber id={`${id}-tries`} label="Attempts per student" unit="attempts" value={form.maxAttemptsPerStudent} fallbackText="Unlimited" onChange={(v) => set("maxAttemptsPerStudent", v)} min={1} max={1000} />
                  </div>
                </OptionGroup>

                {form.pickMode === "RANDOM" && (
                  <OptionGroup title="Which questions can be picked" hint="Narrow the random pool. By default every question you've marked for quizzes can be picked.">
                    <div className="grid gap-2">
                      <span className="text-sm font-medium">Include</span>
                      <AnyOfChips
                        options={[
                          { value: "TEXTBOOK", label: "Textbook" },
                          { value: "EXTRA", label: "Extra" },
                        ]}
                        value={form.sources}
                        onChange={(v) => set("sources", v)}
                        counts={pool?.counts.bySource}
                      />
                    </div>
                    <div className="grid gap-2">
                      <span className="text-sm font-medium">Difficulty</span>
                      <AnyOfChips options={LEVELS} value={form.difficulties} onChange={(v) => set("difficulties", v)} counts={pool?.counts.byDifficulty} />
                      {pool && pool.counts.byDifficulty.NONE > 0 && (
                        <p className="text-xs text-muted-foreground">{pool.counts.byDifficulty.NONE} questions have no difficulty set — they&apos;re only used while all three are ticked.</p>
                      )}
                    </div>
                    <ToggleRow
                      id={`${id}-marked`}
                      title="Only questions marked for quizzes"
                      hint={pool ? `${pool.counts.quizMarked} of ${pool.counts.published} questions are marked “In quiz” on their chapter page. Turn off to also use practice-only ones.` : "Turn off to also use practice-only questions."}
                      checked={form.onlyQuizMarked}
                      onChange={(v) => set("onlyQuizMarked", v)}
                    />
                    <ToggleRow id={`${id}-mix`} title="Fix how many easy, medium and hard" hint="e.g. 4 easy, 4 medium, 2 hard in every attempt." checked={form.useMix} onChange={(v) => set("useMix", v)} />
                    {form.useMix && (
                      <div className="grid grid-cols-3 gap-3">
                        {LEVELS.map((l) => (
                          <Field key={l.value} id={`${id}-mix-${l.value}`} label={l.label} hint={pool ? `${pool.counts.matchingByDifficulty[l.value]} available` : undefined}>
                            <NumberInput id={`${id}-mix-${l.value}`} value={form.mix[l.value]} onChange={(v) => set("mix", { ...form.mix, [l.value]: v ?? 0 } as Record<Level, number>)} min={0} max={100} />
                          </Field>
                        ))}
                      </div>
                    )}
                  </OptionGroup>
                )}

                <OptionGroup title="Order & answers">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {form.pickMode === "FIXED" && (
                      <ToggleRow id={`${id}-shq`} title="Mix up the question order" hint="Each student gets your questions in a different order." checked={form.shuffleQuestions} onChange={(v) => set("shuffleQuestions", v)} />
                    )}
                    <ToggleRow id={`${id}-sho`} title="Mix up the A/B/C/D options" hint="Stops students sharing “the answer is B”." checked={form.shuffleOptions} onChange={(v) => set("shuffleOptions", v)} />
                  </div>
                  <div className="grid gap-2" role="radiogroup" aria-label="When students see the right answers">
                    <span className="text-sm font-medium">When do students see the right answers?</span>
                    <div className="grid gap-2 md:grid-cols-3">
                      {REVEALS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          role="radio"
                          aria-checked={form.answerReveal === r.value}
                          onClick={() => set("answerReveal", r.value)}
                          className={cn("rounded-xl border px-4 py-3 text-left transition-colors", form.answerReveal === r.value ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50")}
                        >
                          <span className="block text-sm font-semibold">{r.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{r.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </OptionGroup>

                <OptionGroup title="Open and close dates" hint="India time. Leave empty for a quiz that's always open.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        { key: "availableFrom", label: "Opens on", hint: "Before this, students see when it opens." },
                        { key: "availableUntil", label: "Closes on", hint: "After this, students can't take it." },
                      ] as const
                    ).map((d) => (
                      <Field key={d.key} id={`${id}-${d.key}`} label={d.label} hint={d.hint}>
                        <div className="flex gap-2">
                          <Input id={`${id}-${d.key}`} type="datetime-local" className={inputClass} value={form[d.key]} onChange={(e) => set(d.key, e.target.value)} />
                          {form[d.key] && (
                            <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0" aria-label={`Clear ${d.label.toLowerCase()}`} onClick={() => set(d.key, "")}>
                              <XIcon />
                            </Button>
                          )}
                        </div>
                      </Field>
                    ))}
                  </div>
                </OptionGroup>

                <OptionGroup title="Instructions for students">
                  <Field id={`${id}-desc`} label="Instructions (optional)" hint="A line or two shown before the quiz starts, e.g. what it covers.">
                    <Textarea id={`${id}-desc`} rows={2} maxLength={1000} value={form.description} onChange={(e) => set("description", e.target.value)} />
                  </Field>
                </OptionGroup>
              </div>
            )}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20">{summary}</aside>
      </div>

      <PreviewDialog open={preview} onOpenChange={setPreview} body={bodyFromForm(form)} />
    </div>
  );
}

function OptionGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// A number that normally follows the default: shows "Default: 10 seconds · Change";
// once changed, an input with "Use default".
function DefaultNumber({
  id,
  label,
  unit,
  value,
  fallback,
  fallbackText,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  fallback?: number;
  fallbackText?: string;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
}) {
  const shownDefault = fallbackText ?? (fallback !== undefined ? `${fallback} ${unit}` : "…");
  return (
    <div className="grid content-start gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {value === null ? (
        <div className="flex h-10 items-center justify-between gap-2 rounded-xl border border-dashed px-3 text-sm">
          <span>
            <span className="text-muted-foreground">Default:</span> <span className="font-medium">{shownDefault}</span>
          </span>
          <Button id={id} type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => onChange(fallback ?? min)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <NumberInput id={id} value={value} onChange={(v) => onChange(v ?? min)} min={min} max={max} suffix={unit} />
          </div>
          <Button type="button" variant="ghost" className="h-10 shrink-0 px-2 text-xs" onClick={() => onChange(null)}>
            Use default
          </Button>
        </div>
      )}
    </div>
  );
}
