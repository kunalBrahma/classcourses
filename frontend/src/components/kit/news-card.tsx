import { ArrowUpRightIcon } from "lucide-react";

// An external news link (admin-managed, /api/content/news). Opens in a new tab.
export function NewsCard({ source, title, url }: { source: string; title: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="card-3d lift flex w-52 flex-col rounded-[15px] border-t-4 border-t-brand-amber p-3.5"
    >
      <span className="text-xs font-extrabold uppercase tracking-wide text-brand-amber-text">{source}</span>
      <span className="mt-1.5 mb-3 line-clamp-3 font-semibold leading-snug" lang="as">
        {title}
      </span>
      <span className="press-3d mt-auto inline-flex h-9 w-fit items-center gap-1 rounded-[12px] px-3 text-sm font-bold">
        Read More <ArrowUpRightIcon className="size-4" aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </span>
    </a>
  );
}
