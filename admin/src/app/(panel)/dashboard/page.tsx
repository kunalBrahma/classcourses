"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  CoinsIcon,
  ExternalLinkIcon,
  FileTextIcon,
  IndianRupeeIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  MinusIcon,
  RefreshCwIcon,
  TimerIcon,
  UserPlusIcon,
  UsersIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { BarChart } from "@/components/admin/dashboard/bar-chart";
import { UnverifiedBadge } from "@/components/admin/unverified-badge";
import { useAdmin } from "@/components/admin/session";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { rupees } from "@/lib/people";
import { siteLink } from "@/lib/site";
import { cn } from "@/lib/utils";

type Days = 7 | 30 | 90;

interface Stats {
  range: { days: Days; from: string; to: string };
  kpis: {
    revenuePaise: { value: number; previous: number; allTime: number };
    paidOrders: { value: number; previous: number; allTime: number };
    newStudents: { value: number; previous: number; total: number };
    activeStudents: { value: number; previous: number };
    quizzes: { value: number; previous: number };
    passRate: { value: number | null; previous: number | null };
    coinsAwarded: number;
  };
  series: { day: string; signups: number; revenuePaise: number; orders: number; quizzes: number; passed: number }[];
  topChapters: { id: string; label: string; title: string; classLevel: string; href: string; plays: number }[];
  topNotes: { id: string; title: string; sales: number; revenuePaise: number }[];
  recentOrders: {
    id: string;
    status: "PAID" | "REFUNDED";
    amountPaise: number;
    coinsUsed: number;
    paidAt: string;
    user: { id: string; name: string | null; email: string };
    note: { title: string };
  }[];
  recentStudents: { id: string; name: string | null; email: string; emailVerified: boolean; createdAt: string; classLevel: { name: string } | null }[];
  content: { subjects: number; chapters: number; qa: number; mcq: number; videos: number; notes: number; quizzes: number };
  attention: { message: string; href: string }[];
}

const RANGE_KEY = "cc_dashboard_days";
const num = (n: number) => new Intl.NumberFormat("en-IN").format(n);
const shortRupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: paise >= 10_000_000 ? "compact" : "standard", maximumFractionDigits: 0 }).format(paise / 100);

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
};

const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

// "↗ +12% vs previous 30 days": arrow + words, never colour alone.
function Change({ value, previous, days }: { value: number; previous: number; days: number }) {
  if (previous === 0) {
    return <span className="text-xs text-muted-foreground">{value > 0 ? `New in the last ${days} days` : `None in the last ${days} days`}</span>;
  }
  const diff = Math.round(((value - previous) / previous) * 100);
  const Icon = diff > 0 ? ArrowUpRightIcon : diff < 0 ? ArrowDownRightIcon : MinusIcon;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-0.5 text-xs font-semibold", diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground")}>
      <Icon className="size-3.5" aria-hidden="true" />
      {diff > 0 ? "+" : ""}
      {diff}%<span className="font-normal text-muted-foreground">&nbsp;vs previous {days} days</span>
    </span>
  );
}

function Kpi({ icon: Icon, label, value, children }: { icon: LucideIcon; label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className={cn(formCard, "gap-0 py-4")}>
      <CardContent className="grid gap-1 px-4">
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-brand-amber-text">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {label}
        </span>
        <span className="mt-1 font-heading text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</span>
        <div className="grid gap-0.5">{children}</div>
      </CardContent>
    </Card>
  );
}

function Panel({ title, description, action, children, className }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn(formCard, "gap-3 py-4", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <CardTitle className="font-heading text-base">{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

const SeeAll = ({ href, label }: { href: string; label: string }) => (
  <Button asChild variant="ghost" size="sm" className="-mr-2 h-8 shrink-0 text-brand-amber-text hover:text-brand-amber-text">
    <Link href={href}>
      {label} <ArrowRightIcon />
    </Link>
  </Button>
);

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

const readSavedDays = (): Days => {
  try {
    const saved = Number(localStorage.getItem(RANGE_KEY));
    return saved === 7 || saved === 90 ? saved : 30;
  } catch {
    return 30;
  }
};

// The admin home: headline figures with the change against the previous
// period, daily trends, what's selling and being played, the latest activity
// and the size of the content library. One call: GET /api/admin/stats.
export default function DashboardPage() {
  const admin = useAdmin();
  const firstName = admin.name?.trim().split(/\s+/)[0] || "Admin";
  const [days, setDays] = useState<Days>(readSavedDays);
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (d: Days) =>
      apiJson<Stats>(`/api/admin/stats?days=${d}`)
        .then((s) => {
          setData(s);
          setError(null);
        })
        .catch((err: ApiError) => setError(err.message)),
    []
  );

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const chooseDays = (value: string) => {
    const d = Number(value) as Days;
    setDays(d);
    try {
      localStorage.setItem(RANGE_KEY, String(d));
    } catch {
      /* not remembered: fine */
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await load(days);
    setRefreshing(false);
  };

  const k = data?.kpis;
  // While a new range loads, the previous range's figures stay (dimmed).
  const shownDays = data?.range.days ?? days;
  const stale = data !== null && data.range.days !== days;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`How Class Course is doing over the last ${shownDays} days (India time).`}
        actions={
          <>
            <Tabs value={String(days)} onValueChange={chooseDays}>
              <TabsList className="h-10">
                {[7, 30, 90].map((d) => (
                  <TabsTrigger key={d} value={String(d)} className="h-8 px-3">
                    {d} days
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon" className="size-10" onClick={refresh} disabled={refreshing} aria-label="Refresh figures">
              <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load the figures</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && data.attention.length > 0 && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangleIcon className="text-warning" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 grid gap-1">
              {data.attention.map((a) => (
                <li key={a.message}>
                  <Link href={a.href} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                    {a.message} <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!data || !k ? (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </>
      ) : (
        <div className={cn("space-y-6 transition-opacity", stale && "opacity-60")} aria-busy={stale}>
          {/* Headline figures */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            <Kpi icon={IndianRupeeIcon} label="Revenue" value={shortRupees(k.revenuePaise.value)}>
              <Change value={k.revenuePaise.value} previous={k.revenuePaise.previous} days={shownDays} />
              <span className="text-xs text-muted-foreground">
                {num(k.paidOrders.value)} paid order{k.paidOrders.value === 1 ? "" : "s"} · {shortRupees(k.revenuePaise.allTime)} all time
              </span>
            </Kpi>
            <Kpi icon={UserPlusIcon} label="New students" value={num(k.newStudents.value)}>
              <Change value={k.newStudents.value} previous={k.newStudents.previous} days={shownDays} />
              <span className="text-xs text-muted-foreground">{num(k.newStudents.total)} students in total</span>
            </Kpi>
            <Kpi icon={TimerIcon} label="Quizzes taken" value={num(k.quizzes.value)}>
              <Change value={k.quizzes.value} previous={k.quizzes.previous} days={shownDays} />
              <span className="text-xs text-muted-foreground">
                {k.passRate.value === null ? "None finished yet" : `${k.passRate.value}% passed`} · {num(k.coinsAwarded)} coins given
              </span>
            </Kpi>
            <Kpi icon={UsersIcon} label="Active students" value={num(k.activeStudents.value)}>
              <Change value={k.activeStudents.value} previous={k.activeStudents.previous} days={shownDays} />
              <span className="text-xs text-muted-foreground">Took at least one quiz</span>
            </Kpi>
          </div>

          {/* Trends */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Revenue per day" description="Paid note orders, after coin discounts" className="lg:col-span-2" action={<SeeAll href="/orders" label="Orders" />}>
              <BarChart label="Revenue" points={data.series.map((s) => ({ day: s.day, value: s.revenuePaise }))} format={shortRupees} />
            </Panel>
            <Panel title="Sign-ups per day" description="New student accounts" action={<SeeAll href="/users" label="Users" />}>
              <BarChart label="Sign-ups" points={data.series.map((s) => ({ day: s.day, value: s.signups }))} format={(v) => num(Math.round(v))} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Quizzes per day" description="Every quiz started, passed or not" className="lg:col-span-2" action={<SeeAll href="/quizzes/attempts" label="Results" />}>
              <BarChart label="Quizzes" points={data.series.map((s) => ({ day: s.day, value: s.quizzes }))} format={(v) => num(Math.round(v))} />
            </Panel>
            <Panel title="Most played chapters" description={`Quizzes in the last ${shownDays} days`}>
              {data.topChapters.length === 0 ? (
                <Empty>No chapter quizzes taken yet.</Empty>
              ) : (
                <ol className="grid gap-1">
                  {data.topChapters.map((c, i) => (
                    <li key={c.id} className="grid gap-1 py-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-4 shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                        <a href={siteLink(c.href)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline" title={c.title}>
                          {c.label} <span className="font-normal text-muted-foreground">· {c.classLevel}</span>
                          <ExternalLinkIcon className="ml-1 inline size-3 text-muted-foreground" aria-label="(opens the site)" />
                        </a>
                        <span className="shrink-0 font-semibold tabular-nums">{num(c.plays)}</span>
                      </div>
                      <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${(c.plays / data.topChapters[0].plays) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          {/* Activity */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Latest orders" action={<SeeAll href="/orders" label="All orders" />}>
              {data.recentOrders.length === 0 ? (
                <Empty>No orders yet.</Empty>
              ) : (
                <ul className="divide-y">
                  {data.recentOrders.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/users/${o.user.id}`} className="block truncate text-sm font-medium hover:underline">
                          {o.user.name || o.user.email}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground" lang="as">
                          {o.note.title} · {ago(o.paidAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-sm font-semibold tabular-nums", o.status === "REFUNDED" && "text-muted-foreground line-through")}>{rupees(o.amountPaise)}</p>
                        {o.status === "REFUNDED" ? (
                          <Badge variant="outline" className="h-5 px-1.5 text-xs">
                            Refunded
                          </Badge>
                        ) : (
                          o.coinsUsed > 0 && <p className="text-xs text-muted-foreground">{o.coinsUsed} coins used</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Newest students" action={<SeeAll href="/users?role=STUDENT" label="All students" />}>
              {data.recentStudents.length === 0 ? (
                <Empty>No students yet.</Empty>
              ) : (
                <ul className="divide-y">
                  {data.recentStudents.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/users/${u.id}`} className="flex items-center gap-2 text-sm font-medium hover:underline">
                          <span className="truncate">{u.name || u.email}</span>
                          {!u.emailVerified && <UnverifiedBadge />}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.classLevel?.name ?? "No class chosen"} · {u.email}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{ago(u.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Best-selling notes" description={`Last ${shownDays} days`} action={<SeeAll href="/notes" label="Notes" />}>
              {data.topNotes.length === 0 ? (
                <Empty>No notes sold in this period.</Empty>
              ) : (
                <ol className="divide-y">
                  {data.topNotes.map((n) => (
                    <li key={n.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" lang="as">
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {num(n.sales)} sale{n.sales === 1 ? "" : "s"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{rupees(n.revenuePaise)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>

          {/* Content library */}
          <Panel title="Content on the site" description="Published and visible to students">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {(
                [
                  { icon: BookOpenIcon, label: "Subjects", value: data.content.subjects, href: "/catalog/subjects" },
                  { icon: ListChecksIcon, label: "Chapters", value: data.content.chapters, href: "/catalog/subjects" },
                  { icon: MessageSquareTextIcon, label: "Q&A", value: data.content.qa, href: "/catalog/subjects" },
                  { icon: ListChecksIcon, label: "MCQs", value: data.content.mcq, href: "/catalog/subjects" },
                  { icon: VideoIcon, label: "Videos", value: data.content.videos, href: "/catalog/subjects" },
                  { icon: FileTextIcon, label: "Notes", value: data.content.notes, href: "/notes" },
                  { icon: CoinsIcon, label: "Custom quizzes", value: data.content.quizzes, href: "/quizzes/manage" },
                ] as const
              ).map((c) => (
                <Link key={c.label} href={c.href} className="flex items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2.5 transition hover:bg-accent">
                  <c.icon className="size-4 shrink-0 text-brand-amber-text" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-heading text-lg font-bold leading-tight tabular-nums">{num(c.value)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.label}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
