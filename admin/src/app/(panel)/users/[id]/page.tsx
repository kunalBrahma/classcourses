"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, CoinsIcon, Loader2Icon, MinusIcon, PlusIcon, ShieldIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/admin/settings/field";
import { useAdmin } from "@/components/admin/session";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { COIN_REASON, formatDate, formatPhone, initials, QUIZ_STATUS, Role, UserDetail } from "@/lib/people";
import { UnverifiedBadge } from "@/components/admin/unverified-badge";
import { cn } from "@/lib/utils";

function CoinAdjust({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const id = useId();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Math.floor(Number(amount));
  const delta = Number.isFinite(n) && n > 0 ? n * direction : 0;
  const after = user.coins + delta;
  const overdraw = after < 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!delta || overdraw) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ balance: number }>(`/api/admin/users/${user.id}/coins`, { method: "POST", json: { delta, note } });
      toast.success(`${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} coins`, { description: `New balance: ${res.balance}` });
      setAmount("");
      setNote("");
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={formCard}>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Adjust coins</CardTitle>
        <CardDescription>For corrections or goodwill credit. The reason appears in the student&apos;s coin history.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <div role="radiogroup" aria-label="Add or remove" className="flex rounded-xl border p-1">
              {([1, -1] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={direction === d}
                  aria-label={d === 1 ? "Add coins" : "Remove coins"}
                  onClick={() => setDirection(d)}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg transition",
                    direction === d ? (d === 1 ? "bg-success text-white" : "bg-destructive text-white") : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {d === 1 ? <PlusIcon className="size-4" /> : <MinusIcon className="size-4" />}
                </button>
              ))}
            </div>
            <Input
              aria-label="Number of coins"
              className={cn(inputClass, "tabular-nums")}
              type="number"
              inputMode="numeric"
              min={1}
              max={1000000}
              placeholder="Number of coins"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <Field id={`${id}-note`} label="Reason">
            <Input
              id={`${id}-note`}
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Goodwill credit for a payment problem"
              minLength={3}
              maxLength={200}
              required
            />
          </Field>
          {delta !== 0 && (
            <p className={cn("text-sm", overdraw ? "text-destructive" : "text-muted-foreground")}>
              {overdraw ? (
                <>They only have {user.coins} coins — you can remove at most {user.coins}.</>
              ) : (
                <>
                  Balance: <span className="tabular-nums">{user.coins}</span> → <strong className="text-foreground tabular-nums">{after}</strong>
                </>
              )}
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className={cn(pressable, "justify-self-start")} disabled={busy || !delta || overdraw || note.trim().length < 3}>
            {busy && <Loader2Icon className="animate-spin" />} {direction === 1 ? "Add" : "Remove"} {delta ? Math.abs(delta) : ""} coins
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountCard({ user, onDone }: { user: UserDetail; onDone: () => void }) {
  const id = useId();
  const me = useAdmin();
  const confirm = useConfirm();
  const [name, setName] = useState(user.name ?? "");
  const [busy, setBusy] = useState(false);
  const isSelf = me.id === user.id;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiJson(`/api/admin/users/${user.id}`, { method: "PATCH", json: { name: name.trim() || null } });
      toast.success("Name saved");
      onDone();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (role: Role) => {
    if (role === user.role) return;
    const ok = await confirm({
      title: role === "ADMIN" ? `Make ${user.name || user.email} an admin?` : `Remove admin access from ${user.name || user.email}?`,
      description:
        role === "ADMIN"
          ? "They will be able to change everything in this panel, including settings, content, coins and other users. They'll be signed out and must sign in again."
          : "They become a student and lose access to this panel. They'll be signed out.",
      confirmLabel: role === "ADMIN" ? "Make admin" : "Remove admin",
      destructive: role === "STUDENT",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiJson(`/api/admin/users/${user.id}`, { method: "PATCH", json: { role } });
      toast.success(role === "ADMIN" ? "Now an admin" : "Admin access removed");
      onDone();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={formCard}>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Account</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form onSubmit={saveName} className="grid gap-2">
          <Field id={`${id}-name`} label="Name">
            <div className="flex gap-2">
              <Input id={`${id}-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" variant="outline" className="h-10" disabled={busy || name === (user.name ?? "")}>
                Save
              </Button>
            </div>
          </Field>
        </form>
        <Field
          id={`${id}-role`}
          label="Role"
          hint={isSelf ? "You can't change your own role — ask another admin." : "Changing the role signs them out everywhere."}
        >
          <Select value={user.role} onValueChange={(v) => changeRole(v as Role)} disabled={isSelf || busy}>
            <SelectTrigger id={`${id}-role`} className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STUDENT">Student</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </CardContent>
    </Card>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ user: UserDetail }>(`/api/admin/users/${id}`)
        .then(({ user }) => setUser(user))
        .catch((err: ApiError) => setError(err.status === 404 ? "This user doesn't exist." : err.message)),
    [id]
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="-ml-2 h-9 px-2">
          <Link href="/users">
            <ArrowLeftIcon /> All users
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t open this user</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const passed = user.quizAttempts.filter((a) => a.status === "PASSED").length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground">
        <Link href="/users">
          <ArrowLeftIcon /> All users
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="size-16 rounded-2xl">
          <AvatarFallback className="rounded-2xl bg-brand-brown font-heading text-xl font-bold text-white">{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-bold tracking-tight md:text-3xl">
            {user.name || "No name"}
            {user.role === "ADMIN" && (
              <Badge className="gap-1">
                <ShieldIcon className="size-3" /> Admin
              </Badge>
            )}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="truncate">{user.email}</span>
            {!user.emailVerified && <UnverifiedBadge />}
          </p>
          {user.phone && (
            <a href={`tel:+91${user.phone}`} className="text-sm text-muted-foreground tabular-nums hover:text-foreground hover:underline">
              {formatPhone(user.phone)}
            </a>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Joined {formatDate(user.createdAt)}
            {(user.medium || user.classLevel) && ` · studies ${[user.medium?.name, user.classLevel?.name].filter(Boolean).join(", ")}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-72">
          <Card className={cn(formCard, "gap-1 px-4 py-3")}>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CoinsIcon className="size-3.5 text-warning" /> Coins
            </span>
            <span className="font-heading text-2xl font-bold tabular-nums">{user.coins.toLocaleString("en-IN")}</span>
          </Card>
          <Card className={cn(formCard, "gap-1 px-4 py-3")}>
            <span className="text-xs text-muted-foreground">Quizzes passed</span>
            <span className="font-heading text-2xl font-bold tabular-nums">
              {passed}
              <span className="text-sm font-normal text-muted-foreground">/{user.quizAttempts.length}</span>
            </span>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CoinAdjust user={user} onDone={() => void load()} />
        <AccountCard key={`${user.role}-${user.name}`} user={user} onDone={() => void load()} />
      </div>

      <Card className={`${formCard} gap-0 py-0`}>
        <div className="border-b px-4 py-3">
          <p className="font-heading font-bold">Coin history</p>
          <p className="text-xs text-muted-foreground">Latest 50 changes</p>
        </div>
        {user.coinTxns.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No coin activity yet.</p>
        ) : (
          <ul className="divide-y">
            {user.coinTxns.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums",
                    t.delta > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                  )}
                >
                  {t.delta > 0 ? `+${t.delta}` : t.delta}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{COIN_REASON[t.reason]}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDate(t.createdAt, true)}
                    {t.note && ` · ${t.note}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  balance
                  <span className="block text-sm font-semibold text-foreground">{t.balanceAfter}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className={`${formCard} gap-0 py-0`}>
        <div className="border-b px-4 py-3">
          <p className="font-heading font-bold">Recent quizzes</p>
          <p className="text-xs text-muted-foreground">Latest 20 attempts · <Link href={`/quizzes/attempts?userId=${user.id}&range=all`} className="underline-offset-2 hover:underline">see all</Link></p>
        </div>
        {user.quizAttempts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No quizzes taken yet.</p>
        ) : (
          <ul className="divide-y">
            {user.quizAttempts.map((a) => {
              const status = QUIZ_STATUS[a.status];
              return (
                <li key={a.id}>
                  <Link href={`/quizzes/attempts/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" lang="as">
                      {a.quiz?.title ?? a.quizTitle ?? a.chapter?.title ?? "Quiz"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.chapter
                        ? `${a.chapter.subject.classLevel.name} · ${a.chapter.subject.name}`
                        : `${a.quiz?.classLevel.name ?? "?"} · several chapters`}{" "}
                      · {formatDate(a.startedAt, true)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                    <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                      score {a.score} · pass {a.passMark}
                      {a.coinsAwarded > 0 && ` · +${a.coinsAwarded} coins`}
                    </span>
                  </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
