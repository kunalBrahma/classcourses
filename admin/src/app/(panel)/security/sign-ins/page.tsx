"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate } from "@/lib/people";
import { cn } from "@/lib/utils";

type Result = "SUCCESS" | "WRONG_PASSWORD" | "LOCKED" | "UNLOCK_CODE_SENT" | "UNLOCKED";
interface Attempt {
  id: string;
  email: string;
  result: Result;
  ip: string;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string | null } | null;
}
interface Page {
  attempts: Attempt[];
  total: number;
  page: number;
  totalPages: number;
  failedToday: number;
}

const RESULT: Record<Result, { label: string; className: string }> = {
  SUCCESS: { label: "Signed in", className: "border-success/30 bg-success/10 text-success" },
  WRONG_PASSWORD: { label: "Wrong password", className: "border-warning/40 bg-warning/10 text-warning" },
  LOCKED: { label: "Paused", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  UNLOCK_CODE_SENT: { label: "Unlock code sent", className: "" },
  UNLOCKED: { label: "Unlocked by code", className: "" },
};
const FILTERS: { value: Result | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "SUCCESS", label: "Signed in" },
  { value: "WRONG_PASSWORD", label: "Wrong password" },
  { value: "LOCKED", label: "Paused" },
];

// "Chrome on Android", "Safari on iPhone" — enough to recognise a device.
const device = (ua: string | null) => {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
};

// Every sign-in attempt on an admin account (client requirements of 6 Nov 2026).
export default function SignInLogPage() {
  const [filter, setFilter] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page) });
    if (filter) q.set("result", filter);
    let cancelled = false;
    apiJson<Page>(`/api/admin/security/admin-logins?${q}`)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [filter, page]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sign-in log"
        description="Every sign-in attempt on an admin account: when, from where, and what happened. If you see wrong passwords you didn't type, change your password."
      />

      {data && data.failedToday > 0 && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertDescription>
            {data.failedToday} failed admin sign-in{data.failedToday === 1 ? "" : "s"} in the last 24 hours.
          </AlertDescription>
        </Alert>
      )}

      <div role="group" aria-label="Filter by result" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.label}
            type="button"
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            aria-pressed={filter === f.value}
            className="h-10 rounded-full px-4"
            onClick={() => {
              setFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!data && !error && <Skeleton className="h-96 rounded-2xl" />}

      {data && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {data.attempts.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <Badge variant="outline" className={cn("w-fit shrink-0", RESULT[a.result].className)}>
                  {RESULT[a.result].label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {a.user ? (
                      <Link href={`/users/${a.user.id}`} className="hover:underline">
                        {a.user.name || a.email}
                      </Link>
                    ) : (
                      a.email
                    )}
                    {a.user?.name && <span className="ml-2 text-sm font-normal text-muted-foreground">{a.email}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {device(a.userAgent)} · <span className="tabular-nums">{a.ip}</span>
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{formatDate(a.createdAt, true)}</span>
              </li>
            ))}
          </ul>
          {data.attempts.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">No admin sign-ins {filter ? "of this kind " : ""}yet.</p>}
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {data.total.toLocaleString("en-IN")} attempt{data.total === 1 ? "" : "s"}
            </span>
            {data.totalPages > 1 && (
              <span className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeftIcon />
                </Button>
                <span className="tabular-nums">
                  {page} / {data.totalPages}
                </span>
                <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRightIcon />
                </Button>
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
