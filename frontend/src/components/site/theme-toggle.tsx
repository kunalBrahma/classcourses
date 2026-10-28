"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

// Menu row: "Dark mode" with a switch-like button.
export function ThemeRow() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-semibold hover:bg-accent"
    >
      {dark ? <MoonIcon className="size-5 text-brand-amber-text" /> : <SunIcon className="size-5 text-brand-amber-text" />}
      <span className="flex-1">Dark mode</span>
      <span className={`relative h-6 w-11 rounded-full transition ${dark ? "bg-primary" : "bg-input"}`} aria-hidden="true">
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${dark ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Only known after mount (next-themes reads the device setting).
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-10 rounded-xl"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </Button>
  );
}
