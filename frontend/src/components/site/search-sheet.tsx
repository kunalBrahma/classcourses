"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { BookOpenIcon, FileTextIcon, GraduationCapIcon, LanguagesIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ApiError, publicJson } from "@/lib/api";

type ResultType = "medium" | "class" | "subject" | "chapter";
interface SearchResult {
  type: ResultType;
  label: string;
  nativeLabel: string | null;
  context: string;
  href: string;
}

const ICONS: Record<ResultType, typeof SearchIcon> = {
  medium: LanguagesIcon,
  class: GraduationCapIcon,
  subject: BookOpenIcon,
  chapter: FileTextIcon,
};

type State = { q: string; results: SearchResult[] | null; error: string | null };

// Header search: subjects and chapters by English or Assamese name
// (GET /api/catalog/search). Searches as you type, after a short pause.
// Loaded on the first tap of the header button (lazy-header.tsx).
export function SearchSheet({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus: () => void }) {
  const id = useId();
  const setOpen = onOpenChange;
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ q: "", results: null, error: null });
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      publicJson<{ results: SearchResult[] }>(`/api/catalog/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(({ results }) => setState({ q, results, error: null }))
        .catch((err: ApiError) => {
          if (!controller.signal.aborted) setState({ q, results: null, error: err.message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // Only show what belongs to the text in the box (no flash of old results).
  const current = q.length >= 2 && state.q === q ? state : null;
  const loading = q.length >= 2 && !current;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <SheetContent
        side="top"
        className="max-h-[85dvh] gap-0 rounded-b-3xl px-0 pb-4"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <SheetHeader className="px-4 pb-2 sm:px-6">
          <SheetTitle className="font-heading text-lg">Search</SheetTitle>
          <SheetDescription>Find a subject or chapter, in English or অসমীয়া.</SheetDescription>
        </SheetHeader>
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <label htmlFor={`${id}-q`} className="sr-only">
            Subject or chapter
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id={`${id}-q`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subject, chapter…"
              className="h-12 rounded-2xl pl-11 text-base [&::-webkit-search-cancel-button]:appearance-none"
              autoComplete="off"
              enterKeyHint="search"
              autoFocus
              maxLength={60}
            />
            {loading && <Loader2Icon className="absolute right-3.5 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
          </div>

          <div className="mt-3 max-h-[55dvh] overflow-y-auto" aria-live="polite">
            {q.length === 1 && <p className="px-1 py-3 text-sm text-muted-foreground">Type one more letter…</p>}
            {current?.error && <p className="px-1 py-3 text-sm text-destructive">{current.error}</p>}
            {current?.results?.length === 0 && (
              <p className="px-1 py-3 text-sm text-muted-foreground">Nothing found for “{q}”. Try another word.</p>
            )}
            {current?.results && current.results.length > 0 && (
              <ul className="grid gap-1.5">
                {current.results.map((r) => {
                  const Icon = ICONS[r.type];
                  return (
                    <li key={`${r.type}:${r.href}`}>
                      <Link
                        href={r.href}
                        onClick={() => setOpen(false)}
                        className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-accent focus-visible:bg-accent"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-brand-amber-text" aria-hidden="true">
                          <Icon className="size-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">
                            {r.label}
                            {r.nativeLabel && (
                              <span lang="as" className="ml-2 font-normal text-muted-foreground">
                                {r.nativeLabel}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-sm text-muted-foreground">{r.context}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
