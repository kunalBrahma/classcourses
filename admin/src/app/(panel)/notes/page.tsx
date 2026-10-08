"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileCheck2Icon, FileWarningIcon, GiftIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, ShieldAlertIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/page-header";
import { GrantDialog, NoteDialog, UploadDialog } from "@/components/admin/sales/note-dialogs";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { rupees } from "@/lib/people";
import { formatBytes, NoteRow } from "@/lib/sales";
import { cn } from "@/lib/utils";

export default function NotesPage() {
  const confirm = useConfirm();
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [privateBucket, setPrivateBucket] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<{ note: NoteRow | null } | null>(null);
  const [uploadNote, setUploadNote] = useState<NoteRow | null>(null);
  const [grantNote, setGrantNote] = useState<NoteRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ notes: NoteRow[]; privateBucketConfigured: boolean }>("/api/admin/notes")
        .then((res) => {
          setNotes(res.notes);
          setPrivateBucket(res.privateBucketConfigured);
        })
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  const togglePublish = async (note: NoteRow, isPublished: boolean) => {
    if (isPublished && !note.hasFile) {
      toast.error("Upload the PDF first", { description: "A note can only be published once its PDF is uploaded." });
      return;
    }
    setBusyId(note.id);
    try {
      await apiJson(`/api/admin/notes/${note.id}`, { method: "PATCH", json: { isPublished } });
      setNotes((list) => list?.map((n) => (n.id === note.id ? { ...n, isPublished } : n)) ?? null);
      toast.success(isPublished ? "Note published" : "Note hidden");
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (note: NoteRow) => {
    if (note.paidOrders > 0 || note.buyers > 0) {
      await confirm({
        title: "This note can't be deleted",
        description: "Students have ordered it, and their receipts point to it. Switch it off (unpublish) instead — buyers keep their access.",
        confirmLabel: "OK",
      });
      return;
    }
    if (!(await confirm({ title: `Delete “${note.title}”?`, description: "The note and its PDF are removed. This can't be undone.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/notes/${note.id}`, { method: "DELETE" });
      toast.success("Note deleted");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Premium notes"
        description="PDF notes students can buy (or download free). Students see a note only when it's published and its PDF is uploaded."
        actions={
          <Button className={pressable} onClick={() => setEditTarget({ note: null })}>
            <PlusIcon /> New note
          </Button>
        }
      />

      {!privateBucket && (
        <Alert className="border-warning/40 bg-warning/10">
          <ShieldAlertIcon className="text-warning" />
          <AlertTitle>PDF uploads and sales are paused</AlertTitle>
          <AlertDescription>
            Notes are stored in a separate private R2 bucket, which isn&apos;t set up yet. You can create and price notes now; uploading PDFs and selling
            start once it&apos;s added in <Link href="/settings/storage" className="font-medium underline">Settings → Storage</Link>.
          </AlertDescription>
        </Alert>
      )}

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!notes && !error && <Skeleton className="h-80 rounded-2xl" />}

      {notes && notes.length === 0 && (
        <Card className={cn(formCard, "items-center px-6 py-14 text-center")}>
          <p className="font-heading text-lg font-bold">No notes yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Create a note for a chapter or a whole subject, set its price, then upload the PDF.</p>
          <Button className={cn(pressable, "mt-2")} onClick={() => setEditTarget({ note: null })}>
            <PlusIcon /> Create the first note
          </Button>
        </Card>
      )}

      {notes && notes.length > 0 && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {notes.map((note) => {
              const where = note.chapter ? `${note.chapter.subject.name} › ${note.chapter.title}` : note.subject ? `${note.subject.name} · whole subject` : "Not attached";
              return (
                <li key={note.id} className={cn("flex items-start gap-3 px-3 py-3 sm:px-4", !note.isPublished && "bg-muted/30")}>
                  <span
                    className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl", note.hasFile ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning")}
                    title={note.hasFile ? "PDF uploaded" : "No PDF yet"}
                  >
                    {note.hasFile ? <FileCheck2Icon className="size-5" /> : <FileWarningIcon className="size-5" />}
                  </span>
                  <button type="button" onClick={() => setEditTarget({ note })} className="min-w-0 flex-1 rounded-lg text-left hover:bg-muted/40">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold" lang="as">{note.title}</span>
                      {note.isFree ? (
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Free</Badge>
                      ) : (
                        <Badge variant="secondary" className="tabular-nums">{rupees(note.pricePaise)}</Badge>
                      )}
                      {!note.isPublished && <Badge variant="outline">Hidden</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" lang="as">{where}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {note.hasFile ? `PDF ${formatBytes(note.fileSize)}` : <span className="text-warning">No PDF uploaded</span>}
                      {" · "}
                      {note.buyers} {note.isFree ? "with access" : `buyer${note.buyers === 1 ? "" : "s"}`}
                    </span>
                  </button>
                  <Switch
                    className="mt-2"
                    checked={note.isPublished}
                    disabled={busyId === note.id}
                    onCheckedChange={(v) => togglePublish(note, v)}
                    aria-label={`${note.title} published`}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="mt-0.5 size-9" aria-label={`Actions for ${note.title}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditTarget({ note })}><PencilIcon /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setUploadNote(note)}><UploadIcon /> {note.hasFile ? "Replace PDF" : "Upload PDF"}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setGrantNote(note)}><GiftIcon /> Give to a student</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(note)}><Trash2Icon /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <NoteDialog target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => void load()} />
      <UploadDialog note={uploadNote} privateBucketReady={privateBucket} onClose={() => setUploadNote(null)} onDone={() => void load()} />
      <GrantDialog note={grantNote} onClose={() => setGrantNote(null)} onDone={() => void load()} />
    </div>
  );
}
