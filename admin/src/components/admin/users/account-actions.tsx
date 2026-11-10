"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { BanIcon, DownloadIcon, Loader2Icon, LogOutIcon, PauseCircleIcon, PencilIcon, PlayCircleIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdmin } from "@/components/admin/session";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate, lastDay, STATUS_BADGE, UserDetail } from "@/lib/people";
import { cn } from "@/lib/utils";

interface Account {
  status: UserDetail["status"];
  suspendedUntil: string | null;
  statusReason: string | null;
  statusChangedAt: string | null;
  emailBlocked: boolean;
}
type Option = { id: string; name: string };
type Action = "suspend" | "block" | "erase" | "edit" | null;

const nativeSelect = "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function ReasonField({ id, value, onChange, hint }: { id: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        Reason
      </Label>
      <Textarea id={id} rows={3} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} className="text-base" placeholder="A few words" />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// Users → a student: suspend, block, sign out everywhere, edit details,
// export and erase (client requirements of 6 Nov 2026). Every change asks for
// a reason and goes into the activity log. Blocking and erasing are for the
// Super Admin only.
export function AccountActions({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const id = useId();
  const me = useAdmin();
  const confirm = useConfirm();
  const isSuper = me.adminLevel !== "HELPER";
  const [account, setAccount] = useState<Account | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [indefinite, setIndefinite] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [details, setDetails] = useState({ name: "", phone: "", classLevelId: "", districtId: "", dateOfBirth: "" });
  const [options, setOptions] = useState<{ classes: Option[]; districts: Option[] } | null>(null);

  const load = useCallback(() => {
    apiJson<{ account: Account }>(`/api/admin/users/${user.id}/account`)
      .then(({ account }) => setAccount(account))
      .catch(() => setAccount(null));
  }, [user.id]);
  useEffect(load, [load]);

  const open = (next: Action) => {
    setAction(next);
    setError(null);
    setReason("");
    setUntil("");
    setIndefinite(false);
    setConfirmEmail("");
    if (next === "edit") {
      setDetails({ name: user.name ?? "", phone: user.phone ?? "", classLevelId: user.classLevel?.id ?? "", districtId: user.district?.id ?? "", dateOfBirth: user.dateOfBirth ?? "" });
      // The sign-up lists (public), so a helper without Content can use them
      if (!options) apiJson<{ classes: Option[]; districts: Option[] }>("/api/auth/profile-options").then(setOptions).catch(() => setOptions({ classes: [], districts: [] }));
    }
  };

  const run = async (path: string, init: { method: string; json?: object }, done: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ message?: string }>(path, init);
      toast.success(done, res.message ? { description: res.message } : undefined);
      setAction(null);
      load();
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const simple = async (path: string, title: string, description: string, done: string, destructive = false) => {
    if (!(await confirm({ title, description, confirmLabel: title.replace(/\?$/, ""), destructive }))) return;
    try {
      await apiJson(path, { method: "POST", json: {} });
      toast.success(done);
      load();
      onDone();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const download = async () => {
    try {
      const data = await apiJson<object>(`/api/admin/users/${user.id}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `class-course-data-${user.email.split("@")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data file downloaded", { description: "Logged in the activity log." });
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  if (user.role !== "STUDENT") {
    return null; // admin accounts are managed in Team
  }
  if (!account) return null;

  const status = account.status;
  const name = user.name || user.email;
  const reasonOk = reason.trim().length >= 5;

  return (
    <Card className={formCard}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            <ShieldCheckIcon className="size-5 text-brand-amber-text" /> Account
          </CardTitle>
          <CardDescription className="mt-1">Every change asks for a reason and is kept in the activity log.</CardDescription>
        </div>
        {status === "ACTIVE" ? (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className={STATUS_BADGE[status].className}>
            {STATUS_BADGE[status].label}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {status !== "ACTIVE" && (
          <p className={cn("rounded-xl border px-4 py-3 text-sm", status === "BLOCKED" ? "border-destructive/30 bg-destructive/5" : "bg-muted/40")}>
            {status === "SUSPENDED" && (account.suspendedUntil ? `Suspended until the end of ${formatDate(lastDay(account.suspendedUntil))}.` : "Suspended until you lift it.")}
            {status === "BLOCKED" && "Blocked: can't sign in, and this email can't create a new account."}
            {status === "DELETED" && "Personal data erased. Only payment records are kept, without the student's details."}
            {account.statusReason && <span className="mt-1 block text-muted-foreground">Reason: {account.statusReason}</span>}
            {account.statusChangedAt && <span className="block text-xs text-muted-foreground">Since {formatDate(account.statusChangedAt, true)}</span>}
          </p>
        )}

        {status !== "DELETED" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-10" onClick={() => open("edit")}>
              <PencilIcon /> Edit details
            </Button>
            {status === "ACTIVE" && (
              <Button variant="outline" className="h-10" onClick={() => open("suspend")}>
                <PauseCircleIcon /> Suspend…
              </Button>
            )}
            {status === "SUSPENDED" && (
              <Button variant="outline" className="h-10" onClick={() => simple(`/api/admin/users/${user.id}/unsuspend`, "Lift the suspension?", `${name} can sign in again straight away.`, "Suspension lifted")}>
                <PlayCircleIcon /> Lift suspension
              </Button>
            )}
            <Button variant="outline" className="h-10" onClick={() => simple(`/api/admin/users/${user.id}/sign-out`, "Sign out everywhere?", `${name} is signed out on every phone and computer. Their password still works.`, "Signed out everywhere")}>
              <LogOutIcon /> Sign out everywhere
            </Button>
            <Button variant="outline" className="h-10" onClick={download}>
              <DownloadIcon /> Download their data
            </Button>
            {isSuper && status !== "BLOCKED" && (
              <Button variant="outline" className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => open("block")}>
                <BanIcon /> Block…
              </Button>
            )}
            {isSuper && status === "BLOCKED" && (
              <Button variant="outline" className="h-10" onClick={() => simple(`/api/admin/users/${user.id}/unblock`, "Unblock this account?", `${name} can sign in again, and the email can be used again.`, "Unblocked")}>
                <PlayCircleIcon /> Unblock
              </Button>
            )}
            {isSuper && (
              <Button variant="outline" className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => open("erase")}>
                <Trash2Icon /> Erase account…
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={action !== null} onOpenChange={(o) => !o && !busy && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          {action === "suspend" && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">Suspend {name}?</DialogTitle>
                <DialogDescription>They&apos;re stopped straight away and can&apos;t use the site until the date you choose, or until you lift it. They see the reason.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-until`} className="text-sm font-semibold">
                    Suspended until the end of
                  </Label>
                  <Input id={`${id}-until`} type="date" className={inputClass} value={until} disabled={indefinite} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Until I lift it
                  </label>
                </div>
                <ReasonField id={`${id}-sr`} value={reason} onChange={setReason} hint="Shown to the student when they try to sign in." />
              </div>
            </>
          )}
          {action === "block" && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">Block {name}?</DialogTitle>
                <DialogDescription>For fraud, abuse or breaking the Terms. They can&apos;t sign in, and {user.email} can&apos;t create a new account. You can unblock later.</DialogDescription>
              </DialogHeader>
              <ReasonField id={`${id}-br`} value={reason} onChange={setReason} hint="Shown to the student when they try to sign in." />
            </>
          )}
          {action === "erase" && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">Erase {name}&apos;s account?</DialogTitle>
                <DialogDescription>
                  Their personal data, coins, quizzes, notes and Helpline messages are deleted for good. Payment records the law requires are kept, without their
                  details. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <ReasonField id={`${id}-er`} value={reason} onChange={setReason} hint="E.g. the student or a parent asked (DPDP), with the Helpline date." />
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-ce`} className="text-sm font-semibold">
                    Type <span className="font-mono">{user.email}</span> to confirm
                  </Label>
                  <Input id={`${id}-ce`} className={inputClass} autoComplete="off" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
                </div>
              </div>
            </>
          )}
          {action === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">Edit {name}&apos;s details</DialogTitle>
                <DialogDescription>When the student or a parent asks. The old and new values are kept in the activity log.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`${id}-n`} className="text-sm font-semibold">Name</Label>
                    <Input id={`${id}-n`} className={inputClass} value={details.name} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${id}-p`} className="text-sm font-semibold">Mobile (optional)</Label>
                    <Input id={`${id}-p`} className={inputClass} inputMode="numeric" value={details.phone} onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${id}-c`} className="text-sm font-semibold">Class</Label>
                    <select id={`${id}-c`} className={nativeSelect} value={details.classLevelId} onChange={(e) => setDetails((d) => ({ ...d, classLevelId: e.target.value }))}>
                      <option value="">Not set</option>
                      {options?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${id}-d`} className="text-sm font-semibold">District</Label>
                    <select id={`${id}-d`} className={nativeSelect} value={details.districtId} onChange={(e) => setDetails((d) => ({ ...d, districtId: e.target.value }))}>
                      <option value="">Not set</option>
                      {options?.districts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor={`${id}-b`} className="text-sm font-semibold">Date of birth</Label>
                    <Input id={`${id}-b`} type="date" className={inputClass} value={details.dateOfBirth} onChange={(e) => setDetails((d) => ({ ...d, dateOfBirth: e.target.value }))} />
                  </div>
                </div>
                <ReasonField id={`${id}-dr`} value={reason} onChange={setReason} hint="E.g. “Parent asked to correct the date of birth (Helpline, 12 Nov)”." />
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" className="h-10" disabled={busy} onClick={() => setAction(null)}>
              Cancel
            </Button>
            {action === "suspend" && (
              <Button className="h-10" disabled={busy || !reasonOk || (!indefinite && !until)} onClick={() => run(`/api/admin/users/${user.id}/suspend`, { method: "POST", json: { until: indefinite ? null : until, reason: reason.trim() } }, "Suspended")}>
                {busy && <Loader2Icon className="animate-spin" />} Suspend
              </Button>
            )}
            {action === "block" && (
              <Button variant="destructive" className="h-10" disabled={busy || !reasonOk} onClick={() => run(`/api/admin/users/${user.id}/block`, { method: "POST", json: { reason: reason.trim() } }, "Blocked")}>
                {busy && <Loader2Icon className="animate-spin" />} Block
              </Button>
            )}
            {action === "erase" && (
              <Button
                variant="destructive"
                className="h-10"
                disabled={busy || !reasonOk || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()}
                onClick={() => run(`/api/admin/users/${user.id}`, { method: "DELETE", json: { reason: reason.trim(), confirmEmail: confirmEmail.trim() } }, "Account erased")}
              >
                {busy && <Loader2Icon className="animate-spin" />} Erase for good
              </Button>
            )}
            {action === "edit" && (
              <Button
                className="h-10"
                disabled={busy || !reasonOk}
                onClick={() => {
                  // Only what changed goes to the server.
                  const changes: Record<string, string | null> = {};
                  if (details.name.trim() && details.name.trim() !== (user.name ?? "")) changes.name = details.name.trim();
                  if (details.phone !== (user.phone ?? "")) changes.phone = details.phone || null;
                  if (details.classLevelId && details.classLevelId !== user.classLevel?.id) changes.classLevelId = details.classLevelId;
                  if (details.districtId && details.districtId !== user.district?.id) changes.districtId = details.districtId;
                  if (details.dateOfBirth && details.dateOfBirth !== user.dateOfBirth) changes.dateOfBirth = details.dateOfBirth;
                  if (Object.keys(changes).length === 0) return setError("Nothing has changed");
                  void run(`/api/admin/users/${user.id}/details`, { method: "PATCH", json: { ...changes, reason: reason.trim() } }, "Details saved");
                }}
              >
                {busy && <Loader2Icon className="animate-spin" />} Save details
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
