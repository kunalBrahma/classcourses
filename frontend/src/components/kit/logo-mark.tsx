import { cn } from "@/lib/utils";

// The client's square mark (white C on amber, public/brand/logo-mark.webp),
// for places without room for the full logo or on light surfaces where the
// white landscape logo wouldn't show.
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static brand image
    <img
      src="/brand/logo-mark.webp"
      alt=""
      aria-hidden="true"
      width={64}
      height={64}
      className={cn("size-9 shrink-0 rounded-lg shadow-[0_3px_0_var(--brand-amber-dark),0_6px_12px_-4px_rgb(0_0_0/0.3)]", className)}
    />
  );
}
