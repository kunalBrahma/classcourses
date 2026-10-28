import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { catalogHref, isPlaceholderTitle } from "@/lib/catalog";
import type { ChapterGroup } from "@/lib/server-api";
import { cn } from "@/lib/utils";

// Chapters in reading order, grouped by part ("Part 1", "Writing Skills"…).
// `compact` is the version inside a subject's dropdown on the class page.
export function ChapterList({ groups, base, compact = false }: { groups: ChapterGroup[]; base: string[]; compact?: boolean }) {
  return (
    <div className={cn("grid", compact ? "gap-3" : "gap-6")}>
      {groups.map((g) => (
        <section key={g.part?.id ?? "no-part"} aria-label={g.part?.title ?? "Chapters"}>
          {g.part && (
            <h3 className={cn("mb-2 font-heading font-bold text-brand-amber-text", compact ? "text-sm uppercase tracking-wide" : "text-lg")} lang="as">
              {g.part.title}
            </h3>
          )}
          <ol className={cn("grid", compact ? "gap-1" : "gap-2.5 md:grid-cols-2")}>
            {g.chapters.map((c) => (
              <li key={c.id}>
                <Link
                  href={catalogHref(...base, c.slug)}
                  className={cn(
                    "group flex items-center gap-3 font-medium",
                    compact ? "min-h-12 rounded-xl px-2 hover:bg-accent" : "card-3d lift min-h-16 rounded-xl px-4 py-3"
                  )}
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent font-heading text-sm font-extrabold tabular-nums text-brand-amber-text shadow-[0_2px_0_var(--depth-edge)]"
                    aria-hidden="true"
                  >
                    {c.number}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug" lang="as">
                    {isPlaceholderTitle(c.number, c.title) ? `Chapter ${c.number}` : c.title}
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-brand-amber-text transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
