"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, ShieldIcon, UserMinusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { Field } from "@/components/admin/settings/field";
import { useAdmin } from "@/components/admin/session";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate } from "@/lib/people";

interface Admin {
  id: string;
  email: string;
  name: string | null;
  adminLevel: "SUPER" | "HELPER";
  adminPermissions: string[];
  createdAt: string;
}
interface Permission {
  key: string;
  label: string;
}

function PermissionBoxes({ id, all, value, onChange }: { id: string; all: Permission[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-semibold">Sections they may use</legend>
      {all.map((p) => (
        <label key={p.key} htmlFor={`${id}-${p.key}`} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 hover:bg-muted/40">
          <input
            id={`${id}-${p.key}`}
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--primary)]"
            checked={value.includes(p.key)}
            onChange={(e) => onChange(e.target.checked ? [...value, p.key] : value.filter((k) => k !== p.key))}
          />
          <span className="text-sm">{p.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Admin → Team (Super Admin only): helper admins who can use only some
// sections. Settings, security, the team, the activity log, blocking and
// erasing accounts always stay with the Super Admin.
export default function TeamPage() {
  const id = useId();
  const me = useAdmin();
  const confirm = useConfirm();
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [all, setAll] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", permissions: [] as string[] });
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ admins: Admin[]; permissions: Permission[] }>("/api/admin/team")
        .then((r) => {
          setAdmins(r.admins);
          setAll(r.permissions);
        })
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  const label = (key: string) => all.find((p) => p.key === key)?.label.split(":")[0] ?? key;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await apiJson("/api/admin/team", {
        method: "POST",
        json: { email: form.email.trim(), name: form.name.trim() || undefined, password: form.password || undefined, permissions: form.permissions },
      });
      toast.success(`${form.email.trim()} is now a helper admin`, { description: "They sign in at this admin panel." });
      setForm({ email: "", name: "", password: "", permissions: [] });
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setAdding(false);
    }
  };

  const save = async (a: Admin, permissions: string[]) => {
    setBusyId(a.id);
    try {
      await apiJson(`/api/admin/team/${a.id}`, { method: "PATCH", json: { permissions } });
      toast.success("Sections saved");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: Admin) => {
    if (!(await confirm({ title: `Remove ${a.name || a.email} from the team?`, description: "Their account becomes a normal student account and they're signed out of the admin panel at once.", confirmLabel: "Remove", destructive: true }))) return;
    setBusyId(a.id);
    try {
      await apiJson(`/api/admin/team/${a.id}`, { method: "DELETE" });
      toast.success("Admin access removed");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Helper admins can do routine work in the sections you tick. Settings, security, this page, the activity log, blocking and erasing accounts stay with you."
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!admins && !error && <Skeleton className="h-64 rounded-2xl" />}

      {admins && (
        <div className="grid gap-4 lg:grid-cols-2">
          {admins.map((a) => (
            <Card key={a.id} className={formCard}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate font-heading text-lg">{a.name || a.email}</CardTitle>
                  <CardDescription className="truncate">
                    {a.email} · since {formatDate(a.createdAt)}
                  </CardDescription>
                </div>
                {a.adminLevel === "SUPER" ? (
                  <Badge className="shrink-0 gap-1">
                    <ShieldIcon className="size-3" /> Super Admin
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    Helper
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="grid gap-3">
                {a.adminLevel === "SUPER" ? (
                  <p className="text-sm text-muted-foreground">Full access{a.id === me.id ? " (you)" : ""}. Super Admins are set from the server only.</p>
                ) : (
                  <>
                    <PermissionBoxes id={`${id}-${a.id}`} all={all} value={a.adminPermissions} onChange={(p) => p.length > 0 && void save(a, p)} />
                    <p className="text-xs text-muted-foreground">
                      Can use: {a.adminPermissions.map(label).join(", ")}. Changes apply at once. At least one section must stay ticked.
                    </p>
                    <Button variant="outline" className="h-10 justify-self-start border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busyId === a.id} onClick={() => remove(a)}>
                      {busyId === a.id ? <Loader2Icon className="animate-spin" /> : <UserMinusIcon />} Remove from team
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <form onSubmit={add}>
        <Card className={formCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <PlusIcon className="size-5 text-brand-amber-text" /> Add a helper admin
            </CardTitle>
            <CardDescription>Use their own email. If they already have a Class Course account it becomes an admin account; otherwise set a starting password and tell them privately.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${id}-email`} label="Email">
                <Input id={`${id}-email`} type="email" className={inputClass} required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </Field>
              <Field id={`${id}-name`} label="Name (optional)">
                <Input id={`${id}-name`} className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field id={`${id}-pw`} label="Starting password (new accounts only)" hint="At least 12 characters. They can change it with “Forgot password”." className="sm:col-span-2">
                <Input id={`${id}-pw`} type="password" autoComplete="new-password" className={inputClass} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
              </Field>
            </div>
            <PermissionBoxes id={`${id}-new`} all={all} value={form.permissions} onChange={(permissions) => setForm((f) => ({ ...f, permissions }))} />
            <Button type="submit" className={`${pressable} justify-self-start`} disabled={adding || !form.email || form.permissions.length === 0}>
              {adding && <Loader2Icon className="animate-spin" />} Add helper admin
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
