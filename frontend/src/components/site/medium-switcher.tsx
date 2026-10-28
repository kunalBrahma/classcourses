"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, GlobeIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { readMediumCookie, setMediumCookie, subscribeMedium } from "@/lib/medium";
import type { Medium } from "@/lib/server-api";
import { headerIconButton } from "@/components/site/header-styles";

// 🌐 in the mock: picks the MEDIUM (Assamese / English …, from the database),
// not a translated website (client question #34). Remembered in a cookie.
// Loaded on the first tap (lazy-header.tsx), so it opens straight away.
export function MediumSwitcher({ mediums }: { mediums: Medium[] }) {
  const router = useRouter();
  const current = useSyncExternalStore(subscribeMedium, readMediumCookie, () => null);

  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <button type="button" className={headerIconButton} aria-label="Choose your medium">
          <GlobeIcon className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Your medium</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mediums.map((m) => (
          <DropdownMenuItem
            key={m.id}
            className="min-h-11"
            onSelect={() => {
              setMediumCookie(m.slug);
              router.refresh();
            }}
          >
            <span className="flex-1">
              <span className="block font-semibold">{m.name}</span>
              {m.nativeName && (
                <span lang="as" className="block text-xs text-muted-foreground">
                  {m.nativeName}
                </span>
              )}
            </span>
            {current === m.slug && <CheckIcon className="size-4 text-brand-amber-text" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
