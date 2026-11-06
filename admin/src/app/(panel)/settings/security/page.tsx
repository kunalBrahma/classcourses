"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { GaugeIcon, Loader2Icon, LockKeyholeIcon, RotateCcwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { Field } from "@/components/admin/settings/field";
import { SettingSource, SourceBadge } from "@/components/admin/settings/source-badge";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";

// GET /api/admin/security/limits: what each limit means (one list in the API).
interface RequestLimit {
  name: string;
  label: string;
  per: "network" | "student" | "email";
  limit: number;
  windowMinutes: number;
}
type Values = Record<string, number>;
interface SettingRow {
  key: string;
  source: SettingSource;
  value: Values | null;
}

const PER: Record<RequestLimit["per"], string> = { network: "per network", student: "per student", email: "per email address" };

// Failed sign-ins (stored in the database). Bounds match the API's.
const LOGIN_FIELDS: { name: string; label: string; hint: string; min: number; max: number; unit: string }[] = [
  { name: "loginAccountMax", label: "Wrong passwords before a pause", hint: "Per account, within the window below.", min: 3, max: 50, unit: "tries" },
  { name: "loginWindowMinutes", label: "Counted over", hint: "Older failures are forgotten.", min: 1, max: 1440, unit: "minutes" },
  { name: "loginLockMinutes", label: "First pause", hint: "Each further pause doubles it.", min: 1, max: 1440, unit: "minutes" },
  { name: "loginLockMaxHours", label: "Longest pause for students", hint: "The doubling stops here.", min: 1, max: 168, unit: "hours" },
  { name: "loginIpMax", label: "Failed sign-ins per network", hint: "A whole class may share one school Wi-Fi: keep it generous.", min: 5, max: 1000, unit: "tries" },
  { name: "adminLoginMax", label: "Wrong passwords before an admin pause", hint: "Admin accounts' own rule.", min: 3, max: 50, unit: "tries" },
  { name: "adminLockMaxMinutes", label: "Longest pause for admins", hint: "Short, so nobody can lock the Founder out for long. An unlock code by email also ends it.", min: 1, max: 1440, unit: "minutes" },
];

export default function SecuritySettingsPage() {
  const id = useId();
  const confirm = useConfirm();
  const [limits, setLimits] = useState<RequestLimit[] | null>(null);
  const [row, setRow] = useState<SettingRow | null>(null);
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiJson<{ requestLimits: RequestLimit[] }>("/api/admin/security/limits"),
      apiJson<{ setting: SettingRow }>("/api/admin/settings/security"),
    ])
      .then(([meta, { setting }]) => {
        setLimits(meta.requestLimits);
        setRow(setting);
        setValues(setting.value ?? {});
      })
      .catch((err: ApiError) => setLoadError(err.message));
  }, []);

  const set = (name: string, v: string) => setValues((cur) => ({ ...cur, [name]: v === "" ? (NaN as number) : Number(v) }));
  const num = (name: string) => (Number.isFinite(values[name]) ? String(values[name]) : "");

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      const { setting } = await apiJson<{ setting: SettingRow }>("/api/admin/settings/security", { method: "PUT", json: values });
      setRow(setting);
      setValues(setting.value ?? {});
      toast.success("Security settings saved", { description: "They apply straight away." });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!(await confirm({ title: "Reset every limit?", description: "All limits go back to the recommended values.", confirmLabel: "Reset" }))) return;
    setBusy("reset");
    setError(null);
    try {
      const { setting } = await apiJson<{ setting: SettingRow }>("/api/admin/settings/security", { method: "DELETE" });
      setRow(setting);
      setValues(setting.value ?? {});
      toast.success("Back to the recommended limits");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const changed = (l: RequestLimit) => values[`${l.name}Limit`] !== l.limit || values[`${l.name}WindowMinutes`] !== l.windowMinutes;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & limits"
        description="Wrong-password pauses and every request limit on the site. Changes apply at once, without restarting anything."
        actions={row && <SourceBadge source={row.source} />}
      />
      {loadError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load the settings</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {!row && !loadError && <Skeleton className="h-[640px] rounded-2xl" />}

      {row && limits && (
        <form onSubmit={save} className="space-y-6">
          <Card className={formCard}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <LockKeyholeIcon className="size-5 text-brand-amber-text" /> Wrong passwords
              </CardTitle>
              <CardDescription>
                Counted on the server, so refreshing the page or using another browser doesn&apos;t get around them. A paused student can reset their
                password or get an unlock code by email; you can also unpause them from their page in Users.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {LOGIN_FIELDS.map((f) => (
                <Field key={f.name} id={`${id}-${f.name}`} label={f.label} hint={`${f.hint} ${f.min}–${f.max} ${f.unit}.`}>
                  <div className="relative">
                    <Input
                      id={`${id}-${f.name}`}
                      type="number"
                      inputMode="numeric"
                      min={f.min}
                      max={f.max}
                      required
                      className={`${inputClass} pr-20 tabular-nums`}
                      value={num(f.name)}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{f.unit}</span>
                  </div>
                </Field>
              ))}
            </CardContent>
          </Card>

          <Card className={`${formCard} gap-0`}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <GaugeIcon className="size-5 text-brand-amber-text" /> Request limits
              </CardTitle>
              <CardDescription>How often one network, student or email may do each thing. Many students share one network, so network limits stay generous.</CardDescription>
            </CardHeader>
            <ul className="divide-y border-t">
              {limits.map((l) => (
                <li key={l.name} className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {l.label}
                      <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                        {PER[l.per]}
                      </Badge>
                      {changed(l) && (
                        <span className="text-xs text-muted-foreground">
                          Recommended: {l.limit} per {l.windowMinutes} min
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Input
                      aria-label={`${l.label}: how many`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100000}
                      required
                      className={`${inputClass} w-24 tabular-nums`}
                      value={num(`${l.name}Limit`)}
                      onChange={(e) => set(`${l.name}Limit`, e.target.value)}
                    />
                    <span className="shrink-0">per</span>
                    <Input
                      aria-label={`${l.label}: minutes`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      required
                      className={`${inputClass} w-20 tabular-nums`}
                      value={num(`${l.name}WindowMinutes`)}
                      onChange={(e) => set(`${l.name}WindowMinutes`, e.target.value)}
                    />
                    <span className="shrink-0">min</span>
                  </div>
                </li>
              ))}
            </ul>
            <CardFooter className="flex flex-col-reverse gap-2 border-t pt-6 sm:flex-row sm:justify-between">
              {row.source === "database" ? (
                <Button type="button" variant="ghost" className={`${actionButton} text-muted-foreground`} disabled={busy !== null} onClick={reset}>
                  <RotateCcwIcon /> Reset to recommended
                </Button>
              ) : (
                <span className="hidden sm:block" />
              )}
              <Button type="submit" className={pressable} disabled={busy !== null}>
                {busy === "save" && <Loader2Icon className="animate-spin" />} Save limits
              </Button>
            </CardFooter>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      )}
    </div>
  );
}
