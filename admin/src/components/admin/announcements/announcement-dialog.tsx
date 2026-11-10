"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/admin/editor/rich-text-editor";
import { LinkPicker } from "@/components/admin/banners/link-picker";
import { Field } from "@/components/admin/settings/field";
import { inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { uploadPicture, Picture } from "@/lib/banner-image";
import { LinkForm, linkFormFrom, linkFromForm } from "@/lib/banners";
import { Announcement, fromLocalInput, toLocalInput } from "@/lib/engagement";

const EVERY_CLASS = "__every";

interface Form {
  title: string;
  bodyHtml: string;
  picture: Picture | null;
  link: LinkForm;
  linkLabel: string;
  audience: "EVERYONE" | "STUDENTS";
  classLevelId: string | null;
  isPublished: boolean;
  startsAt: string;
  endsAt: string;
}

const formFrom = (a: Announcement | null): Form => ({
  title: a?.title ?? "",
  bodyHtml: a?.bodyHtml ?? "",
  picture: a?.imageUrl ? { url: a.imageUrl, width: a.imageWidth ?? 0, height: a.imageHeight ?? 0 } : null,
  link: linkFormFrom(a?.link),
  linkLabel: a?.linkLabel ?? "",
  audience: a?.audience ?? "EVERYONE",
  classLevelId: a?.classLevelId ?? null,
  isPublished: a?.isPublished ?? true,
  startsAt: toLocalInput(a?.startsAt ?? null),
  endsAt: toLocalInput(a?.endsAt ?? null),
});

export function AnnouncementDialog({ target, onClose, onSaved }: { target: { item: Announcement | null } | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(formFrom(null));
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form when opened ("previous target" pattern)
  const [last, setLast] = useState<typeof target>(null);
  if (target !== last) {
    setLast(target);
    if (target) {
      setForm(formFrom(target.item));
      setError(null);
    }
  }

  useEffect(() => {
    apiJson<{ classes: { id: string; name: string }[] }>("/api/admin/classes").then((r) => setClasses(r.classes)).catch(() => undefined);
  }, []);

  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const pick = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      update({ picture: await uploadPicture(file, 1200) });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    let link: string | null;
    try {
      link = linkFromForm(form.link);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setBusy(true);
    const body = {
      title: form.title.trim(),
      bodyHtml: form.bodyHtml,
      imageUrl: form.picture?.url ?? null,
      imageWidth: form.picture?.width || null,
      imageHeight: form.picture?.height || null,
      link,
      linkLabel: link ? form.linkLabel.trim() || null : null,
      audience: form.audience,
      classLevelId: form.audience === "STUDENTS" ? form.classLevelId : null,
      isPublished: form.isPublished,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
    };
    try {
      if (target?.item) await apiJson(`/api/admin/announcements/${target.item.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/announcements", { method: "POST", json: body });
      toast.success(target?.item ? "Announcement saved" : "Announcement added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{target?.item ? "Edit announcement" : "New announcement"}</DialogTitle>
            <DialogDescription>Shown on the home page, newest first. Keep it short: a title, a line or two, and a link if there&apos;s more to read.</DialogDescription>
          </DialogHeader>

          <Field id={`${id}-title`} label="Title">
            <Input id={`${id}-title`} className={inputClass} value={form.title} onChange={(e) => update({ title: e.target.value })} maxLength={120} lang="as" placeholder="E.g. Class 10 exam routine is out" />
          </Field>
          <div className="grid gap-2">
            <span className="text-sm font-semibold">Message <span className="font-normal text-muted-foreground">(optional)</span></span>
            <RichTextEditor key={target?.item?.id ?? "new"} compact ariaLabel="Announcement message" value={form.bodyHtml} onChange={(html) => update({ bodyHtml: html })} minHeight="6rem" />
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-semibold">Picture <span className="font-normal text-muted-foreground">(optional)</span></span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label={form.picture ? "Change picture" : "Add a picture"} className="relative grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 text-muted-foreground hover:border-primary/50">
                {form.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket
                  <img src={form.picture.url} alt="" className="size-full object-contain" />
                ) : (
                  !uploading && <ImagePlusIcon className="size-5" />
                )}
                {uploading && <span className="absolute inset-0 grid place-items-center bg-background/60"><Loader2Icon className="size-5 animate-spin" /></span>}
              </button>
              <p className="text-xs text-muted-foreground">Shown whole, never cut off. PNG, JPG or WebP.</p>
              {form.picture && (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => update({ picture: null })}><XIcon /> Remove</Button>
              )}
            </div>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
          </div>

          <LinkPicker value={form.link} onChange={(link) => update({ link })} />
          {form.link.kind !== "none" && (
            <Field id={`${id}-label`} label={<>Button text <span className="font-normal text-muted-foreground">(optional)</span></>} hint="Default: “Read more”.">
              <Input id={`${id}-label`} className={inputClass} value={form.linkLabel} onChange={(e) => update({ linkLabel: e.target.value })} maxLength={40} lang="as" />
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-who`} label="Who sees it">
              <Select value={form.audience} onValueChange={(v) => update({ audience: v as Form["audience"] })}>
                <SelectTrigger id={`${id}-who`} className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EVERYONE">Everyone</SelectItem>
                  <SelectItem value="STUDENTS">Signed-in students only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.audience === "STUDENTS" && (
              <Field id={`${id}-class`} label="Class">
                <Select value={form.classLevelId ?? EVERY_CLASS} onValueChange={(v) => update({ classLevelId: v === EVERY_CLASS ? null : v })}>
                  <SelectTrigger id={`${id}-class`} className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EVERY_CLASS}>Every class</SelectItem>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-start`} label={<>Show from <span className="font-normal text-muted-foreground">(optional)</span></>} hint="Default: straight away.">
              <Input id={`${id}-start`} type="datetime-local" className={inputClass} value={form.startsAt} onChange={(e) => update({ startsAt: e.target.value })} />
            </Field>
            <Field id={`${id}-end`} label={<>Hide after <span className="font-normal text-muted-foreground">(optional)</span></>} hint="Default: until you remove it.">
              <Input id={`${id}-end`} type="datetime-local" className={inputClass} value={form.endsAt} onChange={(e) => update({ endsAt: e.target.value })} />
            </Field>
          </div>

          <label htmlFor={`${id}-on`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span className="text-sm font-semibold">Published</span>
            <Switch id={`${id}-on`} checked={form.isPublished} onCheckedChange={(v) => update({ isPublished: v })} />
          </label>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" className={pressable} disabled={busy || uploading || !form.title.trim()}>
              {busy && <Loader2Icon className="animate-spin" />} {target?.item ? "Save" : "Add announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
