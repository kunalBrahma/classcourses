"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CoinsIcon, Loader2Icon, RotateCcwIcon, TimerIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/page-header";
import { Field } from "@/components/admin/settings/field";
import { SettingSource, SourceBadge } from "@/components/admin/settings/source-badge";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { AwardRule, CoinSettings, QuizSettings, quoteDiscount, rupees } from "@/lib/people";
import { cn } from "@/lib/utils";

interface Row<T> {
  key: string;
  source: SettingSource;
  value: T;
}

const AWARD_RULES: { value: AwardRule; label: string; hint: string }[] = [
  { value: "firstPassPerChapter", label: "First pass of each chapter", hint: "Recommended. Re-passing a chapter earns nothing — stops coin farming." },
  { value: "firstPassPerChapterPerDay", label: "First pass of each chapter per day", hint: "A chapter can earn coins again the next day." },
  { value: "everyPass", label: "Every pass", hint: "Easy to farm: 10 quizzes a day on one easy chapter = 10× the coins." },
];

function NumberField({ id, label, hint, value, onChange, min, max, step, suffix }: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          className={cn(inputClass, "tabular-nums", suffix && "pr-16")}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step ?? 1}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          required
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </Field>
  );
}

function useSettingCard<T extends object>(key: string, title: string) {
  const confirm = useConfirm();
  const [row, setRow] = useState<Row<T> | null>(null);
  const [form, setForm] = useState<T | null>(null);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ setting: Row<T> }>(`/api/admin/settings/${key}`)
      .then(({ setting }) => {
        setRow(setting);
        setForm(setting.value);
      })
      .catch((err: ApiError) => setError(err.message));
  }, [key]);

  const save = async (body: T) => {
    setBusy("save");
    setError(null);
    try {
      const { setting } = await apiJson<{ setting: Row<T> }>(`/api/admin/settings/${key}`, { method: "PUT", json: body });
      setRow(setting);
      setForm(setting.value);
      toast.success(`${title} saved`, { description: "New quizzes and orders use these rules. Running quizzes keep their old timer." });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!(await confirm({ title: `Reset ${title.toLowerCase()}?`, description: "Your values are replaced by the defaults.", confirmLabel: "Reset" }))) return;
    setBusy("reset");
    try {
      const { setting } = await apiJson<{ setting: Row<T> }>(`/api/admin/settings/${key}`, { method: "DELETE" });
      setRow(setting);
      setForm(setting.value);
      toast.success(`${title} reset to defaults`);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  return { row, form, setForm, busy, error, setError, save, reset };
}

function Footer({ source, busy, onReset, label }: { source: SettingSource; busy: string | null; onReset: () => void; label: string }) {
  return (
    <CardFooter className="flex flex-col-reverse gap-2 border-t sm:flex-row sm:justify-between">
      {source === "database" ? (
        <Button type="button" variant="ghost" className={`${actionButton} text-muted-foreground`} disabled={busy !== null} onClick={onReset}>
          <RotateCcwIcon /> Reset to defaults
        </Button>
      ) : (
        <span className="hidden sm:block" />
      )}
      <Button type="submit" className={pressable} disabled={busy !== null}>
        {busy === "save" && <Loader2Icon className="animate-spin" />} {label}
      </Button>
    </CardFooter>
  );
}

function QuizCard() {
  const id = useId();
  const s = useSettingCard<QuizSettings>("quiz", "Quiz rules");
  if (!s.form || !s.row) return s.error ? <Alert variant="destructive"><AlertDescription>{s.error}</AlertDescription></Alert> : <Skeleton className="h-96 rounded-2xl" />;
  const f = s.form;
  const set = (k: Exclude<keyof QuizSettings, "autoChapterQuizzes">, v: number) => s.setForm({ ...f, [k]: v });
  const valid = [f.questionsPerQuiz, f.secondsPerQuestion, f.passMark, f.dailyLimit].every((n) => Number.isFinite(n) && n > 0);
  const passTooHigh = valid && f.passMark > f.questionsPerQuiz;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || passTooHigh) return;
    void s.save(f);
  };

  return (
    <form onSubmit={submit}>
      <Card className={formCard}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <TimerIcon className="size-5 text-primary" /> Quiz rules
            </CardTitle>
            <CardDescription className="mt-1.5">
              The defaults for every quiz, shown on the guidelines screen. Custom quizzes in the{" "}
              <Link href="/quizzes/manage" className="underline">Quiz builder</Link> can override them.
            </CardDescription>
          </div>
          <SourceBadge source={s.row.source} className="shrink-0" />
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField id={`${id}-q`} label="Questions per quiz" value={f.questionsPerQuiz} onChange={(v) => set("questionsPerQuiz", v)} min={1} max={50} hint="A chapter's automatic quiz needs at least this many MCQs marked “In quiz”." />
            <NumberField id={`${id}-s`} label="Time per question" value={f.secondsPerQuestion} onChange={(v) => set("secondsPerQuestion", v)} min={3} max={300} suffix="seconds" hint="Short enough that there's no time to search." />
            <NumberField id={`${id}-p`} label="Pass mark" value={f.passMark} onChange={(v) => set("passMark", v)} min={1} max={50} suffix="correct" />
            <NumberField id={`${id}-d`} label="Daily limit" value={f.dailyLimit} onChange={(v) => set("dailyLimit", v)} min={1} max={1000} suffix="quizzes" hint="Counts quizzes started each day (resets at midnight India time)." />
          </div>
          <label htmlFor={`${id}-auto`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Automatic chapter quizzes</span>
              <span className="block text-xs text-muted-foreground">
                Every chapter gets a quiz of random MCQs marked “In quiz”. Turn off to use only quizzes you build. Single chapters can also be switched off on their MCQs tab.
              </span>
            </span>
            <Switch id={`${id}-auto`} checked={f.autoChapterQuizzes ?? true} onCheckedChange={(v) => s.setForm({ ...f, autoChapterQuizzes: v })} />
          </label>
          {passTooHigh && (
            <Alert variant="destructive">
              <AlertDescription>The pass mark can&apos;t be more than the number of questions.</AlertDescription>
            </Alert>
          )}
          {valid && !passTooHigh && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
              <span className="font-semibold">Students will see:</span> {f.questionsPerQuiz} questions, {f.secondsPerQuestion} seconds each. Score {f.passMark} or
              more ({Math.round((f.passMark / f.questionsPerQuiz) * 100)}%) to pass. Up to {f.dailyLimit} quiz{f.dailyLimit === 1 ? "" : "zes"} a day.
            </div>
          )}
          {s.error && (
            <Alert variant="destructive">
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{s.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <Footer source={s.row.source} busy={s.busy} onReset={s.reset} label="Save quiz rules" />
      </Card>
    </form>
  );
}

function CoinsCard() {
  const id = useId();
  const s = useSettingCard<CoinSettings>("coins", "Coin rules");
  // Coin value is edited in rupees, stored in paise.
  const [rupeeValue, setRupeeValue] = useState<string | null>(null);
  if (!s.form || !s.row) return s.error ? <Alert variant="destructive"><AlertDescription>{s.error}</AlertDescription></Alert> : <Skeleton className="h-[520px] rounded-2xl" />;
  const f = s.form;
  const shownRupees = rupeeValue ?? (f.coinValuePaise / 100).toString();
  const exampleNote = 4900;
  const exampleCoins = 300;
  const q = quoteDiscount(exampleNote, exampleCoins, f);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setRupeeValue(null);
    void s.save(f);
  };

  return (
    <form onSubmit={submit}>
      <Card className={formCard}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <CoinsIcon className="size-5 text-warning" /> Coin rules
            </CardTitle>
            <CardDescription className="mt-1.5">Students earn coins by passing quizzes and spend them on premium notes. Coins have no cash value.</CardDescription>
          </div>
          <SourceBadge source={s.row.source} className="shrink-0" />
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <NumberField id={`${id}-pp`} label="Coins per pass" value={f.perPass} onChange={(v) => s.setForm({ ...f, perPass: v })} min={0} max={100000} suffix="coins" />
            <Field id={`${id}-cv`} label="Value of 1 coin">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">₹</span>
                <Input
                  id={`${id}-cv`}
                  className={cn(inputClass, "pl-7 tabular-nums")}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={1000}
                  step={0.01}
                  value={shownRupees}
                  onChange={(e) => {
                    setRupeeValue(e.target.value);
                    s.setForm({ ...f, coinValuePaise: Math.round(Number(e.target.value) * 100) });
                  }}
                  required
                />
              </div>
            </Field>
            <NumberField id={`${id}-md`} label="Max discount" value={f.maxDiscountPercent} onChange={(v) => s.setForm({ ...f, maxDiscountPercent: v })} min={0} max={100} suffix="% of price" />
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Which passes earn coins?</legend>
            {AWARD_RULES.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                  f.awardRule === r.value ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <input
                  type="radio"
                  name={`${id}-rule`}
                  checked={f.awardRule === r.value}
                  onChange={() => s.setForm({ ...f, awardRule: r.value })}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span>
                  <span className="block text-sm font-semibold">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="rounded-xl border border-warning/30 bg-brand-amber/10 px-4 py-3 text-sm">
            <span className="font-semibold">Example:</span> a pass earns {f.perPass} coins (worth {rupees(f.perPass * f.coinValuePaise)}). A student with{" "}
            {exampleCoins} coins buying a {rupees(exampleNote)} note uses <strong>{q.coinsUsed} coins</strong> and pays{" "}
            <strong>{rupees(q.amountPaise)}</strong>
            {q.amountPaise === 0 ? " (fully covered)" : ""}.
          </div>

          {s.error && (
            <Alert variant="destructive">
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{s.error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <Footer source={s.row.source} busy={s.busy} onReset={s.reset} label="Save coin rules" />
      </Card>
    </form>
  );
}

export default function QuizSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quiz & coins"
        description="Rules for chapter quizzes and the coins students earn. These were left for the client to decide — defaults are 10 questions, 10 s, pass with 7, 10 a day."
      />
      <QuizCard />
      <CoinsCard />
    </div>
  );
}
