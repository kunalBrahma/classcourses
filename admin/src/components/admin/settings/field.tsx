"use client";

import { useState } from "react";
import { CircleAlertIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Label + control + hint, with the hint wired to the control for screen readers.
// `error`: shown in red under the control (id `${id}-error`; point the control's
// aria-describedby at it and set aria-invalid).
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // content-start: in two-column rows, a hint under one field mustn't push the other's label down.
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

// Secret input with the same show/hide toggle as the login page.
// Leaving it empty keeps the stored secret (backend rule).
export function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  hasHint,
  autoComplete = "new-password",
  label = "secret",
  invalid = false,
  describedBy,
  mono = true,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hasHint?: boolean;
  autoComplete?: string;
  // What the show/hide button names ("Show secret", "Show password")
  label?: string;
  // Red border + aria-invalid (pair with Field's `error`)
  invalid?: boolean;
  // Overrides the default `${id}-hint` link (e.g. "hint and error")
  describedBy?: string;
  mono?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        aria-describedby={describedBy ?? (hasHint ? `${id}-hint` : undefined)}
        aria-invalid={invalid || undefined}
        className={cn("h-10 pr-11 text-sm", mono && "font-mono")}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-0.5 right-0.5 grid w-9 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}
