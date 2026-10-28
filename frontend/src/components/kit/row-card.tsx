import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A full-width tappable row (subject, chapter, …) with a › on the right.
export function RowCard({ href, title, nativeTitle, subtitle, leading, className }: {
  href: string;
  title: string;
  nativeTitle?: string | null;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("card-3d lift group flex min-h-16 items-center gap-3 rounded-xl px-4 py-3", className)}>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {nativeTitle && (
          <span lang="as" className="as-text block leading-snug text-muted-foreground">
            {nativeTitle}
          </span>
        )}
        {subtitle && <span className="mt-0.5 block text-sm text-muted-foreground">{subtitle}</span>}
      </span>
      <ChevronRightIcon className="size-5 shrink-0 text-brand-amber-text transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
