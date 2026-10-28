"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GlobeIcon, SearchIcon } from "lucide-react";
import { headerIconButton } from "@/components/site/header-styles";
import type { MenuProps } from "@/components/site/menu-sheet";
import type { Medium } from "@/lib/server-api";

// The header's search, medium and menu panels use Radix (sheets, dropdown).
// They load on the first tap instead of with every page, which keeps the
// first page load small on phones. The buttons look the same either way.
const SearchSheet = dynamic(() => import("@/components/site/search-sheet").then((m) => m.SearchSheet), { ssr: false });
const MenuSheet = dynamic(() => import("@/components/site/menu-sheet").then((m) => m.MenuSheet), { ssr: false });
const MediumSwitcher = dynamic(() => import("@/components/site/medium-switcher").then((m) => m.MediumSwitcher), {
  ssr: false,
  loading: () => <GlobeButton />,
});

function GlobeButton(props: { onClick?: () => void }) {
  return (
    <button type="button" className={headerIconButton} aria-label="Choose your medium" aria-haspopup="menu" {...props}>
      <GlobeIcon className="size-5" />
    </button>
  );
}

export function SearchButton() {
  const button = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={headerIconButton}
        aria-label="Search subjects and chapters"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        <SearchIcon className="size-5" />
      </button>
      {loaded && <SearchSheet open={open} onOpenChange={setOpen} returnFocus={() => button.current?.focus()} />}
    </>
  );
}

export function MediumButton({ mediums }: { mediums: Medium[] }) {
  const [loaded, setLoaded] = useState(false);
  if (mediums.length < 2) return null;
  return loaded ? <MediumSwitcher mediums={mediums} /> : <GlobeButton onClick={() => setLoaded(true)} />;
}

export function MenuButton(props: MenuProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/35 transition hover:bg-white/50 dark:bg-white/10"
      >
        <span className="grid w-4.5 gap-[3px]" aria-hidden="true">
          <span className="h-[2.5px] rounded-full bg-brand-ink dark:bg-brand-cream" />
          <span className="h-[2.5px] rounded-full bg-brand-ink dark:bg-brand-cream" />
          <span className="h-[2.5px] rounded-full bg-brand-ink dark:bg-brand-cream" />
        </span>
      </button>
      {loaded && <MenuSheet {...props} open={open} onOpenChange={setOpen} returnFocus={() => button.current?.focus()} />}
    </>
  );
}
