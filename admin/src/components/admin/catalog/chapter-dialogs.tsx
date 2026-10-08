"use client";

import { FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/admin/settings/field";
import { inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { Chapter, Part } from "@/lib/catalog";
import { LinkPreview } from "./link-preview";

const NO_PART = "__none";

// Resets a dialog's local state each time it opens with a new target.
function useResetOnOpen<T>(target: T | null, reset: (t: T) => void) {
  const [last, setLast] = useState<T | null>(null);
  if (target !== last) {
    setLast(target);
    if (target) reset(target);
  }
}

function PartSelect({ id, parts, value, onChange }: { id: string; parts: Part[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <Select value={value ?? NO_PART} onValueChange={(v) => onChange(v === NO_PART ? null : v)}>
      <SelectTrigger id={id} className="h-10 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PART}>No part (main chapters)</SelectItem>
        {parts.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Edit one chapter: title, number, part (and, rarely, its link)
// ---------------------------------------------------------------------------

export function ChapterDialog({
  chapter,
  parts,
  linkPrefix,
  onClose,
  onSaved,
}: {
  chapter: Chapter | null;
  parts: Part[];
  linkPrefix: string; // "/medium/class-n/subject/"
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState({ title: "", number: 1, slug: "", partId: null as string | null });
  const [customSlug, setCustomSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useResetOnOpen(chapter, (c) => {
    setForm({ title: c.title, number: c.number, slug: c.slug, partId: c.partId });
    setCustomSlug(false);
    setError(null);
  });

  // Same rule as the backend: an automatic "chapter-N" link follows the number.
  const autoSlug = chapter ? new RegExp(`^chapter-${chapter.number}(-\\d+)?$`).test(chapter.slug) : false;
  const shownSlug = customSlug ? form.slug : autoSlug && form.number !== chapter?.number ? `chapter-${form.number}` : (chapter?.slug ?? "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chapter) return;
    setBusy(true);
    setError(null);
    try {
      const { slug, ...rest } = form;
      await apiJson(`/api/admin/chapters/${chapter.id}`, { method: "PATCH", json: customSlug && slug ? { ...rest, slug } : rest });
      toast.success("Chapter saved");
      onSaved();
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setError(e.status === 409 ? "Another chapter of this subject already uses that link. Choose a different one." : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={chapter !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit chapter</DialogTitle>
            <DialogDescription>Placeholder names like “Chapter 3” can be replaced with the real lesson name.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-title`} label="Chapter name">
            <Input
              id={`${id}-title`}
              className={inputClass}
              value={form.title}
              required
              autoFocus
              lang="as"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-[110px_1fr]">
            <Field id={`${id}-number`} label="Number">
              <Input
                id={`${id}-number`}
                className={inputClass}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: Number(e.target.value) }))}
              />
            </Field>
            <Field id={`${id}-part`} label="Part">
              <PartSelect id={`${id}-part`} parts={parts} value={form.partId} onChange={(partId) => setForm((f) => ({ ...f, partId }))} />
            </Field>
          </div>
          <LinkPreview
            id={`${id}-slug`}
            prefix={linkPrefix}
            value={shownSlug}
            editing
            custom={customSlug}
            onCustom={(slug) => {
              setCustomSlug(slug !== null);
              setForm((f) => ({ ...f, slug: slug ?? chapter?.slug ?? "" }));
            }}
          />
          {!customSlug && shownSlug !== chapter?.slug && (
            <p className="-mt-3 text-xs text-muted-foreground">The link changes to match the new chapter number.</p>
          )}
          {form.partId !== chapter?.partId && (
            <p className="text-xs text-muted-foreground">Moving to another part puts the chapter at the end of that part.</p>
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
              {busy && <Loader2Icon className="animate-spin" />} Save chapter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add N placeholder chapters to a part (or to the main group)
// ---------------------------------------------------------------------------

export function BulkAddDialog({
  target,
  subjectId,
  parts,
  onClose,
  onSaved,
}: {
  // partId to preselect (null = main group); null target = closed
  target: { partId: string | null } | null;
  subjectId: string;
  parts: Part[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [count, setCount] = useState(10);
  const [partId, setPartId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useResetOnOpen(target, (t) => {
    setPartId(t.partId);
    setCount(10);
    setError(null);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ message: string; firstNumber: number; lastNumber: number }>(`/api/admin/subjects/${subjectId}/chapters/bulk`, {
        method: "POST",
        json: { count, partId },
      });
      toast.success(res.message, { description: `Chapter ${res.firstNumber} to ${res.lastNumber}` });
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
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">Add chapters</DialogTitle>
            <DialogDescription>Creates numbered placeholders (“Chapter 1”, “Chapter 2”, …) you can rename later.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-count`} label="How many?">
            <Input
              id={`${id}-count`}
              className={inputClass}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={count}
              autoFocus
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
          <Field id={`${id}-part`} label="Add to">
            <PartSelect id={`${id}-part`} parts={parts} value={partId} onChange={setPartId} />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className={pressable} disabled={busy || count < 1 || count > 100}>
              {busy && <Loader2Icon className="animate-spin" />} Add {count > 0 ? count : ""} chapter{count === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Create / rename a part ("Part 1", "Book 2", "Writing Skills", ...)
// ---------------------------------------------------------------------------

export function PartDialog({
  target,
  subjectId,
  onClose,
  onSaved,
}: {
  target: { part: Part | null } | null;
  subjectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useResetOnOpen(target, (t) => {
    setTitle(t.part?.title ?? "");
    setError(null);
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      if (target.part) await apiJson(`/api/admin/parts/${target.part.id}`, { method: "PATCH", json: { title } });
      else await apiJson(`/api/admin/subjects/${subjectId}/parts`, { method: "POST", json: { title } });
      toast.success(target.part ? "Part renamed" : `${title} added`);
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
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{target?.part ? "Rename part" : "New part"}</DialogTitle>
            <DialogDescription>Groups chapters, e.g. “Part 1”, “Book 2” or “Writing Skills”.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-title`} label="Part name">
            <Input id={`${id}-title`} className={inputClass} value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />
          </Field>
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
              {busy && <Loader2Icon className="animate-spin" />} {target?.part ? "Save" : "Add part"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
