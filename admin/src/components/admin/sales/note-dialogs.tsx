"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileUpIcon, Loader2Icon, SearchIcon, UploadCloudIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/settings/field";
import { inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { ClassLevel, Medium, SubjectRow, SubjectTree } from "@/lib/catalog";
import { formatBytes, NoteRow } from "@/lib/sales";
import { cn } from "@/lib/utils";

const WHOLE_SUBJECT = "__subject";
const MAX_PDF = 50 * 1024 * 1024;

function useResetOnOpen<T>(target: T | null, reset: (t: T) => void) {
  const [last, setLast] = useState<T | null>(null);
  if (target !== last) {
    setLast(target);
    if (target) reset(target);
  }
}

// ---------------------------------------------------------------------------
// Medium → Class → Subject → (whole subject | chapter)
// ---------------------------------------------------------------------------

export interface Attachment {
  subjectId: string | null;
  chapterId: string | null;
}

function AttachPicker({ value, onChange }: { value: Attachment; onChange: (a: Attachment) => void }) {
  const id = useId();
  const [mediums, setMediums] = useState<Medium[]>([]);
  const [mediumId, setMediumId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [classes, setClasses] = useState<ClassLevel[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [tree, setTree] = useState<SubjectTree | null>(null);

  useEffect(() => {
    apiJson<{ mediums: Medium[] }>("/api/admin/mediums").then(({ mediums }) => setMediums(mediums)).catch(() => undefined);
    apiJson<{ classes: ClassLevel[] }>("/api/admin/classes").then(({ classes }) => setClasses(classes)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!mediumId || !classId) return;
    apiJson<{ subjects: SubjectRow[] }>(`/api/admin/subjects?mediumId=${mediumId}&classId=${classId}`)
      .then(({ subjects }) => setSubjects(subjects.sort((a, b) => a.order - b.order)))
      .catch(() => setSubjects([]));
  }, [mediumId, classId]);

  useEffect(() => {
    if (!value.subjectId) return;
    apiJson<{ subject: SubjectTree }>(`/api/admin/subjects/${value.subjectId}`).then(({ subject }) => setTree(subject)).catch(() => setTree(null));
  }, [value.subjectId]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-m`} className="text-xs text-muted-foreground">Medium</Label>
        <Select value={mediumId} onValueChange={(v) => { setMediumId(v); setSubjects([]); onChange({ subjectId: null, chapterId: null }); }}>
          <SelectTrigger id={`${id}-m`} className="h-10 w-full"><SelectValue placeholder="Choose medium" /></SelectTrigger>
          <SelectContent>{mediums.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-c`} className="text-xs text-muted-foreground">Class</Label>
        <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjects([]); onChange({ subjectId: null, chapterId: null }); }} disabled={!mediumId}>
          <SelectTrigger id={`${id}-c`} className="h-10 w-full"><SelectValue placeholder="Choose class" /></SelectTrigger>
          <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-s`} className="text-xs text-muted-foreground">Subject</Label>
        <Select value={value.subjectId ?? ""} onValueChange={(v) => { setTree(null); onChange({ subjectId: v, chapterId: null }); }} disabled={!subjects.length}>
          <SelectTrigger id={`${id}-s`} className="h-10 w-full">
            <SelectValue placeholder={mediumId && classId && !subjects.length ? "No subjects" : "Choose subject"} />
          </SelectTrigger>
          <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-ch`} className="text-xs text-muted-foreground">Chapter</Label>
        <Select
          value={value.chapterId ?? WHOLE_SUBJECT}
          onValueChange={(v) => onChange({ subjectId: value.subjectId, chapterId: v === WHOLE_SUBJECT ? null : v })}
          disabled={!value.subjectId || !tree}
        >
          <SelectTrigger id={`${id}-ch`} className="h-10 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={WHOLE_SUBJECT}>Whole subject</SelectItem>
            {tree?.chapters.map((c) => <SelectItem key={c.id} value={c.id}>{c.number}. {c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit a note
// ---------------------------------------------------------------------------

export function NoteDialog({ target, onClose, onSaved }: { target: { note: NoteRow | null } | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [form, setForm] = useState({ title: "", description: "", isFree: false, price: "49" });
  const [attach, setAttach] = useState<Attachment>({ subjectId: null, chapterId: null });
  const [changeAttach, setChangeAttach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useResetOnOpen(target, ({ note }) => {
    setForm({
      title: note?.title ?? "",
      description: note?.description ?? "",
      isFree: note?.isFree ?? false,
      price: note ? String(note.pricePaise / 100) : "49",
    });
    setAttach({ subjectId: null, chapterId: null });
    setChangeAttach(!note);
    setError(null);
  });

  const note = target?.note ?? null;
  const currentAttach = note?.chapter ? `${note.chapter.subject.name} › ${note.chapter.title}` : note?.subject ? `${note.subject.name} (whole subject)` : "Not attached";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pricePaise = Math.round(Number(form.price) * 100);
    if (!form.isFree && (!Number.isFinite(pricePaise) || pricePaise < 100)) {
      setError("A paid note must cost at least ₹1. Switch on “Free” otherwise.");
      return;
    }
    if (changeAttach && !attach.subjectId) {
      setError("Choose the subject (and optionally the chapter) this note belongs to.");
      return;
    }
    setBusy(true);
    setError(null);
    const where = changeAttach ? (attach.chapterId ? { chapterId: attach.chapterId } : { subjectId: attach.subjectId }) : {};
    const body = { title: form.title.trim(), description: form.description.trim() || null, isFree: form.isFree, ...(form.isFree ? {} : { pricePaise }), ...where };
    try {
      if (note) await apiJson(`/api/admin/notes/${note.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/notes", { method: "POST", json: body });
      toast.success(note ? "Note saved" : "Note created", { description: note ? undefined : "Next: upload the PDF, then publish it." });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{note ? "Edit note" : "New premium note"}</DialogTitle>
            <DialogDescription>A downloadable PDF, sold per chapter or for a whole subject.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-t`} label="Title">
            <Input id={`${id}-t`} className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Chapter 3 — complete notes" lang="as" required autoFocus />
          </Field>
          <Field id={`${id}-d`} label="Description (optional)" hint="What's inside — shown on the note's page.">
            <Textarea id={`${id}-d`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} lang="as" className="min-h-20" maxLength={2000} />
          </Field>

          <div className="grid gap-2">
            <Label className="text-sm font-semibold">Belongs to</Label>
            {changeAttach ? (
              <AttachPicker value={attach} onChange={setAttach} />
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
                <span className="min-w-0 truncate" lang="as">{currentAttach}</span>
                <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setChangeAttach(true)}>Change</Button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field id={`${id}-p`} label="Price">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">₹</span>
                <Input
                  id={`${id}-p`}
                  className={cn(inputClass, "pl-7 tabular-nums")}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={10000}
                  step={0.5}
                  value={form.isFree ? "" : form.price}
                  disabled={form.isFree}
                  placeholder={form.isFree ? "Free" : undefined}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
            </Field>
            <label htmlFor={`${id}-free`} className="flex h-10 cursor-pointer items-center gap-3 rounded-xl border px-3">
              <span className="text-sm font-medium">Free</span>
              <Switch id={`${id}-free`} checked={form.isFree} onCheckedChange={(isFree) => setForm((f) => ({ ...f, isFree }))} />
            </label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {form.isFree ? "Free notes still need a student login to download." : "Students can pay part of it with coins (Settings → Quiz & coins)."}
          </p>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>Cancel</Button>
            <Button type="submit" className={pressable} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />} {note ? "Save" : "Create note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Upload the PDF (presigned PUT to the PRIVATE bucket, with progress)
// ---------------------------------------------------------------------------

// fetch() can't report upload progress — XMLHttpRequest can.
const putWithProgress = (url: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, `Upload failed (${xhr.status}).`)));
    // Network errors include a bucket CORS policy that doesn't allow this site.
    xhr.onerror = () => reject(new ApiError(0, "Upload blocked by the storage bucket. Add the CORS policy shown in Settings → Storage to the private bucket, then try again."));
    xhr.send(file);
  });

export function UploadDialog({ note, privateBucketReady, onClose, onDone }: { note: NoteRow | null; privateBucketReady: boolean; onClose: () => void; onDone: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useResetOnOpen(note, () => {
    setFile(null);
    setProgress(null);
    setError(null);
  });

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return setError("Only PDF files can be uploaded.");
    if (f.size > MAX_PDF) return setError(`That PDF is ${formatBytes(f.size)} — the limit is 50 MB.`);
    setFile(f);
  };

  const upload = async () => {
    if (!note || !file) return;
    setError(null);
    setProgress(0);
    try {
      const { key, uploadUrl, headers } = await apiJson<{ key: string; uploadUrl: string; headers: Record<string, string> }>(`/api/admin/notes/${note.id}/upload-url`, {
        method: "POST",
        json: { contentType: "application/pdf", size: file.size },
      });
      await putWithProgress(uploadUrl, file, headers, setProgress);
      await apiJson(`/api/admin/notes/${note.id}/file`, { method: "POST", json: { key } });
      toast.success("PDF uploaded", { description: note.isPublished ? "Students now get the new file." : "Publish the note when you're ready." });
      onDone();
      onClose();
    } catch (err) {
      setProgress(null);
      setError((err as ApiError).message);
    }
  };

  const uploading = progress !== null;

  return (
    <Dialog open={note !== null} onOpenChange={(open) => !open && !uploading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{note?.hasFile ? "Replace PDF" : "Upload PDF"}</DialogTitle>
          <DialogDescription lang="as">{note?.title}</DialogDescription>
        </DialogHeader>

        {!privateBucketReady ? (
          <Alert className="border-warning/40 bg-warning/10">
            <AlertTitle>No private bucket yet</AlertTitle>
            <AlertDescription>
              Note PDFs are kept in a separate <strong>private</strong> R2 bucket so they can&apos;t be downloaded without buying. Create it and add it in{" "}
              <Link href="/settings/storage" className="font-medium underline">Settings → Storage</Link> (with the CORS policy shown there), then come back.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pick(e.dataTransfer.files[0]);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
            >
              <UploadCloudIcon className="size-8 text-primary" />
              <span className="text-sm font-semibold">{file ? file.name : "Choose or drop a PDF"}</span>
              <span className="text-xs text-muted-foreground">{file ? formatBytes(file.size) : "Up to 50 MB"}</span>
            </button>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {uploading && (
              <div className="grid gap-1.5" role="status" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{progress < 100 ? `Uploading… ${progress}%` : "Checking the upload…"}</span>
              </div>
            )}
          </>
        )}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" disabled={uploading} onClick={onClose}>
            {privateBucketReady ? "Cancel" : "Close"}
          </Button>
          {privateBucketReady && (
            <Button className={pressable} disabled={!file || uploading} onClick={upload}>
              {uploading ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Upload
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Give a note to a student without payment (support)
// ---------------------------------------------------------------------------

interface UserHit {
  id: string;
  email: string;
  name: string | null;
}

export function GrantDialog({ note, onClose, onDone }: { note: NoteRow | null; onClose: () => void; onDone: () => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [selected, setSelected] = useState<UserHit | null>(null);
  const [busy, setBusy] = useState(false);

  useResetOnOpen(note, () => {
    setQuery("");
    setHits([]);
    setSelected(null);
  });

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const res = await apiJson<{ users: UserHit[] }>(`/api/admin/users?pageSize=8&search=${encodeURIComponent(query.trim())}`).catch(() => ({ users: [] }));
    setHits(res.users);
  };

  const grant = async () => {
    if (!note || !selected) return;
    setBusy(true);
    try {
      await apiJson(`/api/admin/notes/${note.id}/grant`, { method: "POST", json: { userId: selected.id } });
      toast.success(`${selected.name || selected.email} can now download this note`);
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={note !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Give note to a student</DialogTitle>
          <DialogDescription>For support cases — e.g. they paid but something went wrong. No payment or coins are involved.</DialogDescription>
        </DialogHeader>
        <form onSubmit={search} className="flex gap-2">
          <Input id={`${id}-q`} className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Student email or name" aria-label="Find student" autoFocus />
          <Button type="submit" variant="outline" className="h-10"><SearchIcon /> Find</Button>
        </form>
        {hits.length > 0 && (
          <ul role="listbox" aria-label="Students" className="max-h-56 divide-y overflow-auto rounded-xl border">
            {hits.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === u.id}
                  onClick={() => setSelected(u)}
                  className={cn("w-full px-3 py-2.5 text-left text-sm hover:bg-muted/50", selected?.id === u.id && "bg-primary/10")}
                >
                  <span className="block font-medium">{u.name || "—"}</span>
                  <span className="block text-xs text-muted-foreground">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" onClick={onClose}>Cancel</Button>
          <Button className={pressable} disabled={!selected || busy} onClick={grant}>
            {busy && <Loader2Icon className="animate-spin" />} Give access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
