"use client";

import { useRouter } from "next/navigation";
import { setMediumCookie } from "@/lib/medium";
import type { Medium } from "@/lib/server-api";
import { cn } from "@/lib/utils";

// Small medium switch above the class grid (same cookie as the header 🌐).
export function MediumTabs({ mediums, current }: { mediums: Medium[]; current: string }) {
  const router = useRouter();
  if (mediums.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Medium" className="mb-3 flex flex-wrap gap-2">
      {mediums.map((m) => {
        const active = m.slug === current;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              setMediumCookie(m.slug);
              router.refresh();
            }}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition",
              active ? "press-3d border-transparent" : "bg-card hover:bg-accent"
            )}
          >
            {m.name}
          </button>
        );
      })}
    </div>
  );
}
