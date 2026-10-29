import Link from "next/link";
import { LogoMark } from "@/components/kit/logo-mark";
import { cn } from "@/lib/utils";

// The client's landscape logo (white mark + "Class Course", public/brand/logo.webp;
// the editable SVG is beside it). It sits on the amber/brown header and footer.
// `nameClassName` hides it where there's no room; `markClassName` shows the
// square mark instead under the same conditions.
export function Logo({ className, name = "Class Course", nameClassName, markClassName }: { className?: string; name?: string; nameClassName?: string; markClassName?: string }) {
  return (
    <Link href="/" className={cn("group flex shrink-0 items-center rounded-xl", className)} aria-label={`${name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand image, sized by its attributes */}
      <img
        src="/brand/logo.webp"
        alt=""
        width={375}
        height={84}
        fetchPriority="high"
        className={cn("h-8 w-auto sm:h-9 drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)] transition group-active:translate-y-0.5", nameClassName)}
      />
      <LogoMark className={cn("hidden", markClassName)} />
    </Link>
  );
}
