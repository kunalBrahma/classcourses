import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRightIcon } from "lucide-react";

// The mock's section heading ("📝 Quizzes"): a small icon inline with an amber
// title. SVG icons instead of emoji (emoji differ on every phone).
export function SectionTitle({ icon: Icon, children, action }: {
  icon: LucideIcon;
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-5 shrink-0 text-brand-amber-text" aria-hidden="true" />
      <h2 className="font-heading text-xl font-extrabold tracking-tight text-brand-amber-text">{children}</h2>
      {action && (
        <Link
          href={action.href}
          className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-brand-amber-text hover:underline"
        >
          {action.label} <ChevronRightIcon className="size-4" />
        </Link>
      )}
    </div>
  );
}
