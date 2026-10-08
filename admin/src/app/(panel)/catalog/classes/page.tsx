"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Field } from "@/components/admin/settings/field";
import { useConfirm } from "@/components/admin/confirm";
import { LinkPreview } from "@/components/admin/catalog/link-preview";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { ClassLevel, Medium, move, slugify } from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Add / edit a class
// ---------------------------------------------------------------------------

function ClassDialog({
  target,
  exampleMedium,
  onClose,
  onSaved,
}: {
  target: { classLevel: ClassLevel | null } | null;
  exampleMedium: string; // a medium's link part, to show a realistic preview
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const editing = target?.classLevel ?? null;
  const [form, setForm] = useState({ name: "", nativeName: "", slug: "", isActive: true });
  const [customSlug, setCustomSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the dialog opens for a new target.
  const [last, setLast] = useState<typeof target>(null);
  if (target !== last) {
    setLast(target);
    if (target) {
      const c = target.classLevel;
      setForm(c ? { name: c.name, nativeName: c.nativeName ?? "", slug: c.slug, isActive: c.isActive } : { name: "", nativeName: "", slug: "", isActive: true });
      setCustomSlug(false);
      setError(null);
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name: form.name, nativeName: form.nativeName || null, slug: customSlug && form.slug ? form.slug : undefined, isActive: form.isActive };
      if (editing) await apiJson(`/api/admin/classes/${editing.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/classes", { method: "POST", json: body });
      toast.success(editing ? "Class updated" : `${form.name.trim()} added`);
      onSaved();
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setError(e.status === 409 && customSlug && !e.message.includes("called") ? "Another class already uses this link. Choose a different one." : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit class" : "New class"}</DialogTitle>
            <DialogDescription>Classes are shared by every medium. Add subjects to it from Subjects &amp; chapters.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-name`} label="Name" hint="As students should see it, e.g. Class 5, LKG, Nursery, BA 1st Year.">
            <Input id={`${id}-name`} className={inputClass} value={form.name} maxLength={60} placeholder="e.g. LKG" required autoFocus onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field id={`${id}-native`} label="Name in Assamese (optional)" hint="Shown next to the name, e.g. শ্ৰেণী ৫.">
            <Input id={`${id}-native`} className={inputClass} lang="as" value={form.nativeName} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, nativeName: e.target.value }))} />
          </Field>
          <LinkPreview
            id={`${id}-slug`}
            prefix={`/${exampleMedium}/`}
            value={customSlug ? form.slug : editing ? editing.slug : slugify(form.name)}
            editing={Boolean(editing)}
            custom={customSlug}
            onCustom={(slug) => {
              setCustomSlug(slug !== null);
              setForm((f) => ({ ...f, slug: slug ?? editing?.slug ?? "" }));
            }}
          />
          <label htmlFor={`${id}-active`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Visible to students</span>
              <span className="block text-xs text-muted-foreground">Hidden classes disappear from the student site in every medium.</span>
            </span>
            <Switch id={`${id}-active`} checked={form.isActive} onCheckedChange={(isActive) => setForm((f) => ({ ...f, isActive }))} />
          </label>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className={pressable} disabled={busy || !form.name.trim()}>
              {busy && <Loader2Icon className="animate-spin" />} {editing ? "Save" : "Add class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ClassesPage() {
  const confirm = useConfirm();
  const [classes, setClasses] = useState<ClassLevel[] | null>(null);
  const [mediums, setMediums] = useState<Medium[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ classLevel: ClassLevel | null } | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ classes: ClassLevel[] }>("/api/admin/classes")
        .then(({ classes }) => setClasses(classes))
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
    apiJson<{ mediums: Medium[] }>("/api/admin/mediums").then(({ mediums }) => setMediums(mediums)).catch(() => undefined);
  }, [load]);

  const reorder = async (index: number, direction: -1 | 1) => {
    if (!classes) return;
    const next = move(classes, index, direction);
    setClasses(next); // optimistic
    try {
      await apiJson("/api/admin/classes/reorder", { method: "PUT", json: { ids: next.map((c) => c.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const toggle = async (c: ClassLevel, isActive: boolean) => {
    setBusyId(c.id);
    try {
      await apiJson(`/api/admin/classes/${c.id}`, { method: "PATCH", json: { isActive } });
      setClasses((list) => list?.map((x) => (x.id === c.id ? { ...x, isActive } : x)) ?? null);
      toast.success(`${c.name} is now ${isActive ? "visible" : "hidden"}`);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: ClassLevel) => {
    if (c.subjectCount > 0 || c.quizCount > 0) {
      const what = [c.subjectCount && `${c.subjectCount} subject${c.subjectCount === 1 ? "" : "s"}`, c.quizCount && `${c.quizCount} quiz${c.quizCount === 1 ? "" : "zes"}`]
        .filter(Boolean)
        .join(" and ");
      await confirm({ title: `${c.name} can't be deleted yet`, description: `It still has ${what}. Delete those first — or simply hide the class with its switch.`, confirmLabel: "OK" });
      return;
    }
    if (!(await confirm({ title: `Delete ${c.name}?`, description: "It has no subjects, so nothing else is affected.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/classes/${c.id}`, { method: "DELETE" });
      toast.success(`${c.name} deleted`);
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const mediumName = (id: string) => mediums.find((m) => m.id === id)?.name ?? "…";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes"
        description="The classes students choose after their medium — add new ones (LKG, Nursery, Class 13, BA 1st Year…), rename, reorder or hide them. The order here is the order on the student site."
        actions={
          <Button className={pressable} onClick={() => setDialog({ classLevel: null })}>
            <PlusIcon /> New class
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load classes</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!classes && !error && <Skeleton className="h-96 rounded-2xl" />}

      {classes && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {classes.map((c, index) => {
              // In the same order as the Mediums page.
              const used = mediums.filter((m) => c.subjectsByMedium[m.id]).map((m) => [m.id, c.subjectsByMedium[m.id]] as const);
              return (
                <li key={c.id} className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                  <ReorderButtons index={index} count={classes.length} onMove={(d) => reorder(index, d)} label={c.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{c.name}</span>
                      {c.nativeName && (
                        <span lang="as" className="text-sm text-muted-foreground">
                          {c.nativeName}
                        </span>
                      )}
                      {!c.isActive && <Badge variant="outline">Hidden</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {used.length === 0 ? (
                        <span>No subjects yet — add them in Subjects &amp; chapters</span>
                      ) : (
                        used.map(([mediumId, n]) => (
                          <Link key={mediumId} href={`/catalog/subjects?medium=${mediumId}&class=${c.slug}`} className="hover:text-foreground hover:underline">
                            {mediumName(mediumId)}: {n} subject{n === 1 ? "" : "s"}
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                  <Switch checked={c.isActive} disabled={busyId === c.id} onCheckedChange={(v) => toggle(c, v)} aria-label={`${c.name} visible to students`} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${c.name}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ classLevel: c })}>
                        <PencilIcon /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(c)}>
                        <Trash2Icon /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
            {classes.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No classes yet — add the first one.</li>}
          </ul>
        </Card>
      )}

      <ClassDialog target={dialog} exampleMedium={mediums[0]?.slug ?? "medium"} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
