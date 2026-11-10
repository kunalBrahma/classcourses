"use client";

import { FormEvent, Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/admin/page-header";
import { useFilterParams } from "@/components/admin/quiz/filters";
import { Field } from "@/components/admin/settings/field";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate } from "@/lib/people";
import { cn } from "@/lib/utils";

type Status = "PENDING" | "REWARDED" | "HELD" | "REJECTED" | "REVERSED";
type Person = { id: string; name: string | null; email: string; status: string };

interface Row {
  id: string;
  status: Status;
  reason: string | null;
  coinsReferrer: number;
  coinsFriend: number;
  signupIp: string | null;
  deviceId: string | null;
  userAgent: string | null;
  verifiedAt: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
  referrer: Person;
  referred: Person & { emailVerified: boolean };
  sameNetwork: number;
  sameDevice: number;
}
interface Page {
  items: Row[];
  total: number;
  page: number;
  totalPages: number;
}
interface Summary {
  counts: Record<Status, number>;
  coinsGiven: number;
  topReferrers: { user: { id: string; name: string | null; email: string } | null; count: number }[];
}
interface Settings {
  enabled: boolean;
  coinsPerReferral: number;
  friendCoins: number;
  dailyLimit: number;
  sameNetworkLimit: number;
}

const STATUS: Record<Status, { label: string; className: string }> = {
  PENDING: { label: "Email not verified", className: "text-muted-foreground" },
  HELD: { label: "Needs review", className: "border-warning/40 bg-warning/10 text-warning" },
  REWARDED: { label: "Rewarded", className: "border-success/30 bg-success/10 text-success" },
  REJECTED: { label: "No coins", className: "text-muted-foreground" },
  REVERSED: { label: "Reversed", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

const who = (p: Person) => p.name || p.email;

function SettingsCard() {
  const id = useId();
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ setting: { value: Settings } }>("/api/admin/settings/referral")
      .then((r) => setForm(r.setting.value))
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiJson<{ setting: { value: Settings } }>("/api/admin/settings/referral", { method: "PUT", json: form });
      setForm(r.setting.value);
      toast.success("Refer and Earn settings saved");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const num = (key: keyof Omit<Settings, "enabled">) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [key]: e.target.value === "" ? 0 : Number(e.target.value) } : f));

  return (
    <Card className={formCard}>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Settings</CardTitle>
        <CardDescription>Coins are given only when the friend verifies their email, and expire like all coins.</CardDescription>
      </CardHeader>
      <CardContent>
        {!form ? (
          error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : <Skeleton className="h-48 rounded-xl" />
        ) : (
          <form onSubmit={save} className="grid gap-4">
            <label htmlFor={`${id}-on`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Refer and Earn is on</span>
                <span className="text-xs text-muted-foreground">Off: the menu item and the links stop working; nothing already given changes.</span>
              </span>
              <Switch id={`${id}-on`} checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={`${id}-coins`} label="Coins for the student who invites" hint="Per friend who joins.">
                <Input id={`${id}-coins`} type="number" min={0} max={1000} inputMode="numeric" className={inputClass} value={form.coinsPerReferral} onChange={num("coinsPerReferral")} />
              </Field>
              <Field id={`${id}-friend`} label="Welcome coins for the new friend" hint="0 = none.">
                <Input id={`${id}-friend`} type="number" min={0} max={1000} inputMode="numeric" className={inputClass} value={form.friendCoins} onChange={num("friendCoins")} />
              </Field>
              <Field id={`${id}-daily`} label="Rewards per student per day" hint="More than this wait for your review.">
                <Input id={`${id}-daily`} type="number" min={1} max={100} inputMode="numeric" className={inputClass} value={form.dailyLimit} onChange={num("dailyLimit")} />
              </Field>
              <Field id={`${id}-net`} label="Sign-ups from one network or device" hint="Per inviter in 30 days, before they wait for review.">
                <Input id={`${id}-net`} type="number" min={1} max={50} inputMode="numeric" className={inputClass} value={form.sameNetworkLimit} onChange={num("sameNetworkLimit")} />
              </Field>
            </div>
            {form.enabled && form.coinsPerReferral === 0 && form.friendCoins === 0 && (
              <p className="text-sm text-warning">It&apos;s on, but no coins are set: students can share links but earn nothing.</p>
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button type="submit" className={cn(pressable, "justify-self-start")} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />} Save settings
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

type Action = { row: Row; kind: "approve" | "reject" | "reverse" } | null;

function ReferralsInner() {
  const { params, set } = useFilterParams();
  const status = params.get("status") ?? "all";
  const userId = params.get("userId");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<Page | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Summary>("/api/admin/referrals/summary").then(setSummary).catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (status !== "all") q.set("status", status);
    if (userId) q.set("userId", userId);
    let cancelled = false;
    apiJson<Page>(`/api/admin/referrals?${q}`)
      .then((r) => !cancelled && (setData(r), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, userId, page, reload]);

  const open = (row: Row, kind: "approve" | "reject" | "reverse") => {
    setNote("");
    setActionError(null);
    setAction({ row, kind });
  };

  const run = async () => {
    if (!action) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await apiJson<{ message: string }>(`/api/admin/referrals/${action.row.id}/${action.kind}`, { method: "POST", json: { note: note.trim() } });
      toast.success(r.message);
      setAction(null);
      setReload((x) => x + 1);
    } catch (err) {
      setActionError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const filteredName = userId && data?.items[0] ? (data.items[0].referrer.id === userId ? who(data.items[0].referrer) : who(data.items[0].referred)) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Refer and Earn" description="Students share their link; when a friend joins and verifies their email, the inviter gets coins. Anything that looks like fake accounts waits here for your review instead of paying out." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <SettingsCard />
        <Card className={formCard}>
          <CardHeader><CardTitle className="font-heading text-lg">So far</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([
                ["REWARDED", "Rewarded"],
                ["HELD", "Need review"],
                ["PENDING", "Not verified yet"],
                ["REJECTED", "No coins"],
                ["REVERSED", "Reversed"],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => set({ status: key })} className={cn("rounded-xl border px-3 py-2 text-left transition hover:bg-muted/50", key === "HELD" && (summary?.counts.HELD ?? 0) > 0 && "border-warning/50 bg-warning/10")}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-heading text-2xl font-bold tabular-nums">{summary?.counts[key] ?? "—"}</dd>
                </button>
              ))}
              <div className="rounded-xl border px-3 py-2">
                <dt className="text-xs text-muted-foreground">Coins given</dt>
                <dd className="font-heading text-2xl font-bold tabular-nums">{summary?.coinsGiven.toLocaleString("en-IN") ?? "—"}</dd>
              </div>
            </dl>
            {summary && summary.topReferrers.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-semibold">Most invites</p>
                <ol className="grid gap-1 text-sm">
                  {summary.topReferrers.map((t) =>
                    t.user ? (
                      <li key={t.user.id} className="flex items-center justify-between gap-3">
                        <button type="button" onClick={() => set({ userId: t.user!.id })} className="truncate text-left font-medium hover:underline">{t.user.name || t.user.email}</button>
                        <span className="tabular-nums text-muted-foreground">{t.count}</span>
                      </li>
                    ) : null
                  )}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => set({ status: v === "all" ? null : v })}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all" className="h-9 px-2 sm:px-3">All</TabsTrigger>
            <TabsTrigger value="HELD" className="h-9 px-2 sm:px-3">Review</TabsTrigger>
            <TabsTrigger value="REWARDED" className="h-9 px-2 sm:px-3">Rewarded</TabsTrigger>
            <TabsTrigger value="PENDING" className="h-9 px-2 sm:px-3">Waiting</TabsTrigger>
          </TabsList>
        </Tabs>
        {userId && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Only <strong>{filteredName ?? "one student"}</strong></span>
            <Button variant="outline" size="sm" className="h-8" onClick={() => set({ userId: null })}>Show everyone</Button>
          </div>
        )}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!data && !error && <Skeleton className="h-64 rounded-2xl" />}
      {data && (
        <Card className={cn(formCard, "gap-0 py-0")}>
          <ul className="divide-y">
            {data.items.map((r) => (
              <li key={r.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Link href={`/users/${r.referrer.id}`} className="font-semibold hover:underline">{who(r.referrer)}</Link>
                  <ArrowRightIcon className="size-4 text-muted-foreground" aria-label="invited" />
                  <Link href={`/users/${r.referred.id}`} className="font-semibold hover:underline">{r.referred.status === "DELETED" ? "Erased account" : who(r.referred)}</Link>
                  <Badge variant="outline" className={STATUS[r.status].className}>{STATUS[r.status].label}</Badge>
                  {r.status === "REWARDED" && <span className="text-muted-foreground">+{r.coinsReferrer}{r.coinsFriend ? ` / +${r.coinsFriend} friend` : ""} coins</span>}
                </div>
                {r.reason && <p className={cn("text-sm", r.status === "HELD" ? "text-warning" : "text-muted-foreground")}>{r.reason}</p>}
                {r.note && <p className="text-sm text-muted-foreground">Note: {r.note}</p>}
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>Joined {formatDate(r.createdAt, true)}</span>
                  {r.signupIp && <span className={r.sameNetwork > 2 ? "font-semibold text-warning" : ""}>Network {r.signupIp} · {r.sameNetwork} sign-up{r.sameNetwork === 1 ? "" : "s"} in 30 days</span>}
                  {r.deviceId && <span className={r.sameDevice > 1 ? "font-semibold text-warning" : ""}>Device {r.deviceId.slice(0, 8)}… · {r.sameDevice} sign-up{r.sameDevice === 1 ? "" : "s"}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.status === "HELD" && (
                    <Button size="sm" variant="outline" className="h-9" onClick={() => open(r, "approve")}><CheckIcon /> Approve and give coins</Button>
                  )}
                  {(r.status === "HELD" || r.status === "PENDING") && (
                    <Button size="sm" variant="ghost" className="h-9" onClick={() => open(r, "reject")}><XIcon /> Reject</Button>
                  )}
                  {r.status === "REWARDED" && (
                    <Button size="sm" variant="ghost" className="h-9 text-destructive hover:text-destructive" onClick={() => open(r, "reverse")}><RotateCcwIcon /> Reverse reward</Button>
                  )}
                </div>
              </li>
            ))}
            {data.items.length === 0 && <li className="px-4 py-12 text-center text-sm text-muted-foreground">No referrals here yet.</li>}
          </ul>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">{data.total} referrals</span>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeftIcon /></Button>
                <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRightIcon /></Button>
              </div>
            </div>
          )}
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Found fake accounts? Reverse the rewards here, then suspend or block the accounts from Users.</p>

      <Dialog open={action !== null} onOpenChange={(o) => !o && !busy && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {action?.kind === "approve" ? "Approve this referral?" : action?.kind === "reject" ? "Reject this referral?" : "Reverse this reward?"}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === "approve"
                ? `${who(action.row.referrer)} gets the coins now.`
                : action?.kind === "reject"
                  ? "No coins are given for this sign-up."
                  : action
                    ? `The coins come back from ${who(action.row.referrer)} (and the friend's welcome coins), as far as they haven't been spent.`
                    : ""}
            </DialogDescription>
          </DialogHeader>
          <Field id="ref-note" label="Reason" hint="Kept with the referral and in the activity log.">
            <Textarea id="ref-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="text-base" />
          </Field>
          {actionError && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}
          <DialogFooter>
            <Button variant="outline" className="h-10" disabled={busy} onClick={() => setAction(null)}>Cancel</Button>
            <Button variant={action?.kind === "approve" ? "default" : "destructive"} className="h-10" disabled={busy || note.trim().length < 5} onClick={() => void run()}>
              {busy && <Loader2Icon className="animate-spin" />} {action?.kind === "approve" ? "Approve" : action?.kind === "reject" ? "Reject" : "Reverse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReferralsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <ReferralsInner />
    </Suspense>
  );
}
