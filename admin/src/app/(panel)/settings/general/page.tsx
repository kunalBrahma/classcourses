"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { GlobeIcon, Loader2Icon, MailIcon, RotateCcwIcon, Share2Icon, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { Field } from "@/components/admin/settings/field";
import { SettingSource, SourceBadge } from "@/components/admin/settings/source-badge";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { useConfirm } from "@/components/admin/confirm";

type Values = Record<string, string | null>;

interface SettingRow {
  key: string;
  source: SettingSource;
  value: Values | null;
}

interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "url" | "email";
  placeholder?: string;
  hint?: string;
}

interface GroupDef {
  key: "site" | "contact" | "social";
  title: string;
  description: string;
  icon: LucideIcon;
  fields: FieldDef[];
}

const GROUPS: GroupDef[] = [
  {
    key: "site",
    title: "Site",
    description: "Used in emails and page text ({{site.name}}).",
    icon: GlobeIcon,
    fields: [
      { name: "name", label: "Site name", placeholder: "Class Course" },
      {
        name: "frontendUrl",
        label: "Student site address",
        type: "url",
        placeholder: "https://classcourse.in",
        hint: "Links in password-reset and receipt emails point here.",
      },
    ],
  },
  {
    key: "contact",
    title: "Contact",
    description: "Shown on the Contact page and in the footer. Email only — no phone or address (client's choice).",
    icon: MailIcon,
    fields: [{ name: "email", label: "Contact email", type: "email", placeholder: "hello@classcourse.in" }],
  },
  {
    key: "social",
    title: "Social links",
    description: "Header and footer icons. Leave a field empty to hide that icon.",
    icon: Share2Icon,
    fields: [
      { name: "youtube", label: "YouTube", type: "url" },
      { name: "facebook", label: "Facebook", type: "url" },
      { name: "instagram", label: "Instagram", type: "url" },
      { name: "twitter", label: "X (Twitter)", type: "url" },
      { name: "linkedin", label: "LinkedIn", type: "url" },
    ],
  },
];

function GroupCard({ group, initial, onSaved }: { group: GroupDef; initial: SettingRow; onSaved: (row: SettingRow) => void }) {
  const id = useId();
  const confirm = useConfirm();
  const [values, setValues] = useState<Values>(initial.value ?? {});
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const Icon = group.icon;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      const body = Object.fromEntries(group.fields.map((f) => [f.name, values[f.name] ?? ""]));
      const { setting } = await apiJson<{ setting: SettingRow }>(`/api/admin/settings/${group.key}`, { method: "PUT", json: body });
      setValues(setting.value ?? {});
      onSaved(setting);
      toast.success(`${group.title} saved`);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!(await confirm({ title: `Reset ${group.title.toLowerCase()}?`, description: "Your saved values are replaced by the defaults.", confirmLabel: "Reset" }))) return;
    setBusy("reset");
    setError(null);
    try {
      const { setting } = await apiJson<{ setting: SettingRow }>(`/api/admin/settings/${group.key}`, { method: "DELETE" });
      setValues(setting.value ?? {});
      onSaved(setting);
      toast.success(`${group.title} reset to defaults`);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <form onSubmit={save}>
      <Card className={formCard}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <Icon className="size-5 text-brand-amber-text" /> {group.title}
            </CardTitle>
            <CardDescription className="mt-1.5">{group.description}</CardDescription>
          </div>
          <SourceBadge source={initial.source} className="shrink-0" />
        </CardHeader>
        <CardContent className={group.fields.length > 2 ? "grid gap-5 sm:grid-cols-2" : "grid gap-5"}>
          {group.fields.map((f) => (
            <Field key={f.name} id={`${id}-${f.name}`} label={f.label} hint={f.hint}>
              <Input
                id={`${id}-${f.name}`}
                className={inputClass}
                type={f.type ?? "text"}
                inputMode={f.type === "url" ? "url" : f.type === "email" ? "email" : undefined}
                autoCapitalize={f.type ? "none" : undefined}
                spellCheck={f.type ? false : undefined}
                value={values[f.name] ?? ""}
                placeholder={f.placeholder ?? (f.type === "url" ? "https://…" : undefined)}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            </Field>
          ))}
          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertTitle>Not saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col-reverse gap-2 border-t sm:flex-row sm:justify-between">
          {initial.source === "database" ? (
            <Button type="button" variant="ghost" className={`${actionButton} text-muted-foreground`} disabled={busy !== null} onClick={reset}>
              <RotateCcwIcon /> Reset to defaults
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button type="submit" className={pressable} disabled={busy !== null}>
            {busy === "save" && <Loader2Icon className="animate-spin" />} Save {group.title.toLowerCase()}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export default function GeneralSettingsPage() {
  const [rows, setRows] = useState<Record<string, SettingRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ settings: SettingRow[] }>("/api/admin/settings")
      .then(({ settings }) => setRows(Object.fromEntries(settings.map((s) => [s.key, s]))))
      .catch((err: ApiError) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="General" description="Site details, contact email and social links used across the student site and emails." />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load settings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!rows && !error && (
        <div className="space-y-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}
      {rows &&
        GROUPS.map((group) =>
          rows[group.key] ? (
            <GroupCard
              key={group.key}
              group={group}
              initial={rows[group.key]}
              onSaved={(row) => setRows((r) => (r ? { ...r, [row.key]: row } : r))}
            />
          ) : null
        )}
    </div>
  );
}
