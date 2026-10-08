import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, name = "Class Course" }: { className?: string; name?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5 rounded-xl", className)} aria-label={`${name} home`}>
      <span className="grid size-9 place-items-center rounded-xl bg-brand-amber font-heading text-sm font-extrabold text-brand-navy shadow-[0_3px_0_#b45309] transition group-active:translate-y-0.5 group-active:shadow-[0_1px_0_#b45309]">
        CC
      </span>
      <span className="font-heading text-lg font-bold tracking-tight">{name}</span>
    </Link>
  );
}
