import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export interface Crumb {
  label: string;
  href: string;
}

// "Home › Assamese Medium › Class 5". On phones only the step back is shown
// ("‹ Class 5"), like the mock's "← Back to …" bar.
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const parent = items[items.length - 1];
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <Link
        href={parent.href}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg pr-2 font-semibold text-brand-amber-text hover:underline sm:hidden"
      >
        <ChevronLeftIcon className="size-5" aria-hidden="true" /> {parent.label}
      </Link>
      <ol className="hidden flex-wrap items-center gap-1 text-sm text-muted-foreground sm:flex">
        {items.map((c) => (
          <li key={c.href} className="flex items-center gap-1">
            <Link href={c.href} className="inline-flex min-h-9 items-center rounded px-0.5 font-medium text-brand-amber-text hover:underline">
              {c.label}
            </Link>
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </li>
        ))}
      </ol>
    </nav>
  );
}
