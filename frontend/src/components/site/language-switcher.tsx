"use client";

import { useSyncExternalStore } from "react";
import { CheckIcon, GlobeIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { headerIconButton } from "@/components/site/header-styles";
import { LANGUAGES, changeLanguage, readLanguage } from "@/lib/language";

// Changing language reloads the page, so nothing needs to subscribe.
const subscribeNothing = () => () => undefined;

// 🌐: the site's language. Loaded on the first tap (lazy-header.tsx), so it opens
// straight away. Kept out of translation so each language stays readable by its speakers.
export function LanguageSwitcher() {
  const current = useSyncExternalStore(subscribeNothing, readLanguage, () => "en");

  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <button type="button" className={headerIconButton} aria-label="Change language">
          <GlobeIcon className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="notranslate min-w-52" translate="no">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Language</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.code}
            className="min-h-11"
            onSelect={() => {
              if (language.code !== current) changeLanguage(language.code);
            }}
          >
            <span className="flex-1">
              <span className="block font-semibold" lang={language.code}>{language.name}</span>
              {language.english && <span className="block text-xs text-muted-foreground">{language.english}</span>}
            </span>
            {current === language.code && <CheckIcon className="size-4 text-brand-amber-text" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">Translated by Google, so some words may be wrong. Lessons and quizzes stay as written.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
