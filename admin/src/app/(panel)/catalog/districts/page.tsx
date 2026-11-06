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
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";

// GET /api/admin/districts
interface District {
  id: string;
  name: string;
  nativeName: string | null;
  order: number;
  isActive: boolean;
  // Students who chose this district
  students: number;
}

function DistrictDialog({ target, onClose, onSaved }: { target: { district: District | null } | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const editing = target?.district ?? null;
  const [form, setForm] = useState({ name: "", nativeName: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the dialog opens for a new target.
  const [last, setLast] = useState<typeof target>(null);
  if (target !== last) {
    setLast(target);
    if (target) {
      setForm({ name: target.district?.name ?? "", nativeName: target.district?.nativeName ?? "" });
      setError(null);
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name: form.name.trim(), nativeName: form.nativeName.trim() || null };
      if (editing) await apiJson(`/api/admin/districts/${editing.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/districts", { method: "POST", json: body });
      toast.success(editing ? "District updated" : `${body.name} added`);
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit district" : "New district"}</DialogTitle>
            <DialogDescription>Students choose their district when they sign up or complete their profile.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-name`} label="Name" hint={editing && editing.students > 0 ? `${editing.students} student${editing.students === 1 ? " has" : "s have"} chosen it; they see the new name.` : "As students should see it."}>
            <Input id={`${id}-name`} className={inputClass} value={form.name} maxLength={80} placeholder="e.g. Nagaon" required autoFocus onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field id={`${id}-native`} label="Name in Assamese (optional)" hint="Shown next to the name, e.g. নগাঁও.">
            <Input id={`${id}-native`} className={inputClass} lang="as" value={form.nativeName} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, nativeName: e.target.value }))} />
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
            <Button type="submit" className={pressable} disabled={busy || form.name.trim().length < 2}>
              {busy && <Loader2Icon className="animate-spin" />} {editing ? "Save" : "Add district"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DistrictsPage() {
  const confirm = useConfirm();
  const [districts, setDistricts] = useState<District[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ district: District | null } | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ districts: District[] }>("/api/admin/districts")
        .then(({ districts }) => setDistricts(districts))
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  const reorder = async (index: number, direction: -1 | 1) => {
    if (!districts) return;
    const next = move(districts, index, direction);
    setDistricts(next); // optimistic
    try {
      await apiJson("/api/admin/districts/reorder", { method: "PUT", json: { ids: next.map((d) => d.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const toggle = async (d: District, isActive: boolean) => {
    setBusyId(d.id);
    try {
      await apiJson(`/api/admin/districts/${d.id}`, { method: "PATCH", json: { isActive } });
      setDistricts((list) => list?.map((x) => (x.id === d.id ? { ...x, isActive } : x)) ?? null);
      toast.success(`${d.name} is now ${isActive ? "in the sign-up list" : "hidden from new students"}`);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (d: District) => {
    if (d.students > 0) {
      await confirm({
        title: `${d.name} can't be deleted`,
        description: `${d.students} student${d.students === 1 ? " has" : "s have"} chosen it. Turn its switch off instead: new students won't see it, and those students keep it.`,
        confirmLabel: "OK",
      });
      return;
    }
    if (!(await confirm({ title: `Delete ${d.name}?`, description: "No student has chosen it, so nothing else is affected.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/districts/${d.id}`, { method: "DELETE" });
      toast.success(`${d.name} deleted`);
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const shown = districts?.filter((d) => d.isActive).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Districts"
        description="The districts students choose when they sign up. Add new ones, rename, reorder or hide them. The order here is the order in the sign-up list."
        actions={
          <Button className={pressable} onClick={() => setDialog({ district: null })}>
            <PlusIcon /> New district
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load districts</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!districts && !error && <Skeleton className="h-96 rounded-2xl" />}

      {districts && (
        <>
          <p className="text-sm text-muted-foreground">
            {shown} of {districts.length} shown to students
          </p>
          <Card className={`${formCard} gap-0 py-0`}>
            <ul className="divide-y">
              {districts.map((d, index) => (
                <li key={d.id} className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
                  <ReorderButtons index={index} count={districts.length} onMove={(dir) => reorder(index, dir)} label={d.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{d.name}</span>
                      {d.nativeName && (
                        <span lang="as" className="text-sm text-muted-foreground">
                          {d.nativeName}
                        </span>
                      )}
                      {!d.isActive && <Badge variant="outline">Hidden</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {d.students === 0 ? (
                        "No students yet"
                      ) : (
                        <Link href={`/users?district=${d.id}`} className="hover:text-foreground hover:underline">
                          {d.students} student{d.students === 1 ? "" : "s"}
                        </Link>
                      )}
                    </div>
                  </div>
                  <Switch checked={d.isActive} disabled={busyId === d.id} onCheckedChange={(v) => toggle(d, v)} aria-label={`${d.name} in the sign-up list`} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${d.name}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ district: d })}>
                        <PencilIcon /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(d)}>
                        <Trash2Icon /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
              {districts.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No districts yet. Add the first one.</li>}
            </ul>
          </Card>
        </>
      )}

      <DistrictDialog target={dialog} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
