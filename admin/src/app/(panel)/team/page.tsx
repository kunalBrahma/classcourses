"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { BanIcon, CheckIcon, CopyIcon, Loader2Icon, PlusIcon, ShieldIcon, UnlockIcon, UserMinusIcon, WandSparklesIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { Field, SecretInput } from "@/components/admin/settings/field";
import { useAdmin } from "@/components/admin/session";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate } from "@/lib/people";
import { cn } from "@/lib/utils";

interface Admin {
  id: string;
  email: string;
  name: string | null;
  adminLevel: "SUPER" | "HELPER";
  adminPermissions: string[];
  createdAt: string;
  // BLOCKED: can't sign in (told to contact the Super Admin) until unblocked
  status: "ACTIVE" | "SUSPENDED" | "BLOCKED" | "DELETED";
  statusReason: string | null;
  statusChangedAt: string | null;
}
interface Permission {
  key: string;
  label: string;
}

function PermissionBoxes({ id, all, value, onChange, error }: { id: string; all: Permission[]; value: string[]; onChange: (v: string[]) => void; error?: string | null }) {
  return (
    <fieldset className="grid gap-2" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-perm-error` : undefined}>
      <legend className="mb-1 text-sm font-semibold">Sections they may use</legend>
      {error && (
        <p id={`${id}-perm-error`} role="alert" className="-mt-0.5 mb-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      {all.map((p) => (
        <label key={p.key} htmlFor={`${id}-${p.key}`} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 hover:bg-muted/40", error && "border-destructive/50")}>
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
// erasing accounts always stay with the Super Admin. A helper can be blocked
// (keeps the account and sections, can't sign in) and unblocked, or removed
// from the team (back to a student account).

// ---- Add a helper: the same rules as the server (addHelperSchema) ----------

type AddField = "email" | "name" | "password" | "permissions";
type AddErrors = Partial<Record<AddField, string>>;
const MIN_PASSWORD = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const checkAdd = (f: { email: string; name: string; password: string; permissions: string[] }): AddErrors => {
  const e: AddErrors = {};
  const email = f.email.trim();
  if (!email) e.email = "Enter their email address.";
  else if (!EMAIL_RE.test(email)) e.email = "This doesn't look like an email address. Check for typos, e.g. name@gmail.com.";
  if (f.name.trim().length > 80) e.name = "Keep the name under 80 characters.";
  if (f.password && f.password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters (${MIN_PASSWORD - f.password.length} more).`;
  else if (f.password.length > 200) e.password = "Use at most 200 characters.";
  if (f.permissions.length === 0) e.permissions = "Tick at least one section they may use.";
  return e;
};

// The server's answer → the field it is about.
const serverErrors = (err: ApiError): AddErrors => {
  const out: AddErrors = {};
  for (const [field, msgs] of Object.entries(err.details ?? {})) {
    if (field === "email" || field === "name" || field === "password" || field === "permissions") out[field] = msgs[0];
  }
  if (Object.keys(out).length) return out;
  if (/starting password/i.test(err.message)) return { password: `No account uses this email yet, so set a starting password (at least ${MIN_PASSWORD} characters).` };
  if (/already an admin|blocked or erased|email/i.test(err.message)) return { email: err.message };
  return {};
};

// A strong, easy-to-read starting password (no 0/O, 1/l/I).
const generatePassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const raw = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
};

// Block window: an optional reason the team member sees when they try to sign in.
function BlockDialog({ target, onClose, onDone }: { target: Admin | null; onClose: () => void; onDone: () => void }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Admin | null>(null);
  if (target !== last) {
    setLast(target);
    if (target) setReason("");
  }
  const block = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await apiJson(`/api/admin/team/${target.id}/block`, { method: "POST", json: { reason: reason.trim() || undefined } });
      toast.success(`${target.name || target.email} is blocked`, { description: "They were signed out and can't sign in until you unblock them." });
      onDone();
      onClose();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Block {target?.name || target?.email}?</DialogTitle>
          <DialogDescription>
            They&apos;re signed out of the admin panel at once. When they try to sign in they&apos;ll see that their account is blocked and that
            they should contact you. Their sections are kept, so unblocking gives the same access back.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-reason`}>
            Reason <span className="font-normal text-muted-foreground">(optional, they will see it)</span>
          </Label>
          <Textarea id={`${id}-reason`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. On leave until January" />
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-10" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" className="h-10" disabled={busy} onClick={() => void block()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <BanIcon />} Block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export default function TeamPage() {
  const id = useId();
  const me = useAdmin();
  const confirm = useConfirm();
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [all, setAll] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", permissions: [] as string[] });
  const [adding, setAdding] = useState(false);
  // Field problems; checked again on every change once they tried to submit
  const [addErrors, setAddErrors] = useState<AddErrors>({});
  const [tried, setTried] = useState(false);
  const [copied, setCopied] = useState(false);
  const editForm = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (tried) setAddErrors(checkAdd(next));
  };
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<Admin | null>(null);

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
    setTried(true);
    const problems = checkAdd(form);
    setAddErrors(problems);
    if (Object.keys(problems).length) {
      // Take them to the first field that needs fixing
      const first = (["email", "name", "password"] as const).find((k) => problems[k]);
      if (first) document.getElementById(`${id}-${first === "password" ? "pw" : first}`)?.focus();
      return;
    }
    setAdding(true);
    try {
      await apiJson("/api/admin/team", {
        method: "POST",
        json: { email: form.email.trim(), name: form.name.trim() || undefined, password: form.password || undefined, permissions: form.permissions },
      });
      toast.success(`${form.email.trim()} is now a helper admin`, { description: "They sign in at this admin panel." });
      setForm({ email: "", name: "", password: "", permissions: [] });
      setAddErrors({});
      setTried(false);
      void load();
    } catch (err) {
      const fieldErrors = serverErrors(err as ApiError);
      if (Object.keys(fieldErrors).length) {
        setAddErrors(fieldErrors);
        const first = (["email", "name", "password"] as const).find((k) => fieldErrors[k]);
        if (first) document.getElementById(`${id}-${first === "password" ? "pw" : first}`)?.focus();
      } else toast.error((err as ApiError).message);
    } finally {
      setAdding(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(form.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the password and copy it yourself.");
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

  const unblock = async (a: Admin) => {
    if (!(await confirm({ title: `Unblock ${a.name || a.email}?`, description: "They can sign in again, with the same sections as before.", confirmLabel: "Unblock" }))) return;
    setBusyId(a.id);
    try {
      await apiJson(`/api/admin/team/${a.id}/unblock`, { method: "POST" });
      toast.success(`${a.name || a.email} can sign in again`);
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <BlockDialog target={blocking} onClose={() => setBlocking(null)} onDone={() => void load()} />
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
            <Card key={a.id} className={cn(formCard, a.status === "BLOCKED" && "border-destructive/40")}>
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
                  <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {a.status === "BLOCKED" && (
                      <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-destructive">
                        <BanIcon className="size-3" /> Blocked
                      </Badge>
                    )}
                    <Badge variant="outline">Helper</Badge>
                  </span>
                )}
              </CardHeader>
              <CardContent className="grid gap-3">
                {a.adminLevel === "SUPER" ? (
                  <p className="text-sm text-muted-foreground">Full access{a.id === me.id ? " (you)" : ""}. Super Admins are set from the server only.</p>
                ) : (
                  <>
                    {a.status === "BLOCKED" && (
                      <Alert variant="destructive" className="py-2.5">
                        <AlertDescription>
                          Can&apos;t sign in{a.statusChangedAt ? ` since ${formatDate(a.statusChangedAt)}` : ""}.
                          {a.statusReason ? ` Reason: ${a.statusReason}` : " No reason given."}
                        </AlertDescription>
                      </Alert>
                    )}
                    <PermissionBoxes id={`${id}-${a.id}`} all={all} value={a.adminPermissions} onChange={(p) => p.length > 0 && void save(a, p)} />
                    <p className="text-xs text-muted-foreground">
                      Can use: {a.adminPermissions.map(label).join(", ")}. Changes apply at once. At least one section must stay ticked.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {a.status === "BLOCKED" ? (
                        <Button variant="outline" className="h-10" disabled={busyId === a.id} onClick={() => void unblock(a)}>
                          {busyId === a.id ? <Loader2Icon className="animate-spin" /> : <UnlockIcon />} Unblock
                        </Button>
                      ) : (
                        <Button variant="outline" className="h-10 border-warning/50 text-warning hover:bg-warning/10" disabled={busyId === a.id} onClick={() => setBlocking(a)}>
                          <BanIcon /> Block
                        </Button>
                      )}
                      <Button variant="outline" className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busyId === a.id} onClick={() => remove(a)}>
                        {busyId === a.id ? <Loader2Icon className="animate-spin" /> : <UserMinusIcon />} Remove from team
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <form onSubmit={add} noValidate>
        <Card className={formCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <PlusIcon className="size-5 text-brand-amber-text" /> Add a helper admin
            </CardTitle>
            <CardDescription>Use their own email. If they already have a Class Course account it becomes an admin account; otherwise set a starting password and tell them privately.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${id}-email`} label="Email" error={addErrors.email}>
                <Input
                  id={`${id}-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={inputClass}
                  placeholder="name@example.com"
                  value={form.email}
                  aria-invalid={addErrors.email ? true : undefined}
                  aria-describedby={addErrors.email ? `${id}-email-error` : undefined}
                  onChange={(e) => editForm({ email: e.target.value })}
                />
              </Field>
              <Field id={`${id}-name`} label={<span>Name <span className="font-normal text-muted-foreground">(optional)</span></span>} error={addErrors.name}>
                <Input
                  id={`${id}-name`}
                  className={inputClass}
                  placeholder="e.g. Priya Das"
                  maxLength={100}
                  value={form.name}
                  aria-invalid={addErrors.name ? true : undefined}
                  aria-describedby={addErrors.name ? `${id}-name-error` : undefined}
                  onChange={(e) => editForm({ name: e.target.value })}
                />
              </Field>
              <Field
                id={`${id}-pw`}
                label={<span>Starting password <span className="font-normal text-muted-foreground">(only for someone without an account)</span></span>}
                error={addErrors.password}
                hint="If they already have a Class Course account, leave this empty: they keep their own password. Otherwise tell them this password privately; they can change it with “Forgot password”."
                className="sm:col-span-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <SecretInput
                      id={`${id}-pw`}
                      value={form.password}
                      onChange={(password) => editForm({ password })}
                      label="password"
                      placeholder={`At least ${MIN_PASSWORD} characters`}
                      invalid={Boolean(addErrors.password)}
                      describedBy={[addErrors.password && `${id}-pw-error`, `${id}-pw-rule`, `${id}-pw-hint`].filter(Boolean).join(" ")}
                      mono={false}
                    />
                  </div>
                  <Button type="button" variant="outline" className="h-10" onClick={() => editForm({ password: generatePassword() })}>
                    <WandSparklesIcon /> Generate
                  </Button>
                  <Button type="button" variant="outline" className="h-10" disabled={!form.password} onClick={() => void copyPassword()}>
                    {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                {form.password && !addErrors.password && (
                  <p id={`${id}-pw-rule`} className={cn("flex items-center gap-1.5 text-xs", form.password.length >= MIN_PASSWORD ? "text-success" : "text-muted-foreground")}>
                    <CheckIcon className={cn("size-3.5", form.password.length < MIN_PASSWORD && "opacity-30")} aria-hidden="true" />
                    At least {MIN_PASSWORD} characters{form.password.length < MIN_PASSWORD ? ` (${form.password.length} so far)` : ""}
                  </p>
                )}
              </Field>
            </div>
            <PermissionBoxes id={`${id}-new`} all={all} value={form.permissions} onChange={(permissions) => editForm({ permissions })} error={addErrors.permissions} />
            <Button type="submit" className={`${pressable} justify-self-start`} disabled={adding}>
              {adding && <Loader2Icon className="animate-spin" />} Add helper admin
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
