import { cn } from "@/lib/utils";

export const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// A note in the mock's style: name, where it belongs, FREE/PREMIUM badge,
// price, and an action slot (Download / Pay — wired up in the notes phase).
// Prices always come from the server (the quote endpoint for coin discounts).
export function NoteCard({ title, subtitle, isFree, pricePaise, finalPaise, children, className }: {
  title: string;
  subtitle?: React.ReactNode;
  isFree: boolean;
  pricePaise: number;
  /** Server-quoted price after a coin discount; shows the original struck through. */
  finalPaise?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const discounted = finalPaise !== undefined && finalPaise < pricePaise;
  return (
    <article className={cn("card-3d rounded-xl p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug" lang="as">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1 text-xs font-extrabold tracking-wide",
            isFree ? "bg-success/12 text-success" : "bg-accent text-brand-amber-text"
          )}
        >
          {isFree ? "FREE" : "PREMIUM"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="font-heading text-lg font-extrabold tabular-nums">
          {isFree ? (
            rupees(0)
          ) : discounted ? (
            <>
              <span className="mr-1.5 text-sm font-semibold text-muted-foreground line-through">{rupees(pricePaise)}</span>
              {rupees(finalPaise)}
            </>
          ) : (
            rupees(pricePaise)
          )}
        </p>
        {children && <div className="flex flex-1 flex-wrap items-center justify-end gap-2">{children}</div>}
      </div>
    </article>
  );
}
