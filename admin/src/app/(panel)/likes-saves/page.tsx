"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, HeartIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/admin/confirm";
import { PageHeader } from "@/components/admin/page-header";
import { useFilterParams } from "@/components/admin/quiz/filters";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { itemTitle, ReactionRow, TopItem } from "@/lib/engagement";
import { formatDate } from "@/lib/people";
import { siteLink } from "@/lib/site";
import { cn } from "@/lib/utils";

interface Summary {
  totals: { likes: number; saves: number };
  mostLiked: TopItem[];
  mostSaved: TopItem[];
}
interface Page {
  items: ReactionRow[];
  total: number;
  page: number;
  totalPages: number;
}

function TopList({ title, icon, items }: { title: string; icon: React.ReactNode; items: TopItem[] }) {
  return (
    <Card className={formCard}>
      <CardHeader><CardTitle className="flex items-center gap-2 font-heading text-base">{icon} {title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ol className="grid gap-2">
            {items.slice(0, 5).map((i) => (
              <li key={i.targetId} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" lang="as">{itemTitle(i)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.context}</span>
                </span>
                <span className="font-heading font-bold tabular-nums">{i.count}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// Likes and saves with moderation controls (client requirements of 6 Nov 2026):
// see what students like, remove a like or a save, clear a spammer's likes.
function LikesSavesInner() {
  const confirm = useConfirm();
  const { params, set } = useFilterParams();
  const kind = (params.get("kind") ?? "like") as "like" | "save";
  const userId = params.get("userId");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    apiJson<Summary>("/api/admin/reactions/summary").then(setSummary).catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    const q = new URLSearchParams({ kind, page: String(page), pageSize: "25" });
    if (userId) q.set("userId", userId);
    let cancelled = false;
    apiJson<Page>(`/api/admin/reactions?${q}`)
      .then((r) => !cancelled && (setData(r), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [kind, userId, page, reload]);

  const remove = async (row: ReactionRow) => {
    const what = kind === "like" ? "like" : "saved item";
    if (!(await confirm({ title: `Remove this ${what}?`, description: `${row.user.name || row.user.email} on “${itemTitle(row)}”.`, confirmLabel: "Remove", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/reactions/${kind === "like" ? "likes" : "saves"}/${row.id}`, { method: "DELETE" });
      toast.success("Removed");
      setReload((r) => r + 1);
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const filteredUser = userId ? data?.items[0]?.user : null;

  const clearAll = async () => {
    if (!userId) return;
    if (!(await confirm({ title: "Remove all of this student's likes?", description: "For spam or fake likes. Their saved items stay.", confirmLabel: "Remove all likes", destructive: true }))) return;
    try {
      const res = await apiJson<{ message: string }>(`/api/admin/reactions/users/${userId}/clear-likes`, { method: "POST", json: { reason: "Spam or fake likes" } });
      toast.success(res.message);
      setReload((r) => r + 1);
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Likes & saves" description="What students like and save on chapter pages and blog posts. Remove a like or a save that's spam, or all of one student's likes." />

      <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className={cn(formCard, "content-center gap-3 px-5 py-4")}>
          <span className="flex items-center gap-2 text-sm text-muted-foreground"><HeartIcon className="size-4 text-destructive" /> Likes</span>
          <span className="font-heading text-3xl font-bold tabular-nums">{summary?.totals.likes.toLocaleString("en-IN") ?? "—"}</span>
          <span className="flex items-center gap-2 text-sm text-muted-foreground"><BookmarkIcon className="size-4 text-brand-amber-text" /> Saves</span>
          <span className="font-heading text-3xl font-bold tabular-nums">{summary?.totals.saves.toLocaleString("en-IN") ?? "—"}</span>
        </Card>
        <TopList title="Most liked" icon={<HeartIcon className="size-4 text-destructive" />} items={summary?.mostLiked ?? []} />
        <TopList title="Most saved" icon={<BookmarkIcon className="size-4 text-brand-amber-text" />} items={summary?.mostSaved ?? []} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={kind} onValueChange={(v) => set({ kind: v === "like" ? null : v })}>
          <TabsList>
            <TabsTrigger value="like" className="h-9 px-3">Likes</TabsTrigger>
            <TabsTrigger value="save" className="h-9 px-3">Saves</TabsTrigger>
          </TabsList>
        </Tabs>
        {userId && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Only <strong>{filteredUser ? filteredUser.name || filteredUser.email : "one student"}</strong></span>
            <Button variant="outline" size="sm" className="h-8" onClick={() => set({ userId: null })}>Show everyone</Button>
            {kind === "like" && (data?.total ?? 0) > 0 && (
              <Button variant="outline" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => void clearAll()}>Remove all likes</Button>
            )}
          </div>
        )}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!data && !error && <Skeleton className="h-64 rounded-2xl" />}
      {data && (
        <Card className={cn(formCard, "gap-0 py-0")}>
          <ul className="divide-y">
            {data.items.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold" lang="as">{itemTitle(row)}</span>
                    {!row.available && <Badge variant="outline" className="text-muted-foreground">Not on the site</Badge>}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{row.context}</span>
                    <button type="button" onClick={() => set({ userId: row.user.id })} className="font-medium text-foreground hover:underline">{row.user.name || row.user.email}</button>
                    <span>{formatDate(row.savedAt, true)}</span>
                  </p>
                </div>
                {row.available && (
                  <Button asChild variant="ghost" size="icon" className="size-9">
                    <a href={siteLink(row.href)} target="_blank" rel="noreferrer" aria-label="View on site"><ExternalLinkIcon /></a>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="size-9 text-destructive hover:text-destructive" aria-label="Remove" onClick={() => void remove(row)}><Trash2Icon /></Button>
              </li>
            ))}
            {data.items.length === 0 && <li className="px-4 py-12 text-center text-sm text-muted-foreground">{kind === "like" ? "No likes yet." : "Nothing saved yet."}</li>}
          </ul>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">{data.total} {kind === "like" ? "likes" : "saves"}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeftIcon /></Button>
                <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRightIcon /></Button>
              </div>
            </div>
          )}
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        To warn a student about abuse, open them in <Link href="/users" className="font-semibold text-brand-amber-text hover:underline">Users</Link> and use “Send a notice or warning”.
      </p>
    </div>
  );
}

export default function LikesSavesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <LikesSavesInner />
    </Suspense>
  );
}
