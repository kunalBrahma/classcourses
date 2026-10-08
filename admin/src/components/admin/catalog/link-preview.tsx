"use client";

import { useState } from "react";
import { LinkIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputClass } from "@/components/admin/styles";
import { siteHost } from "@/lib/site";
import { cn } from "@/lib/utils";

// Shows the student-site link an item will have. Links are made from the name
// automatically; "Change link" is tucked away for the rare typo fix.
//
// value: the link part the item will get ("" = the server picks one, e.g. for
// a name written only in Assamese). custom: the admin typed it by hand.
export function LinkPreview({
  id,
  prefix,
  value,
  editing,
  custom,
  onCustom,
}: {
  id: string;
  prefix: string; // "/assamese-medium/class-5/" — everything before this item's part
  value: string;
  editing: boolean; // editing an existing item (its link is already live)
  custom: boolean;
  onCustom?: (slug: string | null) => void; // null = back to automatic; omit to hide "Change link"
}) {
  const [open, setOpen] = useState(custom);

  return (
    <div className="grid gap-2 rounded-xl border bg-muted/40 px-4 py-3">
      <div className="flex items-start gap-3">
        <LinkIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">Link on the student site</p>
          <p className="mt-0.5 break-all text-sm" id={`${id}-preview`}>
            <span className="text-muted-foreground">{siteHost}{prefix}</span>
            {value ? <span className="font-semibold text-foreground">{value}</span> : <span className="italic text-muted-foreground">made automatically</span>}
          </p>
          {!open && (
            <p className="mt-1 text-xs text-muted-foreground">
              {editing ? "Stays the same when you rename, so saved and shared links keep working." : "Made from the name — nothing to fill in."}
            </p>
          )}
        </div>
        {onCustom && !open && (
          <Button type="button" variant="link" className="h-auto shrink-0 p-0 text-xs" onClick={() => setOpen(true)}>
            Change link
          </Button>
        )}
      </div>

      {onCustom && open && (
        <div className="grid gap-2">
          <label htmlFor={id} className="sr-only">
            Link
          </label>
          <Input
            id={id}
            className={cn(inputClass, "bg-background")}
            value={value}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Use lowercase letters (a–z), numbers and single hyphens, e.g. general-science"
            placeholder="e.g. general-science"
            aria-describedby={`${id}-preview ${id}-warn`}
            onChange={(e) => onCustom(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          />
          <p id={`${id}-warn`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Use lowercase letters, numbers and hyphens.
              {editing && " Changing it breaks links students may have saved or shared."}
            </span>
          </p>
          <Button
            type="button"
            variant="link"
            className="h-auto justify-self-start p-0 text-xs"
            onClick={() => {
              setOpen(false);
              onCustom(null);
            }}
          >
            {editing ? "Keep the current link" : "Make it automatically"}
          </Button>
        </div>
      )}
    </div>
  );
}
