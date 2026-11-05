"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { readMediumCookie, setMediumCookie, subscribeMedium } from "@/lib/medium";
import type { Medium } from "@/lib/server-api";

// The student's medium (Assamese / English …, from the database), in the menu.
// Remembered in a cookie, the same one as the tabs above the home page's classes.
// This is what they study in; the 🌐 button is the language of the site around it.
export function MediumRows({ mediums, onDone }: { mediums: Medium[]; onDone: () => void }) {
  const router = useRouter();
  const current = useSyncExternalStore(subscribeMedium, readMediumCookie, () => null);
  if (mediums.length < 2) return null;

  return (
    <div className="grid gap-0.5">
      <p className="px-3 pb-1 pt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Your medium</p>
      {mediums.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={current === m.slug}
          onClick={() => {
            setMediumCookie(m.slug);
            router.refresh();
            onDone();
          }}
          className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left transition hover:bg-accent"
        >
          <span className="flex-1">
            <span className="block text-base font-semibold">{m.name}</span>
            {m.nativeName && (
              <span lang="as" className="block text-xs text-muted-foreground">
                {m.nativeName}
              </span>
            )}
          </span>
          {current === m.slug && <CheckIcon className="size-5 text-brand-amber-text" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
