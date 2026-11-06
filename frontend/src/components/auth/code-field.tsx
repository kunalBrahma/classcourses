"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A 6-digit code box (digits only; the phone offers the emailed code).
export function CodeField({ id, value, onChange, label = "6-digit code" }: { id: string; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="••••••"
        className="h-14 rounded-xl text-center font-mono text-2xl tracking-[0.5em] tabular-nums"
      />
    </div>
  );
}

// Seconds until "Send a new code" is allowed again (the server allows one a minute).
export function useCountdown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}
