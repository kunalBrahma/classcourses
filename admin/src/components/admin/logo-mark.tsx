import { cn } from "@/lib/utils";

// The client's square mark (white C on amber, public/brand/logo-mark.webp),
// the same file as the student site's.
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

// The client's landscape logo (white, for the dark sidebar and login panel).
export function LogoFull({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand image, sized by its attributes
    <img src="/brand/logo.webp" alt="Class Course" width={375} height={84} className={cn("h-7 w-auto", className)} />
  );
}
