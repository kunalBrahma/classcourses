"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlertIcon } from "lucide-react";
import { useMe } from "@/components/site/account-menu";

// Signed-in students under 18 still waiting for a parent: one line on every
// page saying why quizzes and buying are off, and where to sort it out.
export function ConsentBanner() {
  const me = useMe();
  const pathname = usePathname();
  if (!me?.access || me.access.block !== "CONSENT_REQUIRED" || pathname.startsWith("/parent-consent") || pathname.startsWith("/consent")) return null;
  const status = me.access.consent.status;
  const text =
    status === "PENDING" && !me.access.consent.expired
      ? "Waiting for your parent or guardian to agree. Until then, quizzes and buying notes are off."
      : status === "DECLINED" || status === "WITHDRAWN"
        ? "Your parent or guardian hasn't given permission, so quizzes and buying notes are off."
        : "A parent or guardian needs to agree before you can take quizzes or buy notes.";
  return (
    <div role="status" className="border-b bg-accent">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-6 lg:px-8">
        <ShieldAlertIcon className="size-4 shrink-0 text-brand-amber-text" aria-hidden="true" />
        <span className="min-w-0 flex-1">{text}</span>
        <Link href="/parent-consent" className="inline-flex min-h-11 items-center font-semibold text-brand-amber-text hover:underline">
          {status === "PENDING" && !me.access.consent.expired ? "See status" : "Ask a parent"}
        </Link>
      </div>
    </div>
  );
}
