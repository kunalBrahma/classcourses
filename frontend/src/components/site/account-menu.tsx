"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CoinsIcon, LogOutIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiJson, logout } from "@/lib/api";
import { getAccessToken, subscribeAuth } from "@/lib/auth";

interface Me {
  id: string;
  email: string;
  name: string | null;
  coins: number;
  role: "STUDENT" | "ADMIN";
}

export const initials = (name: string | null, email: string) =>
  (name?.trim() || email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

// Logged-in state shared by every component (updates on sign-in/out in any tab).
export function useSignedIn() {
  return useSyncExternalStore(subscribeAuth, () => Boolean(getAccessToken()), () => false);
}

export function useMe() {
  const signedIn = useSignedIn();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    apiJson<{ user: Me }>("/api/auth/me")
      .then(({ user }) => !cancelled && setMe(user))
      .catch(() => !cancelled && setMe(null));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  return signedIn ? me : null;
}

export function AccountMenu() {
  const router = useRouter();
  const signedIn = useSignedIn();
  const me = useMe();

  if (!signedIn) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" className="h-10 px-3 font-semibold">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild className="press-3d h-10 rounded-xl px-4 font-semibold">
          <Link href="/register">Join free</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {me && (
        <span className="hidden items-center gap-1.5 rounded-full border border-warning/30 bg-brand-amber/15 px-3 py-1.5 text-sm font-semibold tabular-nums sm:inline-flex" title="Your coins">
          <CoinsIcon className="size-4 text-warning" /> {me.coins}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Your account">
            <Avatar className="size-10 rounded-xl">
              <AvatarFallback className="rounded-xl bg-primary font-semibold text-primary-foreground">
                {me ? initials(me.name, me.email) : "…"}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {me && (
            <>
              <DropdownMenuLabel className="font-normal">
                <span className="block font-semibold">{me.name || "Student"}</span>
                <span className="block truncate text-xs text-muted-foreground">{me.email}</span>
                <span className="mt-1.5 flex items-center gap-1.5 text-xs sm:hidden">
                  <CoinsIcon className="size-3.5 text-warning" /> {me.coins} coins
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              await logout();
              router.refresh();
            }}
          >
            <LogOutIcon /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
