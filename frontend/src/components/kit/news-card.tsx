import { ArrowUpRightIcon, NewspaperIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// An external news link (admin-managed, /api/content/news). Opens in a new tab.
// Picture on top (the admin's upload, or a branded panel when there is none),
// then source, headline and "Read more". Fixed width in a sideways row; pass
// `fluid` to fill a grid cell.
export function NewsCard({ source, title, url, imageUrl, fluid, className }: {
  source: string;
  title: string;
  url: string;
  imageUrl?: string | null;
  fluid?: boolean;
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("card-3d lift group flex flex-col overflow-hidden rounded-[15px] p-0", !fluid && "w-64 sm:w-72", className)}
    >
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-brand-amber to-brand-amber-text">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin upload on the public bucket
          <img src={imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
            <span className="grid size-14 place-items-center rounded-2xl bg-white/15 text-white backdrop-blur-sm">
              <NewspaperIcon className="size-7" />
            </span>
          </span>
        )}
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-brand-amber px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-brand-ink shadow-sm">
          {source}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <span className="line-clamp-3 font-semibold leading-snug" lang="as">
          {title}
        </span>
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-brand-amber-text">
          Read more <ArrowUpRightIcon className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
          <span className="sr-only">on {source} (opens in a new tab)</span>
        </span>
      </div>
    </a>
  );
}
