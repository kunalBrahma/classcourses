"use client";

import type { Editor } from "@tiptap/react";
import { BracesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TOKENS } from "@/lib/pages";

// Inserts a {{token}} at the cursor. Tokens are replaced with live settings
// when the page is shown, so text like "10 seconds" never goes out of date.
export function TokenMenu({ editor, values }: { editor: Editor; values?: Record<string, string> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onMouseDown={(e) => e.preventDefault()}>
          <BracesIcon className="size-4" /> Insert value
        </Button>
      </DropdownMenuTrigger>
      {/* Radix returns focus to the trigger on close; keep the cursor in the editor so typing continues there. */}
      <DropdownMenuContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Filled in from your settings when students view the page</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TOKENS.map((t) => (
          <DropdownMenuItem key={t.name} onSelect={() => editor.chain().focus().insertContent(`{{${t.name}}}`).run()} className="flex justify-between gap-3">
            <span>{t.label}</span>
            {values?.[t.name] && <span className="truncate text-xs text-muted-foreground">{values[t.name]}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
