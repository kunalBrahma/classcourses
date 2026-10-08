"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  IndianRupeeIcon,
  LayersIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/components/admin/session";
import { formCard } from "@/components/admin/styles";
import { apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Overview {
  students: number | null;
  admins: number | null;
  mediums: number | null;
  subjects: number | null;
  chapters: number | null;
  paidOrders: number | null;
  revenuePaise: number | null;
  setup: {
    storage: boolean | null;
    privateBucket: boolean | null;
    email: boolean | null;
    payments: boolean | null;
    pagesPublished: number | null;
  };
}

type SettingRow = { key: string; source: string; value: Record<string, unknown> | null };

// No dedicated stats endpoint yet: compose the overview from existing admin
// endpoints. Each request is independent, so one failure only blanks its card.
async function loadOverview(): Promise<Overview> {
  const settled = <T,>(p: Promise<T>) => p.then((v) => v).catch(() => null);
  const [students, admins, mediums, subjects, orders, settings, pages] = await Promise.all([
    settled(apiJson<{ total: number }>("/api/admin/users?role=STUDENT&pageSize=1")),
    settled(apiJson<{ total: number }>("/api/admin/users?role=ADMIN&pageSize=1")),
    settled(apiJson<{ mediums: unknown[] }>("/api/admin/mediums")),
    settled(apiJson<{ subjects: { chapterCount: number }[] }>("/api/admin/subjects")),
    settled(apiJson<{ paid: { count: number; amountPaise: number } }>("/api/admin/orders?pageSize=1")),
    settled(apiJson<{ settings: SettingRow[] }>("/api/admin/settings")),
    settled(apiJson<{ pages: { isPublished: boolean }[] }>("/api/admin/pages")),
  ]);

  const byKey = Object.fromEntries((settings?.settings ?? []).map((s) => [s.key, s]));
  const configured = (key: string) => (settings ? byKey[key]?.source === "database" || byKey[key]?.source === "env" : null);

  return {
    students: students?.total ?? null,
    admins: admins?.total ?? null,
    mediums: mediums?.mediums.length ?? null,
    subjects: subjects?.subjects.length ?? null,
    chapters: subjects ? subjects.subjects.reduce((sum, s) => sum + s.chapterCount, 0) : null,
    paidOrders: orders?.paid.count ?? null,
    revenuePaise: orders?.paid.amountPaise ?? null,
    setup: {
      storage: configured("storage"),
      privateBucket: settings ? Boolean(byKey.storage?.value?.privateBucket) : null,
      email: configured("smtp"),
      payments: configured("razorpay"),
      pagesPublished: pages ? pages.pages.filter((p) => p.isPublished).length : null,
    },
  };
}

const formatNumber = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("en-IN").format(n));
const formatRupees = (paise: number | null) =>
  paise === null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  accent: string;
}) {
  return (
    <Card className={cn(formCard, "gap-3 py-4 sm:py-5")}>
      <CardContent className="flex flex-col-reverse items-start justify-between gap-3 px-4 sm:flex-row sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-2xl font-bold tracking-tight tabular-nums sm:mt-2 sm:text-3xl">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl sm:size-10", accent)}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

interface ChecklistItem {
  done: boolean | null;
  title: string;
  detail: string;
  href?: string;
  later?: string;
}

function Checklist({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  return (
    <Card className={formCard}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="font-heading text-lg">Launch checklist</CardTitle>
          <CardDescription className="mt-1.5">What still needs setting up before students and payments can go live.</CardDescription>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {done}/{items.length} done
        </Badge>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-brand-amber transition-[width] duration-700" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
        <ul className="divide-y">
          {items.map((item) => {
            const body = (
              <>
                {item.done ? (
                  <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <CircleDashedIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="To do" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-semibold", item.done && "text-muted-foreground line-through decoration-1")}>{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{item.detail}</span>
                </span>
                {!item.done && item.href && <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />}
                {!item.done && !item.href && item.later && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {item.later}
                  </Badge>
                )}
              </>
            );
            return (
              <li key={item.title}>
                {item.href && !item.done ? (
                  <Link href={item.href} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition hover:bg-muted/60">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

export default function DashboardPage() {
  const admin = useAdmin();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    void loadOverview().then(setData);
  }, []);

  const firstName = admin.name?.trim().split(/\s+/)[0] || "Admin";

  return (
    <div className="space-y-6">
      {/* Welcome banner — the login page's navy + 3D card language */}
      <section
        className="relative overflow-hidden rounded-2xl bg-brand-navy px-6 py-7 text-white shadow-[0_20px_40px_-24px_rgba(31,29,74,.8)] sm:px-8"
        style={{
          backgroundImage:
            "radial-gradient(circle at 90% 0%, rgba(99,102,241,.5), transparent 50%), radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)",
          backgroundSize: "auto, 20px 20px",
        }}
      >
        <div className="relative z-10 max-w-xl">
          <p className="text-sm font-medium text-indigo-200">{greeting()},</p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{firstName} 👋</h1>
          <p className="mt-3 text-sm leading-relaxed text-indigo-100/85 sm:text-[15px]">
            Here&apos;s how Class Course is doing. Finish the checklist below to get ready for launch.
          </p>
        </div>
        <div className="pointer-events-none absolute right-10 top-1/2 hidden h-28 w-48 -translate-y-1/2 md:block lg:right-14" aria-hidden="true">
          <div className="absolute inset-0 translate-x-5 translate-y-5 rotate-6 rounded-2xl bg-[#312e81]" />
          <div className="absolute inset-0 translate-x-2.5 translate-y-2.5 rotate-3 rounded-2xl bg-[#4338ca]" />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] p-4 shadow-xl">
            <span className="font-heading text-lg font-bold">Class 1 – 12</span>
          </div>
        </div>
      </section>

      {!data ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[124px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            icon={UsersIcon}
            label="Students"
            value={formatNumber(data.students)}
            detail={data.admins !== null ? `${data.admins} admin${data.admins === 1 ? "" : "s"}` : undefined}
            accent="bg-primary/10 text-primary"
          />
          <StatCard
            icon={LayersIcon}
            label="Subjects"
            value={formatNumber(data.subjects)}
            detail={data.mediums !== null ? `across ${data.mediums} medium${data.mediums === 1 ? "" : "s"}` : undefined}
            accent="bg-chart-3/15 text-chart-3"
          />
          <StatCard icon={BookOpenIcon} label="Chapters" value={formatNumber(data.chapters)} detail="placeholders until renamed" accent="bg-chart-4/15 text-chart-4" />
          <StatCard
            icon={IndianRupeeIcon}
            label="Revenue"
            value={formatRupees(data.revenuePaise)}
            detail={data.paidOrders !== null ? `${data.paidOrders} paid order${data.paidOrders === 1 ? "" : "s"}` : undefined}
            accent="bg-brand-amber/15 text-warning"
          />
        </div>
      )}

      {!data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <Checklist
          items={[
            {
              done: data.setup.storage,
              title: "Connect file storage",
              detail: "Cloudflare R2 for images and note PDFs.",
              href: "/settings/storage",
            },
            {
              done: data.setup.privateBucket,
              title: "Add a private bucket for premium notes",
              detail: "Paid notes can't be sold without it.",
              href: "/settings/storage",
            },
            {
              done: data.setup.email,
              title: "Set up email",
              detail: "Password resets and purchase receipts.",
              href: "/settings/email",
            },
            {
              done: data.setup.payments,
              title: "Connect Razorpay",
              detail: "Test keys first, live keys after KYC.",
              href: "/settings/payments",
            },
            {
              done: data.setup.pagesPublished !== null ? data.setup.pagesPublished >= 4 : null,
              title: "Publish the legal pages",
              detail: `Contact, Privacy, Terms and Refund policy (Razorpay checks these). ${data.setup.pagesPublished ?? 0} published so far.`,
              href: "/pages",
            },
          ]}
        />
      )}
    </div>
  );
}
