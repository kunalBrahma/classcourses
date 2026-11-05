"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GlobeIcon, SearchIcon } from "lucide-react";
import { headerIconButton } from "@/components/site/header-styles";
import type { MenuProps } from "@/components/site/menu-sheet";

// The header's search, language and menu panels use Radix (sheets, dropdown).
// They load on the first tap instead of with every page, which keeps the
// first page load small on phones. The buttons look the same either way.
const SearchSheet = dynamic(() => import("@/components/site/search-sheet").then((m) => m.SearchSheet), { ssr: false });
const MenuSheet = dynamic(() => import("@/components/site/menu-sheet").then((m) => m.MenuSheet), { ssr: false });
const LanguageSwitcher = dynamic(() => import("@/components/site/language-switcher").then((m) => m.LanguageSwitcher), {
  ssr: false,
  loading: () => <GlobeButton />,
});

function GlobeButton(props: { onClick?: () => void }) {
  return (
    <button type="button" className={headerIconButton} aria-label="Change language" aria-haspopup="menu" {...props}>
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

// Hidden during a quiz (globals.css): changing language reloads the page, and
// leaving a question on screen forfeits it.
export function LanguageButton() {
  const [loaded, setLoaded] = useState(false);
  return <span data-language-button className="contents">{loaded ? <LanguageSwitcher /> : <GlobeButton onClick={() => setLoaded(true)} />}</span>;
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
