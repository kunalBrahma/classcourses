"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { formCard, inputClass } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate } from "@/lib/people";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  method: string;
  path: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  reason: string | null;
  details: { request?: unknown; before?: unknown; after?: unknown } | null;
  statusCode: number;
  createdAt: string;
}
interface Page {
  entries: Entry[];
  total: number;
  page: number;
  totalPages: number;
  actors: { id: string | null; email: string; count: number }[];
}

// Named actions in plain words; others show the route (e.g. "PATCH /chapters/:chapterId").
const ACTIONS: Record<string, string> = {
  "user.suspend": "Suspended a student",
  "user.unsuspend": "Lifted a suspension",
  "user.block": "Blocked a student",
  "user.unblock": "Unblocked a student",
  "user.sign_out_everywhere": "Signed a student out everywhere",
  "user.edit_details": "Edited a student's details",
  "user.erase": "Erased a student's account",
  "user.export": "Downloaded a student's data",
  "user.role": "Changed a role",
  "user.rename": "Renamed an account",
  "team.add_helper": "Added a helper admin",
  "team.update_helper": "Changed a helper's sections",
  "team.remove_helper": "Removed a helper admin",
};

const verb = (method: string) => ({ POST: "Added / ran", PUT: "Saved", PATCH: "Changed", DELETE: "Deleted", GET: "Viewed" })[method] ?? method;

// Admin → Activity log (Super Admin only): who changed what, when and why
// (client requirements of 6 Nov 2026). Written automatically for every change.
export default function ActivityPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [actorId, setActorId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set("q", query);
    if (actorId) params.set("actorId", actorId);
    let cancelled = false;
    apiJson<Page>(`/api/admin/activity?${params}`)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [query, actorId, page]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setQuery(q.trim());
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Activity log" description="Every change made in this admin panel: who, what, when and why. Nothing can be changed without a trace. Passwords and keys are never stored here." />

      <div className="flex flex-col gap-3 sm:flex-row">
        <form onSubmit={search} className="relative sm:w-80">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, reason, admin, page" aria-label="Search the activity log" className={cn(inputClass, "pl-9")} />
        </form>
        {data && data.actors.length > 1 && (
          <select
            aria-label="Admin"
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
          >
            <option value="">Every admin</option>
            {data.actors.map((a) => (
              <option key={a.id ?? a.email} value={a.id ?? ""}>
                {a.email} ({a.count})
              </option>
            ))}
          </select>
        )}
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
            {data.entries.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {ACTIONS[e.action] ?? `${verb(e.method)}: ${e.action.replace(/^[A-Z]+ /, "")}`}
                      {e.statusCode >= 400 && (
                        <Badge variant="outline" className="h-5 border-destructive/30 px-1.5 text-[10px] text-destructive">
                          Refused ({e.statusCode})
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.actorEmail}
                      {e.summary && ` · ${e.summary}`}
                      {e.reason && ` · “${e.reason}”`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(e.createdAt, true)}</span>
                </button>
                {open === e.id && (
                  <div className="grid gap-2 border-t bg-muted/30 px-4 py-3 text-xs">
                    <p>
                      <span className="text-muted-foreground">Request:</span> <span className="font-mono">{e.method} {e.path}</span>
                    </p>
                    {e.targetType === "user" && e.targetId && (
                      <Link href={`/users/${e.targetId}`} className="w-fit font-semibold text-brand-amber-text hover:underline">
                        Open the account
                      </Link>
                    )}
                    {e.details && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-card p-3 font-mono">{JSON.stringify(e.details, null, 2)}</pre>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {data.entries.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">Nothing recorded {query || actorId ? "for this search" : "yet"}.</p>}
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">{data.total.toLocaleString("en-IN")} entries</span>
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
