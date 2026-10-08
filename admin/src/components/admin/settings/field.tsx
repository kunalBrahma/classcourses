"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Label + control + hint, with the hint wired to the control for screen readers.
export function Field({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
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
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hasHint?: boolean;
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
        autoComplete="new-password"
        autoCapitalize="none"
        spellCheck={false}
        aria-describedby={hasHint ? `${id}-hint` : undefined}
        className="h-10 pr-11 font-mono text-sm"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide secret" : "Show secret"}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-0.5 right-0.5 grid w-9 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}
