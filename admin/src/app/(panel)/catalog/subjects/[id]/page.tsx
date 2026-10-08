"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ExternalLinkIcon,
  ArrowLeftIcon,
  FolderPlusIcon,
  FileTextIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { SubjectDialog, SubjectDialogTarget } from "@/components/admin/catalog/subject-dialog";
import { BulkAddDialog, ChapterDialog, PartDialog } from "@/components/admin/catalog/chapter-dialogs";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { siteLink } from "@/lib/site";
import { Chapter, move, Part, SubjectTree } from "@/lib/catalog";
import { cn } from "@/lib/utils";

interface Group {
  part: Part | null;
  chapters: Chapter[];
}

function ChapterRow({
  chapter,
  contentHref,
  index,
  count,
  onMove,
  onTogglePublish,
  onEdit,
  onDelete,
  busy,
}: {
  chapter: Chapter;
  contentHref: string;
  index: number;
  count: number;
  onMove: (d: -1 | 1) => void;
  onTogglePublish: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const placeholder = /^Chapter \d+$/.test(chapter.title);
  return (
    <li className={cn("flex items-center gap-1.5 px-2 py-2 sm:gap-3 sm:px-4", !chapter.isPublished && "bg-muted/40")}>
      <ReorderButtons index={index} count={count} onMove={onMove} label={chapter.title} disabled={busy} />
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary font-heading text-xs font-bold tabular-nums text-secondary-foreground">
        {chapter.number}
      </span>
      <Link href={contentHref} className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left hover:bg-muted/50">
        <span className={cn("block truncate text-sm font-medium", placeholder && "text-muted-foreground")} lang="as">
          {chapter.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {placeholder && <span className="text-warning">placeholder name</span>}
          {!chapter.isPublished && <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Unpublished</Badge>}
        </span>
      </Link>
      <Switch
        checked={chapter.isPublished}
        disabled={busy}
        onCheckedChange={onTogglePublish}
        aria-label={`${chapter.title} published`}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${chapter.title}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={contentHref}>
              <FileTextIcon /> Content
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon /> Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export default function SubjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const [subject, setSubject] = useState<SubjectTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editChapter, setEditChapter] = useState<Chapter | null>(null);
  const [bulk, setBulk] = useState<{ partId: string | null } | null>(null);
  const [partDialog, setPartDialog] = useState<{ part: Part | null } | null>(null);
  const [subjectDialog, setSubjectDialog] = useState<SubjectDialogTarget | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ subject: SubjectTree }>(`/api/admin/subjects/${id}`)
        .then(({ subject }) => setSubject(subject))
        .catch((err: ApiError) => setError(err.status === 404 ? "This subject doesn't exist (it may have been deleted)." : err.message)),
    [id]
  );
  useEffect(() => {
    void load();
  }, [load]);

  // Same grouping as the student site: chapters without a part first, then each part.
  const groups: Group[] = useMemo(() => {
    if (!subject) return [];
    const loose = subject.chapters.filter((c) => !c.partId);
    const list: Group[] = [];
    if (loose.length || subject.parts.length === 0) list.push({ part: null, chapters: loose });
    for (const part of subject.parts) list.push({ part, chapters: subject.chapters.filter((c) => c.partId === part.id) });
    return list;
  }, [subject]);

  const published = subject?.chapters.filter((c) => c.isPublished).length ?? 0;
  const placeholders = subject?.chapters.filter((c) => /^Chapter \d+$/.test(c.title)).length ?? 0;

  // Wraps a mutation: busy flag, toast on error, reload after.
  const mutate = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
      void load();
    }
  };

  const moveChapter = (group: Group, index: number, direction: -1 | 1) => {
    const ids = move(group.chapters, index, direction).map((c) => c.id);
    // Optimistic: groups are filters over `chapters`, so write the reordered
    // chapters back into the same array slots the group occupies.
    setSubject((s) => {
      if (!s) return s;
      const partId = group.part?.id ?? null;
      const byId = new Map(s.chapters.map((c) => [c.id, c]));
      let next = 0;
      return { ...s, chapters: s.chapters.map((c) => (c.partId === partId ? byId.get(ids[next++])! : c)) };
    });
    void mutate(() =>
      apiJson(`/api/admin/subjects/${id}/chapters/reorder`, { method: "PUT", json: { partId: group.part?.id ?? null, ids } })
    );
  };

  const movePart = (index: number, direction: -1 | 1) => {
    if (!subject) return;
    const ids = move(subject.parts, index, direction).map((p) => p.id);
    void mutate(() => apiJson(`/api/admin/subjects/${id}/parts/reorder`, { method: "PUT", json: { ids } }));
  };

  const togglePublish = (chapter: Chapter, isPublished: boolean) => {
    setSubject((s) => (s ? { ...s, chapters: s.chapters.map((c) => (c.id === chapter.id ? { ...c, isPublished } : c)) } : s));
    void mutate(() => apiJson(`/api/admin/chapters/${chapter.id}`, { method: "PATCH", json: { isPublished } }));
  };

  const setAllPublished = async (isPublished: boolean) => {
    if (!subject) return;
    const targets = subject.chapters.filter((c) => c.isPublished !== isPublished);
    if (!targets.length) return;
    if (
      !(await confirm({
        title: `${isPublished ? "Publish" : "Unpublish"} all ${targets.length} chapters?`,
        description: isPublished ? "Students will see every chapter of this subject." : "Students won't see any chapter of this subject.",
        confirmLabel: isPublished ? "Publish all" : "Unpublish all",
      }))
    )
      return;
    void mutate(
      () => Promise.all(targets.map((c) => apiJson(`/api/admin/chapters/${c.id}`, { method: "PATCH", json: { isPublished } }))),
      `${targets.length} chapters ${isPublished ? "published" : "unpublished"}`
    );
  };

  const deleteChapter = async (chapter: Chapter) => {
    if (!(await confirm({ title: `Delete “${chapter.title}”?`, description: "This can't be undone.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/chapters/${chapter.id}`, { method: "DELETE" });
      toast.success("Chapter deleted");
    } catch (err) {
      const e = err as ApiError;
      // 409 = it has questions/videos: say exactly what would be lost, then force.
      if (e.status === 409 && (await confirm({ title: "This chapter has content", description: e.message, confirmLabel: "Delete everything", destructive: true }))) {
        await mutate(() => apiJson(`/api/admin/chapters/${chapter.id}?force=true`, { method: "DELETE" }), "Chapter and its content deleted");
        return;
      }
      if (e.status !== 409) toast.error(e.message);
    }
    void load();
  };

  const deletePart = async (group: Group) => {
    if (!group.part) return;
    const ok = await confirm({
      title: `Delete “${group.part.title}”?`,
      description: group.chapters.length
        ? `Its ${group.chapters.length} chapters are kept — they move to the main chapter list.`
        : "This part is empty.",
      confirmLabel: "Delete part",
      destructive: true,
    });
    if (ok) void mutate(() => apiJson(`/api/admin/parts/${group.part!.id}`, { method: "DELETE" }), "Part deleted");
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="h-9 px-2">
          <Link href="/catalog/subjects">
            <ArrowLeftIcon /> All subjects
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t open this subject</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-[480px] rounded-2xl" />
      </div>
    );
  }

  const backHref = `/catalog/subjects?medium=${subject.medium.id}&class=${subject.classLevel.slug}`;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground">
        <Link href={backHref}>
          <ArrowLeftIcon /> {subject.medium.name} · {subject.classLevel.name}
        </Link>
      </Button>

      <PageHeader
        title={subject.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {subject.nativeName && <span lang="as">{subject.nativeName}</span>}
            {subject.isActive && (
              <a
                href={siteLink(`/${subject.medium.slug}/${subject.classLevel.slug}/${subject.slug}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs hover:text-foreground hover:underline"
              >
                View on site <ExternalLinkIcon className="size-3" />
              </a>
            )}
            {!subject.isActive && <Badge variant="outline">Hidden from students</Badge>}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              className={actionButton}
              onClick={() =>
                setSubjectDialog({ subject, mediumId: subject.medium.id, mediumName: subject.medium.name, mediumSlug: subject.medium.slug, classId: subject.classLevel.id, className: subject.classLevel.name, classSlug: subject.classLevel.slug })
              }
            >
              <PencilIcon /> Rename
            </Button>
            <Button className={pressable} onClick={() => setBulk({ partId: null })}>
              <ListPlusIcon /> Add chapters
            </Button>
          </>
        }
      />

      {/* Summary + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary" className="tabular-nums">
          {subject.chapters.length} chapters
        </Badge>
        <Badge variant="secondary" className="tabular-nums">
          {published} published
        </Badge>
        {placeholders > 0 && (
          <Badge variant="outline" className="border-warning/40 text-warning tabular-nums">
            {placeholders} placeholder name{placeholders === 1 ? "" : "s"}
          </Badge>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => setAllPublished(true)}>
            Publish all
          </Button>
          <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => setAllPublished(false)}>
            Unpublish all
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setPartDialog({ part: null })}>
            <FolderPlusIcon /> Add part
          </Button>
        </span>
      </div>

      {subject.chapters.length === 0 && subject.parts.length === 0 ? (
        <Card className={`${formCard} items-center px-6 py-14 text-center`}>
          <p className="font-heading text-lg font-bold">No chapters yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add numbered placeholders now and rename them when the chapter list arrives — or add parts first if the book is split into parts.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button className={pressable} onClick={() => setBulk({ partId: null })}>
              <ListPlusIcon /> Add chapters
            </Button>
            <Button variant="outline" className={actionButton} onClick={() => setPartDialog({ part: null })}>
              <FolderPlusIcon /> Add a part
            </Button>
          </div>
        </Card>
      ) : (
        groups.map((group) => {
          const partIndex = group.part ? subject.parts.findIndex((p) => p.id === group.part!.id) : -1;
          return (
            <Card key={group.part?.id ?? "main"} className={`${formCard} gap-0 py-0`}>
              <div className="flex items-center gap-2 border-b px-2 py-2.5 sm:px-4">
                {group.part && (
                  <ReorderButtons index={partIndex} count={subject.parts.length} onMove={(d) => movePart(partIndex, d)} label={group.part.title} disabled={busy} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading font-bold">{group.part ? group.part.title : "Main chapters"}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.chapters.length} chapter{group.chapters.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setBulk({ partId: group.part?.id ?? null })}>
                  <PlusIcon /> <span className="hidden sm:inline">Add</span>
                </Button>
                {group.part && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${group.part.title}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setPartDialog({ part: group.part })}>
                        <PencilIcon /> Rename part
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => deletePart(group)}>
                        <Trash2Icon /> Delete part
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <ul className="divide-y">
                {group.chapters.map((chapter, index) => (
                  <ChapterRow
                    key={chapter.id}
                    chapter={chapter}
                    contentHref={`/catalog/subjects/${subject.id}/chapters/${chapter.id}`}
                    index={index}
                    count={group.chapters.length}
                    busy={busy}
                    onMove={(d) => moveChapter(group, index, d)}
                    onTogglePublish={(v) => togglePublish(chapter, v)}
                    onEdit={() => setEditChapter(chapter)}
                    onDelete={() => deleteChapter(chapter)}
                  />
                ))}
                {group.chapters.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">No chapters in this part yet.</li>
                )}
              </ul>
            </Card>
          );
        })
      )}

      <ChapterDialog chapter={editChapter} parts={subject.parts} linkPrefix={`/${subject.medium.slug}/${subject.classLevel.slug}/${subject.slug}/`} onClose={() => setEditChapter(null)} onSaved={() => void load()} />
      <BulkAddDialog target={bulk} subjectId={subject.id} parts={subject.parts} onClose={() => setBulk(null)} onSaved={() => void load()} />
      <PartDialog target={partDialog} subjectId={subject.id} onClose={() => setPartDialog(null)} onSaved={() => void load()} />
      <SubjectDialog target={subjectDialog} onClose={() => setSubjectDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
