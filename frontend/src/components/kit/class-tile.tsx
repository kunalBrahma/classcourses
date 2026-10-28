import Link from "next/link";
import { cn } from "@/lib/utils";

// Book colours from the mock, cycled by position so neighbouring classes differ.
const BOOK_COLOURS: [string, string][] = [
  ["#f5a623", "#c9780c"],
  ["#ff8a3d", "#c9780c"],
  ["#f5a623", "#8a5a00"],
  ["#ffbe4d", "#c9780c"],
  ["#f5a623", "#d98a0f"],
  ["#ff9e2c", "#8a5a00"],
  ["#ffbe4d", "#8a5a00"],
  ["#c9780c", "#6b4400"],
];

export function BookIcon({ index, className }: { index: number; className?: string }) {
  const [from, to] = BOOK_COLOURS[index % BOOK_COLOURS.length];
  const id = `cc-book-${index}`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path d="M8 10c0-2 2-3 4-3h12v30H12c-2 0-4-1-4-3z" fill={`url(#${id})`} />
      <path d="M24 7h12c2 0 4 1 4 3v24c0 2-2 3-4 3H24z" fill={to} opacity=".85" />
      <rect x="22" y="7" width="4" height="30" fill="#fff" opacity=".5" />
    </svg>
  );
}

// A class in the "Choose your class" grid: book icon + name (+ Assamese name).
export function ClassTile({ href, name, nativeName, index, className }: {
  href: string;
  name: string;
  nativeName?: string | null;
  index: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("card-3d lift flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-3.5 text-center", className)}
    >
      <BookIcon index={index} className="size-8" />
      <span className="font-heading text-[13px] font-extrabold leading-tight text-brand-amber-text">{name}</span>
      {nativeName && (
        <span lang="as" className="text-xs leading-tight text-muted-foreground">
          {nativeName}
        </span>
      )}
    </Link>
  );
}
