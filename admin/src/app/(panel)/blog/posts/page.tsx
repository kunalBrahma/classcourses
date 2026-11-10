"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, FolderTreeIcon, HeartIcon, ImageIcon, PlusIcon, SearchIcon, BookmarkIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { useFilterParams } from "@/components/admin/quiz/filters";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { BlogCategory, BlogPostRow, shortDate } from "@/lib/engagement";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/blog/status-badge";

const ALL = "__all";
const PAGE_SIZE = 25;

interface Page {
  posts: BlogPostRow[];
  total: number;
  page: number;
  totalPages: number;
}

function PostsList() {
  const { params, set } = useFilterParams();
  const status = params.get("status") ?? "all";
  const categoryId = params.get("category") ?? ALL;
  const query = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(query);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ categories: BlogCategory[] }>("/api/admin/blog/categories").then((r) => setCategories(r.categories)).catch(() => undefined);
  }, []);

  // Search as you type, after a short pause
  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => set({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [search, query, set]);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status !== "all") q.set("status", status);
    if (categoryId !== ALL) q.set("categoryId", categoryId);
    if (query) q.set("search", query);
    let cancelled = false;
    apiJson<Page>(`/api/admin/blog/posts?${q}`)
      .then((r) => !cancelled && (setData(r), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [status, categoryId, query, page]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog posts"
        description="Articles for students and parents: study tips, exam news, guides. Drafts are only visible here; published posts appear on the site's Blog within a few minutes."
        actions={
          <>
            <Button asChild variant="outline" className="h-10">
              <Link href="/blog/categories"><FolderTreeIcon /> Categories</Link>
            </Button>
            <Button asChild className={pressable}>
              <Link href="/blog/posts/new"><PlusIcon /> New post</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => set({ status: v === "all" ? null : v })}>
          <TabsList>
            <TabsTrigger value="all" className="h-9 px-3">All</TabsTrigger>
            <TabsTrigger value="PUBLISHED" className="h-9 px-3">Published</TabsTrigger>
            <TabsTrigger value="DRAFT" className="h-9 px-3">Drafts</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid gap-2 sm:flex">
          <Select value={categoryId} onValueChange={(v) => set({ category: v })}>
            <SelectTrigger aria-label="Category" className="h-10 w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles" aria-label="Search posts" className="h-10 pl-9" />
          </div>
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!data && !error && <Skeleton className="h-72 rounded-2xl" />}
      {data && (
        <Card className={cn(formCard, "gap-0 py-0")}>
          <ul className="divide-y">
            {data.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/blog/posts/${p.id}`} className="flex items-center gap-3 px-3 py-3 transition hover:bg-muted/40 sm:px-4">
                  <span className="grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted sm:w-28">
                    {p.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket
                      <img src={p.coverImageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <StatusBadge post={p} />
                      {p.category && <span>{p.category.name}</span>}
                      <span>Edited {shortDate(p.updatedAt)}</span>
                      <span className="inline-flex items-center gap-1" title="Likes"><HeartIcon className="size-3" /> {p._count.likes}</span>
                      <span className="inline-flex items-center gap-1" title="Saves"><BookmarkIcon className="size-3" /> {p._count.savedBy}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {data.posts.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                {query || status !== "all" || categoryId !== ALL ? "No posts match these filters." : "No posts yet. Write the first one with “New post”."}
              </li>
            )}
          </ul>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">{data.total} posts</span>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeftIcon /></Button>
                <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRightIcon /></Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function BlogPostsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 rounded-2xl" />}>
      <PostsList />
    </Suspense>
  );
}
