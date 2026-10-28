import Link from "next/link";
import { LogoMark } from "@/components/kit/logo-mark";
import { cn } from "@/lib/utils";

export function Logo({ className, name = "Class Course", nameClassName }: { className?: string; name?: string; nameClassName?: string }) {
  return (
    <Link href="/" className={cn("group flex shrink-0 items-center gap-2 rounded-xl", className)} aria-label={`${name} home`}>
      <LogoMark className="transition group-active:translate-y-0.5" />
      <span className={cn("font-heading text-[17px] font-extrabold tracking-tight", nameClassName)}>{name}</span>
    </Link>
  );
}
