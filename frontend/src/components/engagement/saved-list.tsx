"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkIcon, BookOpenIcon, Loader2Icon, PenLineIcon, Trash2Icon } from "lucide-react";
import { ApiError, apiJson } from "@/lib/api";
import { SavedItem } from "@/lib/engagement";
import { cn } from "@/lib/utils";
import { chapterName } from "@/lib/catalog";

interface Page {
  items: SavedItem[];
  total: number;
  page: number;
  totalPages: number;
}

const label = (i: SavedItem) => (i.type === "CHAPTER" && i.chapterNumber !== null ? chapterName({ number: i.chapterNumber, title: i.title }) : i.title);

// Profile → Saved (client requirements of 6 Nov 2026): title, class or
// subject, type, open and remove, with an empty state. `limit` shows the
// latest few with a "See all" link (profile); without it, the full list.
export function SavedList({ limit }: { limit?: number }) {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(
    (p: number) =>
      apiJson<Page>(`/api/users/me/saved?page=${p}&pageSize=${limit ?? 20}`).then((r) => {
        setItems((old) => (p === 1 ? r.items : [...(old ?? []), ...r.items]));
        setTotal(r.total);
        setPage(r.page);
        setTotalPages(r.totalPages);
      }),
    [limit]
  );

  useEffect(() => {
    load(1).catch((err: ApiError) => setError(err.message));
  }, [load]);

  const remove = async (item: SavedItem) => {
    setRemoving(item.id);
    try {
      await apiJson(`/api/users/me/saved/${item.id}`, { method: "DELETE" });
      setItems((list) => list?.filter((i) => i.id !== item.id) ?? null);
      setTotal((t) => t - 1);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setRemoving(null);
    }
  };

  if (error) return <p role="alert" className="card-3d rounded-2xl p-4 text-destructive">{error}</p>;
  if (!items) return <div className="card-3d h-24 animate-pulse rounded-2xl" aria-hidden="true" />;
  if (items.length === 0) {
    return (
      <div className="card-3d flex items-center gap-3 rounded-2xl p-4 text-muted-foreground">
        <BookmarkIcon className="size-6 shrink-0 text-brand-amber-text" aria-hidden="true" />
        <p>Nothing saved yet. Tap <strong className="text-foreground">Save</strong> on a chapter or blog post to keep it here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <ul className="card-3d divide-y overflow-hidden rounded-2xl">
        {items.map((item) => {
          const Icon = item.type === "CHAPTER" ? BookOpenIcon : PenLineIcon;
          return (
            <li key={item.id} className={cn("flex items-center gap-3 px-4 py-3", !item.available && "opacity-70")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-amber-text" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                {item.available ? (
                  <Link href={item.href} className="block truncate font-semibold hover:underline" lang="as" translate="no">
                    <span className="notranslate">{label(item)}</span>
                  </Link>
                ) : (
                  <span className="block truncate font-semibold" lang="as">{label(item)}</span>
                )}
                <span className="block truncate text-sm text-muted-foreground">
                  {item.type === "CHAPTER" ? "Chapter" : "Blog post"} · {item.context}
                  {!item.available && " · no longer on the site"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(item)}
                disabled={removing === item.id}
                aria-label={`Remove “${label(item)}” from Saved`}
                className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                {removing === item.id ? <Loader2Icon className="size-5 animate-spin" /> : <Trash2Icon className="size-5" />}
              </button>
            </li>
          );
        })}
      </ul>
      {limit ? (
        total > items.length && (
          <Link href="/saved" className="justify-self-start font-semibold text-brand-amber-text hover:underline">
            See all {total} saved
          </Link>
        )
      ) : (
        page < totalPages && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              load(page + 1)
                .catch((err: ApiError) => setError(err.message))
                .finally(() => setLoadingMore(false));
            }}
            className="inline-flex h-11 items-center justify-center gap-2 justify-self-center rounded-xl border bg-card px-5 font-semibold hover:bg-accent"
          >
            {loadingMore && <Loader2Icon className="size-4 animate-spin" />} Load more
          </button>
        )
      )}
    </div>
  );
}
