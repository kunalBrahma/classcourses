"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronRightIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { SubjectDialog, SubjectDialogTarget } from "@/components/admin/catalog/subject-dialog";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { ClassLevel, Medium, move, SubjectRow } from "@/lib/catalog";
import { cn } from "@/lib/utils";


function SubjectsBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const confirm = useConfirm();

  const [mediums, setMediums] = useState<Medium[] | null>(null);
  const [classes, setClasses] = useState<ClassLevel[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<SubjectDialogTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Selection lives in the URL (?medium=<id>&class=<class link>) so Back and shared links work.
  const mediumId = params.get("medium") ?? mediums?.[0]?.id ?? null;
  const medium = mediums?.find((m) => m.id === mediumId) ?? null;

  const setSelection = (next: { medium?: string; class?: string }) => {
    const q = new URLSearchParams(params.toString());
    if (next.medium) {
      q.set("medium", next.medium);
      q.delete("class");
    }
    if (next.class) q.set("class", next.class);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  useEffect(() => {
    apiJson<{ mediums: Medium[] }>("/api/admin/mediums")
      .then(({ mediums }) => setMediums(mediums))
      .catch((err: ApiError) => setError(err.message));
    apiJson<{ classes: ClassLevel[] }>("/api/admin/classes")
      .then(({ classes }) => setClasses(classes))
      .catch(() => undefined);
  }, []);

  const loadSubjects = useCallback(() => {
    if (!mediumId) return;
    apiJson<{ subjects: SubjectRow[] }>(`/api/admin/subjects?mediumId=${mediumId}`)
      .then(({ subjects }) => setSubjects(subjects))
      .catch((err: ApiError) => setError(err.message));
  }, [mediumId]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  // Subjects of this medium for the current medium only (guards against a stale list while switching).
  const mediumSubjects = useMemo(() => (subjects ?? []).filter((s) => s.mediumId === mediumId), [subjects, mediumId]);
  const countByClass = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of mediumSubjects) counts.set(s.classLevel.id, (counts.get(s.classLevel.id) ?? 0) + 1);
    return counts;
  }, [mediumSubjects]);

  // Default class: ?class, else the first class that has subjects, else the first class.
  const classLevel = classes.find((c) => c.slug === params.get("class")) ?? classes.find((c) => countByClass.has(c.id)) ?? classes[0] ?? null;
  const rows = classLevel ? mediumSubjects.filter((s) => s.classLevel.id === classLevel.id).sort((a, b) => a.order - b.order) : [];
  const target = medium && classLevel ? { mediumId: medium.id, mediumName: medium.name, mediumSlug: medium.slug, classId: classLevel.id, className: classLevel.name, classSlug: classLevel.slug } : null;

  const reorder = async (index: number, direction: -1 | 1) => {
    const next = move(rows, index, direction);
    const order = new Map(next.map((s, i) => [s.id, i]));
    setSubjects((list) => list?.map((s) => (order.has(s.id) ? { ...s, order: order.get(s.id)! } : s)) ?? null);
    try {
      await apiJson("/api/admin/subjects/reorder", { method: "PUT", json: { ids: next.map((s) => s.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      loadSubjects();
    }
  };

  const toggle = async (subject: SubjectRow, isActive: boolean) => {
    setBusyId(subject.id);
    try {
      await apiJson(`/api/admin/subjects/${subject.id}`, { method: "PATCH", json: { isActive } });
      setSubjects((list) => list?.map((s) => (s.id === subject.id ? { ...s, isActive } : s)) ?? null);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (subject: SubjectRow) => {
    const ok = await confirm({
      title: `Delete ${subject.name}?`,
      description:
        subject.chapterCount > 0 ? (
          <>
            This also deletes its <strong>{subject.chapterCount} chapters</strong> and everything in them (questions, videos). This can&apos;t be undone.
            To keep the content, hide the subject with its switch instead.
          </>
        ) : (
          "This can't be undone."
        ),
      confirmLabel: subject.chapterCount > 0 ? `Delete with ${subject.chapterCount} chapters` : "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiJson(`/api/admin/subjects/${subject.id}${subject.chapterCount > 0 ? "?force=true" : ""}`, { method: "DELETE" });
      toast.success(`${subject.name} deleted`);
      loadSubjects();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects & chapters"
        description="Pick a medium and class, then open a subject to manage its parts and chapters."
        actions={
          medium && (
            <Button
              className={pressable}
              onClick={() => target && setDialog(target)}
            >
              <PlusIcon /> Add subject
            </Button>
          )
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load the catalog</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!mediums && !error && <Skeleton className="h-12 w-72 rounded-xl" />}

      {mediums && mediumId && (
        <Tabs value={mediumId} onValueChange={(v) => setSelection({ medium: v })}>
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            {mediums.map((m) => (
              <TabsTrigger key={m.id} value={m.id} className="h-9 px-3">
                {m.name}
                {!m.isActive && <span className="ml-1 text-[10px] text-muted-foreground">(hidden)</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {mediums && (
        <div role="group" aria-label="Class" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {classes.map((c) => {
            const count = countByClass.get(c.id) ?? 0;
            const active = c.id === classLevel?.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelection({ class: c.slug })}
                aria-pressed={active}
                className={cn(
                  "flex min-w-16 shrink-0 snap-start flex-col items-center rounded-xl border px-3 py-2 text-sm transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_3px_0_color-mix(in_oklch,var(--primary),black_35%)]"
                    : "bg-card hover:border-primary/40 hover:bg-accent",
                  count === 0 && !active && "text-muted-foreground"
                )}
              >
                <span className="font-heading text-base font-bold leading-tight">
                  {c.name}
                  {!c.isActive && <span className="sr-only"> (hidden)</span>}
                </span>
                <span className={cn("text-[11px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {count} subject{count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {mediums && !subjects && !error && <Skeleton className="h-96 rounded-2xl" />}

      {subjects && medium && (
        <Card className={`${formCard} gap-0 py-0`}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">
              {medium.name} · {classLevel?.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {rows.length} subject{rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="divide-y">
            {rows.map((subject, index) => (
              <li key={subject.id} className="flex items-center gap-1.5 px-2 py-2.5 sm:gap-3 sm:px-4">
                <ReorderButtons index={index} count={rows.length} onMove={(d) => reorder(index, d)} label={subject.name} />
                <Link href={`/catalog/subjects/${subject.id}`} className="group min-w-0 flex-1 rounded-lg px-1 py-1 hover:bg-muted/50">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold group-hover:underline">{subject.name}</span>
                    {subject.nativeName && (
                      <span lang="as" className="text-sm text-muted-foreground">
                        {subject.nativeName}
                      </span>
                    )}
                    {!subject.isActive && <Badge variant="outline">Hidden</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {subject.chapterCount === 0 ? (
                      <span className="text-warning">No chapters yet</span>
                    ) : (
                      <>
                        {subject.chapterCount} chapters
                        {subject.partCount > 0 && ` · ${subject.partCount} part${subject.partCount === 1 ? "" : "s"}`}
                      </>
                    )}
                  </span>
                </Link>
                <Switch
                  checked={subject.isActive}
                  disabled={busyId === subject.id}
                  onCheckedChange={(v) => toggle(subject, v)}
                  aria-label={`${subject.name} visible to students`}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${subject.name}`}>
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/catalog/subjects/${subject.id}`}>
                        <ChevronRightIcon /> Open chapters
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => target && setDialog({ ...target, subject })}
                    >
                      <PencilIcon /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(subject)}>
                      <Trash2Icon /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">No subjects in {classLevel?.name} for {medium.name} yet.</p>
                <Button
                  variant="outline"
                  className="mt-4 h-10"
                  onClick={() => target && setDialog(target)}
                >
                  <PlusIcon /> Add the first subject
                </Button>
              </li>
            )}
          </ul>
        </Card>
      )}

      <SubjectDialog target={dialog} onClose={() => setDialog(null)} onSaved={() => loadSubjects()} />
    </div>
  );
}

export default function SubjectsPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <SubjectsBrowser />
    </Suspense>
  );
}
