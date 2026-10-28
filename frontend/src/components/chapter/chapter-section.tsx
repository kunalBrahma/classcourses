import type { LucideIcon } from "lucide-react";

// One chapter section (About, Textbook Q&A, …): anchor target for the jump bar.
export function ChapterSection({ id, icon: Icon, title, hint, count, children }: {
  id: string;
  icon: LucideIcon;
  title: string;
  hint?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-amber-text shadow-[0_2px_0_var(--depth-edge)]" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-heading text-xl font-extrabold tracking-tight text-brand-amber-text sm:text-2xl">
            {title}
            {count !== undefined && <span className="ml-2 text-base font-bold text-muted-foreground tabular-nums">{count}</span>}
          </h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
