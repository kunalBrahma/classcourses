"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLinkIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { Medium, move, slugify } from "@/lib/catalog";
import { LinkPreview } from "@/components/admin/catalog/link-preview";
import { siteLink } from "@/lib/site";

interface MediumForm {
  name: string;
  nativeName: string;
  slug: string;
  isActive: boolean;
}

function MediumDialog({
  medium,
  open,
  onOpenChange,
  onSaved,
}: {
  medium: Medium | null; // null = create
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState<MediumForm>({ name: "", nativeName: "", slug: "", isActive: true });
  const [customSlug, setCustomSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form every time the dialog opens.
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(
        medium
          ? { name: medium.name, nativeName: medium.nativeName ?? "", slug: medium.slug, isActive: medium.isActive }
          : { name: "", nativeName: "", slug: "", isActive: true }
      );
      setCustomSlug(false);
      setError(null);
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The link is made by the server unless the admin chose one by hand.
      const body = { name: form.name, nativeName: form.nativeName || null, slug: customSlug && form.slug ? form.slug : undefined, isActive: form.isActive };
      if (medium) await apiJson(`/api/admin/mediums/${medium.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/mediums", { method: "POST", json: body });
      toast.success(medium ? "Medium updated" : `${form.name} created`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const e = err as ApiError;
      setError(e.status === 409 && customSlug ? "Another medium already uses this link. Choose a different one." : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{medium ? "Edit medium" : "New medium"}</DialogTitle>
            <DialogDescription>Students pick a medium first, then their class.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-name`} label="Name">
            <Input
              id={`${id}-name`}
              className={inputClass}
              value={form.name}
              placeholder="e.g. Hindi Medium"
              required
              autoFocus
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name }));
              }}
            />
          </Field>
          <Field id={`${id}-native`} label="Name in its own script (optional)" hint="e.g. অসমীয়া মাধ্যম — shown next to the English name.">
            <Input
              id={`${id}-native`}
              className={inputClass}
              value={form.nativeName}
              lang="as"
              onChange={(e) => setForm((f) => ({ ...f, nativeName: e.target.value }))}
            />
          </Field>
          <LinkPreview
            id={`${id}-slug`}
            prefix="/"
            value={customSlug ? form.slug : medium ? medium.slug : slugify(form.name)}
            editing={Boolean(medium)}
            custom={customSlug}
            onCustom={(slug) => {
              setCustomSlug(slug !== null);
              setForm((f) => ({ ...f, slug: slug ?? (medium ? medium.slug : "") }));
            }}
          />
          <label htmlFor={`${id}-active`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Visible to students</span>
              <span className="block text-xs text-muted-foreground">Hidden mediums disappear from the student site.</span>
            </span>
            <Switch id={`${id}-active`} checked={form.isActive} onCheckedChange={(isActive) => setForm((f) => ({ ...f, isActive }))} />
          </label>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className={pressable} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />} {medium ? "Save" : "Create medium"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MediumsPage() {
  const confirm = useConfirm();
  const [mediums, setMediums] = useState<Medium[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; medium: Medium | null }>({ open: false, medium: null });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ mediums: Medium[] }>("/api/admin/mediums")
        .then(({ mediums }) => setMediums(mediums))
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  const reorder = async (index: number, direction: -1 | 1) => {
    if (!mediums) return;
    const next = move(mediums, index, direction);
    setMediums(next); // optimistic
    try {
      await apiJson("/api/admin/mediums/reorder", { method: "PUT", json: { ids: next.map((m) => m.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const toggle = async (medium: Medium, isActive: boolean) => {
    setBusyId(medium.id);
    try {
      await apiJson(`/api/admin/mediums/${medium.id}`, { method: "PATCH", json: { isActive } });
      setMediums((list) => list?.map((m) => (m.id === medium.id ? { ...m, isActive } : m)) ?? null);
      toast.success(`${medium.name} is now ${isActive ? "visible" : "hidden"}`);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (medium: Medium) => {
    if (medium.subjectCount > 0) {
      await confirm({
        title: `${medium.name} can't be deleted`,
        description: `It still has ${medium.subjectCount} subject(s). Delete those first — or simply hide the medium with its switch.`,
        confirmLabel: "OK",
      });
      return;
    }
    if (!(await confirm({ title: `Delete ${medium.name}?`, description: "This can't be undone.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/mediums/${medium.id}`, { method: "DELETE" });
      toast.success(`${medium.name} deleted`);
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mediums"
        description="The languages of instruction students choose from. The order here is the order on the student site."
        actions={
          <Button className={pressable} onClick={() => setDialog({ open: true, medium: null })}>
            <PlusIcon /> New medium
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load mediums</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!mediums && !error && <Skeleton className="h-64 rounded-2xl" />}

      {mediums && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {mediums.map((medium, index) => (
              <li key={medium.id} className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                <ReorderButtons index={index} count={mediums.length} onMove={(d) => reorder(index, d)} label={medium.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">{medium.name}</span>
                    {medium.nativeName && (
                      <span lang="as" className="text-sm text-muted-foreground">
                        {medium.nativeName}
                      </span>
                    )}
                    {!medium.isActive && <Badge variant="outline">Hidden</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {medium.isActive && (
                      <a href={siteLink(`/${medium.slug}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                        View on site <ExternalLinkIcon className="size-3" />
                      </a>
                    )}
                    <Link href={`/catalog/subjects?medium=${medium.id}`} className="hover:text-foreground hover:underline">
                      {medium.subjectCount} subject{medium.subjectCount === 1 ? "" : "s"}
                    </Link>
                  </div>
                </div>
                <Switch
                  checked={medium.isActive}
                  disabled={busyId === medium.id}
                  onCheckedChange={(v) => toggle(medium, v)}
                  aria-label={`${medium.name} visible to students`}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${medium.name}`}>
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ open: true, medium })}>
                      <PencilIcon /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(medium)}>
                      <Trash2Icon /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
            {mediums.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No mediums yet.</li>}
          </ul>
        </Card>
      )}

      <MediumDialog
        open={dialog.open}
        medium={dialog.medium}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSaved={() => void load()}
      />
    </div>
  );
}
