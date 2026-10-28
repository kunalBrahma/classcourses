import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { catalogHref, isPlaceholderTitle } from "@/lib/catalog";
import type { NeighbourChapter } from "@/lib/server-api";
import { cn } from "@/lib/utils";

// MANDATORY on every chapter page: Previous / Next follow the subject's
// reading order across parts; disabled on the first / last chapter.
export function PrevNext({ base, prev, next }: { base: string[]; prev: NeighbourChapter | null; next: NeighbourChapter | null }) {
  return (
    <nav aria-label="Chapters" className="mt-10 grid grid-cols-2 gap-3">
      <Step direction="prev" base={base} chapter={prev} />
      <Step direction="next" base={base} chapter={next} />
    </nav>
  );
}

function Step({ direction, base, chapter }: { direction: "prev" | "next"; base: string[]; chapter: NeighbourChapter | null }) {
  const isNext = direction === "next";
  const label = isNext ? "Next" : "Previous";
  const Icon = isNext ? ArrowRightIcon : ArrowLeftIcon;
  const box = cn("flex min-h-16 items-center gap-2 rounded-xl px-4 py-3", isNext ? "flex-row-reverse text-right" : "text-left");

  if (!chapter) {
    return (
      <span aria-disabled="true" className={cn(box, "cursor-not-allowed border border-dashed text-muted-foreground opacity-70")}>
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span className="font-semibold">{isNext ? "Last chapter" : "First chapter"}</span>
      </span>
    );
  }

  return (
    <Link href={catalogHref(...base, chapter.slug)} rel={isNext ? "next" : "prev"} className={cn(box, isNext ? "press-3d" : "card-3d lift")}>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-heading font-extrabold">
          {label}
          <span className="hidden sm:inline"> chapter</span>
        </span>
        <span className="block truncate text-sm opacity-80" lang="as">
          {chapter.number}. {isPlaceholderTitle(chapter.number, chapter.title) ? `Chapter ${chapter.number}` : chapter.title}
        </span>
      </span>
    </Link>
  );
}
