import { cn } from "@/lib/utils";

// The "C" mark from the client's logo (public/logo.webp has the mark on an
// opaque amber box, so it can't sit on the header gradient). Inline SVG keeps
// it sharp at any size.
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg bg-brand-amber shadow-[inset_0_2px_3px_rgb(255_255_255/0.5),0_3px_0_var(--brand-amber-dark),0_6px_12px_-4px_rgb(0_0_0/0.3)]",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]">
        <path d="M12 12 L17.36 16.5 A7 7 0 1 1 17.36 7.5 Z" fill="#fff" />
      </svg>
    </span>
  );
}
