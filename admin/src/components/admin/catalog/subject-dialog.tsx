"use client";

import { FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/admin/settings/field";
import { inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { slugify } from "@/lib/catalog";
import { LinkPreview } from "@/components/admin/catalog/link-preview";

export interface SubjectDialogTarget {
  // Edit an existing subject, or create one in mediumId + classId.
  subject?: { id: string; name: string; nativeName: string | null; slug: string; isActive: boolean };
  mediumId: string;
  mediumName: string;
  mediumSlug: string;
  classId: string;
  className: string;
  classSlug: string;
}

export function SubjectDialog({
  target,
  onClose,
  onSaved,
}: {
  target: SubjectDialogTarget | null;
  onClose: () => void;
  onSaved: (subject: { id: string }) => void;
}) {
  const id = useId();
  const [form, setForm] = useState({ name: "", nativeName: "", slug: "", isActive: true });
  const [customSlug, setCustomSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a new target opens the dialog.
  const [lastTarget, setLastTarget] = useState<SubjectDialogTarget | null>(null);
  if (target !== lastTarget) {
    setLastTarget(target);
    if (target) {
      const s = target.subject;
      setForm(s ? { name: s.name, nativeName: s.nativeName ?? "", slug: s.slug, isActive: s.isActive } : { name: "", nativeName: "", slug: "", isActive: true });
      setCustomSlug(false);
      setError(null);
    }
  }

  const editing = Boolean(target?.subject);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      // The link is made by the server unless the admin chose one by hand.
      const common = { name: form.name, nativeName: form.nativeName || null, slug: customSlug && form.slug ? form.slug : undefined, isActive: form.isActive };
      const { subject } = target.subject
        ? await apiJson<{ subject: { id: string } }>(`/api/admin/subjects/${target.subject.id}`, { method: "PATCH", json: common })
        : await apiJson<{ subject: { id: string } }>("/api/admin/subjects", {
            method: "POST",
            json: { ...common, mediumId: target.mediumId, classId: target.classId },
          });
      toast.success(editing ? "Subject updated" : `${form.name} added to ${target.className}`);
      onSaved(subject);
      onClose();
    } catch (err) {
      const e = err as ApiError;
      setError(e.status === 409 && customSlug ? "Another subject in this class already uses this link. Choose a different one." : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit subject" : "New subject"}</DialogTitle>
            <DialogDescription>
              {target?.mediumName} · {target?.className}
            </DialogDescription>
          </DialogHeader>
          <Field id={`${id}-name`} label="Name (English)">
            <Input
              id={`${id}-name`}
              className={inputClass}
              value={form.name}
              placeholder="e.g. General Science"
              required
              autoFocus
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name }));
              }}
            />
          </Field>
          <Field id={`${id}-native`} label="Name in Assamese (optional)" hint="Shown next to the English name, e.g. বিজ্ঞান.">
            <Input
              id={`${id}-native`}
              className={inputClass}
              lang="as"
              value={form.nativeName}
              onChange={(e) => setForm((f) => ({ ...f, nativeName: e.target.value }))}
            />
          </Field>
          <LinkPreview
            id={`${id}-slug`}
            prefix={`/${target?.mediumSlug ?? ""}/${target?.classSlug ?? ""}/`}
            value={customSlug ? form.slug : target?.subject ? target.subject.slug : slugify(form.name)}
            editing={editing}
            custom={customSlug}
            onCustom={(slug) => {
              setCustomSlug(slug !== null);
              setForm((f) => ({ ...f, slug: slug ?? target?.subject?.slug ?? "" }));
            }}
          />
          <label htmlFor={`${id}-active`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span className="text-sm font-semibold">Visible to students</span>
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
            <Button type="submit" className={pressable} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />} {editing ? "Save" : "Add subject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
