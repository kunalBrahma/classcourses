"use client";

import Link from "next/link";
import { BookOpenIcon, FileTextIcon, HelpCircleIcon, HomeIcon, InfoIcon, MailIcon, NewspaperIcon, ScaleIcon, TimerIcon, VideoIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AccountPanel } from "@/components/site/account-menu";
import { ThemeRow } from "@/components/site/theme-toggle";
import { LogoMark } from "@/components/kit/logo-mark";
import type { PageLink } from "@/lib/server-api";

// Only pages and home sections that exist are linked (videos/news only when
// the admin has added some).
const mainLinks = (show: { videos: boolean; news: boolean }) => [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/#classes", label: "Choose your class", icon: BookOpenIcon },
  { href: "/#quiz", label: "Quizzes", icon: TimerIcon },
  { href: "/notes", label: "Notes", icon: FileTextIcon },
  ...(show.videos ? [{ href: "/#videos", label: "Videos", icon: VideoIcon }] : []),
  ...(show.news ? [{ href: "/#news", label: "Latest news", icon: NewspaperIcon }] : []),
];

const PAGE_ICONS: Record<string, typeof HomeIcon> = {
  about: InfoIcon,
  contact: MailIcon,
  faq: HelpCircleIcon,
  privacy: ScaleIcon,
  terms: ScaleIcon,
  "refund-policy": FileTextIcon,
};

export interface MenuProps {
  siteName: string;
  pages: PageLink[];
  show: { videos: boolean; news: boolean };
}

// Loaded on the first tap of the menu button (lazy-header.tsx).
export function MenuSheet({ siteName, pages, show, open, onOpenChange, returnFocus }: MenuProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => void;
}) {
  const close = () => onOpenChange(false);
  const item = "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold transition hover:bg-accent";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[86vw] max-w-sm gap-0 overflow-y-auto p-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-heading text-lg">
            <LogoMark className="size-8" /> {siteName}
          </SheetTitle>
          <SheetDescription className="sr-only">Site menu</SheetDescription>
        </SheetHeader>
        <nav aria-label="Menu" className="grid gap-0.5 px-3 py-3">
          {mainLinks(show).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={close} className={item}>
              <Icon className="size-5 text-brand-amber-text" aria-hidden="true" /> {label}
            </Link>
          ))}
          {pages.length > 0 && <p className="px-3 pb-1 pt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">About &amp; help</p>}
          {pages.map((p) => {
            const Icon = PAGE_ICONS[p.slug] ?? FileTextIcon;
            return (
              <Link key={p.slug} href={`/${p.slug}`} onClick={close} className={item}>
                <Icon className="size-5 text-brand-amber-text" aria-hidden="true" /> {p.title}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-3 border-t px-3 py-4">
          <ThemeRow />
          <div className="px-2">
            <AccountPanel onDone={close} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
