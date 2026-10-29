"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRightIcon, CheckIcon, CoinsIcon, FileTextIcon, HistoryIcon, Loader2Icon, LogOutIcon, PlayIcon, ReceiptIcon, TimerIcon, XIcon } from "lucide-react";
import { Coin3D } from "@/components/kit/coin";
import { SectionTitle } from "@/components/kit/section-title";
import { useMe } from "@/components/site/account-menu";
import { ApiError, apiJson, logout } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Attempt, attemptLabel, chapterHrefOf, isFinished, quizHref } from "@/lib/quiz";
import type { NoteItem } from "@/lib/notes";
import { NoteList } from "@/components/notes/note-list";
import { placeLine } from "@/components/notes/place-line";
import { rupees } from "@/components/kit/note-card";
import { cn } from "@/lib/utils";

interface CoinTx {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: "QUIZ_PASS" | "NOTE_DISCOUNT" | "NOTE_DISCOUNT_REFUND" | "NOTE_DISCOUNT_REAPPLIED" | "ADMIN_ADJUST";
  note: string | null;
  createdAt: string;
}

interface MyOrder {
  id: string;
  status: "CREATED" | "PAID" | "CANCELLED" | "REFUNDED";
  amountPaise: number;
  coinsUsed: number;
  createdAt: string;
  note: { id: string; title: string } | null;
}

const ORDER_STATUS: Record<MyOrder["status"], { label: string; className: string }> = {
  PAID: { label: "Paid", className: "bg-success/12 text-success" },
  CREATED: { label: "Waiting for payment", className: "bg-accent text-brand-amber-text" },
  CANCELLED: { label: "Not completed", className: "bg-muted text-muted-foreground" },
  REFUNDED: { label: "Refunded", className: "bg-secondary text-secondary-foreground" },
};

const REASON: Record<CoinTx["reason"], string> = {
  QUIZ_PASS: "Passed a quiz",
  NOTE_DISCOUNT: "Used on a note",
  NOTE_DISCOUNT_REFUND: "Returned (order not completed or refunded)",
  NOTE_DISCOUNT_REAPPLIED: "Used on a note (paid after the order expired)",
  ADMIN_ADJUST: "From Class Course",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

// The student's own page: coins + history, bought notes, today's unfinished
// quizzes, past quizzes.
export function ProfileView() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const [coins, setCoins] = useState<{ balance: number; transactions: CoinTx[] } | null>(null);
  const [today, setToday] = useState<{ attempts: Attempt[]; usage: { remaining: number; limit: number } } | null>(null);
  const [history, setHistory] = useState<Attempt[] | null>(null);
  const [notes, setNotes] = useState<NoteItem[] | null>(null);
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    Promise.all([
      apiJson<{ balance: number; transactions: CoinTx[] }>("/api/users/me/coins"),
      apiJson<{ attempts: Attempt[]; usage: { remaining: number; limit: number } }>("/api/quiz/today"),
      apiJson<{ attempts: Attempt[] }>("/api/quiz/history?limit=30"),
      apiJson<{ notes: NoteItem[] }>("/api/users/me/notes"),
      apiJson<{ orders: MyOrder[] }>("/api/users/me/orders"),
    ])
      .then(([c, t, h, n, o]) => {
        setOrders(o.orders);
        setCoins(c);
        setToday(t);
        setHistory(h.attempts);
        setNotes(n.notes);
      })
      .catch((err: ApiError) => setError(err.message));
  }, [pathname, router]);

  if (error) return <p className="card-3d rounded-2xl p-6 text-destructive">{error}</p>;
  if (!coins || !today || !history || !notes || !orders) return <Loader2Icon className="mx-auto mt-10 size-8 animate-spin text-brand-amber-text" aria-label="Loading your profile" />;

  const unfinished = today.attempts.filter((a) => !isFinished(a));
  const finished = history.filter(isFinished);

  return (
    <div className="grid gap-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-brand-amber-text">My profile</p>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">{me?.name || "Hello!"}</h1>
          {me && <p className="text-muted-foreground">{me.email}</p>}
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace("/");
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-4 font-semibold text-destructive hover:bg-destructive/10"
        >
          <LogOutIcon className="size-4" /> Sign out
        </button>
      </header>

      <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-[image:var(--header-bg)] p-5 text-brand-ink shadow-[var(--header-shadow)] dark:text-brand-cream">
        <Coin3D className="size-14 text-xl" />
        <div className="flex-1">
          <p className="font-heading text-3xl font-extrabold tabular-nums">{coins.balance} coins</p>
          <p>Pass quizzes to earn more. Use them for money off notes.</p>
        </div>
      </section>

      <section aria-labelledby="notes-title">
        <SectionTitle icon={FileTextIcon} action={{ href: "/notes", label: "Notes store" }}>
          <span id="notes-title">My notes</span>
        </SectionTitle>
        {notes.length === 0 ? (
          <p className="card-3d rounded-2xl p-4 text-muted-foreground">Notes you buy appear here, ready to download any time.</p>
        ) : (
          <NoteList notes={notes} subtitle={placeLine} />
        )}
      </section>

      <section aria-labelledby="today-title">
        <SectionTitle icon={TimerIcon}>
          <span id="today-title">Today</span>
        </SectionTitle>
        <p className="mb-3 text-muted-foreground">
          {today.usage.remaining > 0 ? `You can take ${today.usage.remaining} more ${today.usage.remaining === 1 ? "quiz" : "quizzes"} today.` : "You've used all your quizzes for today. Come back after midnight!"}
        </p>
        {unfinished.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {unfinished.map((a) => (
              <li key={a.id}>
                <Link href={quizHref(a.id)} className="card-3d lift flex items-center gap-3 rounded-2xl p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[image:var(--header-bg)] text-brand-ink" aria-hidden="true">
                    <PlayIcon className="size-5 fill-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" lang="as">
                      {attemptLabel(a, true)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {a.answered} of {a.total} answered · finish before midnight
                    </span>
                  </span>
                  <span className="font-semibold text-brand-amber-text">Resume</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card-3d rounded-2xl p-4 text-muted-foreground">No paused quizzes. Open a chapter and take its quiz!</p>
        )}
      </section>

      <section aria-labelledby="history-title">
        <SectionTitle icon={HistoryIcon}>
          <span id="history-title">My quizzes</span>
        </SectionTitle>
        {finished.length === 0 ? (
          <p className="card-3d rounded-2xl p-4 text-muted-foreground">You haven&apos;t finished a quiz yet.</p>
        ) : (
          <ul className="grid gap-2.5">
            {finished.map((a) => {
              const href = chapterHrefOf(a);
              return (
                <li key={a.id} className="card-3d flex items-center gap-3 rounded-2xl px-4 py-3">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg text-white",
                      a.status === "PASSED" ? "bg-success" : a.status === "FAILED" ? "bg-destructive" : "bg-muted-foreground"
                    )}
                    aria-hidden="true"
                  >
                    {a.status === "PASSED" ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" lang="as">
                      {attemptLabel(a, true)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {a.status === "EXPIRED" ? "Ended at midnight" : `${a.score ?? 0}/${a.total} · ${a.status === "PASSED" ? "Passed" : "Not passed"}`}
                      {a.coinsAwarded > 0 && ` · +${a.coinsAwarded} coins`} · {when(a.startedAt)}
                    </span>
                  </span>
                  <Link href={quizHref(a.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-amber-text hover:underline" aria-label={`See answers for ${attemptLabel(a, true)}`}>
                    Answers
                  </Link>
                  {href && (
                    <Link href={href} className="hidden min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-amber-text hover:underline sm:inline-flex">
                      Chapter <ArrowRightIcon className="size-4" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {orders.length > 0 && (
        <section aria-labelledby="orders-title">
          <SectionTitle icon={ReceiptIcon}>
            <span id="orders-title">My orders</span>
          </SectionTitle>
          <p className="mb-3 text-muted-foreground">Need help with a payment? Email us with the order ID.</p>
          <ul className="card-3d divide-y rounded-2xl">
            {orders.map((o) => (
              <li key={o.id} className="grid gap-1 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-semibold" lang="as">
                    {o.note?.title ?? "A note"}
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", ORDER_STATUS[o.status].className)}>{ORDER_STATUS[o.status].label}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {when(o.createdAt)} · {o.amountPaise > 0 ? rupees(o.amountPaise) : "Free with coins"}
                  {o.coinsUsed > 0 && ` · ${o.coinsUsed} coins`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Order ID: <span className="select-all font-mono">{o.id}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="coins-title">
        <SectionTitle icon={CoinsIcon}>
          <span id="coins-title">Coin history</span>
        </SectionTitle>
        {coins.transactions.length === 0 ? (
          <p className="card-3d rounded-2xl p-4 text-muted-foreground">No coins yet. Pass a quiz to earn your first coins!</p>
        ) : (
          <ul className="card-3d divide-y rounded-2xl">
            {coins.transactions.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{REASON[t.reason]}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t.note ? `${t.note} · ` : ""}
                    {when(t.createdAt)}
                  </span>
                </span>
                <span className={cn("font-heading text-lg font-extrabold tabular-nums", t.delta > 0 ? "text-success" : "text-destructive")}>
                  {t.delta > 0 ? `+${t.delta}` : t.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
