"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CoinsIcon, LogOutIcon, UserRoundIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { apiJson, logout } from "@/lib/api";
import { Coin3D } from "@/components/kit/coin";
import { getAccessToken, subscribeAuth } from "@/lib/auth";

export interface Me {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  coins: number;
  role: "STUDENT" | "ADMIN";
  // Profile asked at sign-up (6 Nov 2026). Google sign-ups and older accounts
  // fill it in at /welcome ("complete your profile").
  classLevel: { id: string; name: string; slug: string } | null;
  district: { id: string; name: string; nativeName: string | null } | null;
  dateOfBirth: string | null; // "YYYY-MM-DD"
  isMinor: boolean | null;
  profileComplete: boolean;
  missingProfile: ("classLevel" | "district" | "dateOfBirth")[];
  // Quizzes, coins and purchases need a date of birth, and a parent's consent
  // under 18 (backend consent.service.ts)
  access?: Access;
}

export interface Access {
  fullAccess: boolean;
  block: "NO_DATE_OF_BIRTH" | "CONSENT_REQUIRED" | null;
  consent: {
    required: boolean;
    status: "NONE" | "PENDING" | "GRANTED" | "DECLINED" | "WITHDRAWN";
    parentEmail: string | null;
    lastSentAt: string | null;
    expired: boolean;
    expiresAt?: string | null;
    decidedAt: string | null;
  };
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

// For pages that need a signed-in student (profile, quiz). Sends guests to
// sign in, and does it again the moment the student signs out anywhere: the
// header menu, a button on the page, or another tab. The token is read
// directly because useSignedIn() is still false on the first render.
export function useRequireSignIn() {
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = useSignedIn();
  useEffect(() => {
    if (!getAccessToken()) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [signedIn, pathname, router]);
  return signedIn;
}

// Fire after anything that changes the balance (a passed quiz, a purchase)
// so every coin display reloads.
const COINS_EVENT = "cc-coins";
// Every fresh /me answer is handed to every useMe() on the page, so a
// component mounted earlier (the root layout's consent banner, the header)
// never keeps an older copy than one mounted later.
const ME_EVENT = "cc-me";

// Several components read /me on one page (header, menu, profile gate…):
// calls within a few seconds share one request, unless something changed.
let shared: { token: string; at: number; promise: Promise<Me> } | null = null;
const SHARE_MS = 3000;
const fetchMe = () => {
  const token = getAccessToken() ?? "";
  if (shared && shared.token === token && Date.now() - shared.at < SHARE_MS) return shared.promise;
  const promise: Promise<Me> = apiJson<{ user: Me }>("/api/auth/me").then(({ user }) => {
    if (shared?.promise === promise) window.dispatchEvent(new CustomEvent<Me>(ME_EVENT, { detail: user }));
    return user;
  });
  shared = { token, at: Date.now(), promise };
  promise.catch(() => {
    if (shared?.promise === promise) shared = null;
  });
  return promise;
};

export const announceCoinsChanged = () => {
  shared = null;
  window.dispatchEvent(new Event(COINS_EVENT));
};
// After the student saves their details: everything re-reads /me.
export const announceProfileChanged = announceCoinsChanged;

export function useMe() {
  const signedIn = useSignedIn();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = () =>
      fetchMe()
        .then((user) => !cancelled && setMe(user))
        .catch(() => !cancelled && setMe(null));
    const onMe = (e: Event) => !cancelled && setMe((e as CustomEvent<Me>).detail);
    // Coming back to the tab re-reads /me: things change elsewhere (a parent
    // agrees from their own phone, an admin edits the account). Calls within
    // SHARE_MS share one request.
    const onVisible = () => document.visibilityState === "visible" && load();
    load();
    window.addEventListener(COINS_EVENT, load);
    window.addEventListener(ME_EVENT, onMe);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(COINS_EVENT, load);
      window.removeEventListener(ME_EVENT, onMe);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn]);
  return signedIn ? me : null;
}

// Header: the mock's coin chip (opens My profile) for students, or a
// "Sign in" pill for guests. Guests never see a made-up coin count.
export function AccountChip() {
  const signedIn = useSignedIn();
  const me = useMe();

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[13px] bg-white/35 text-sm font-bold text-brand-ink transition hover:bg-white/50 min-[420px]:px-3.5 dark:bg-white/10 dark:text-brand-cream"
      >
        <UserRoundIcon className="size-5 min-[420px]:hidden" aria-hidden="true" />
        <span className="sr-only min-[420px]:not-sr-only">Sign in</span>
      </Link>
    );
  }

  return (
    <Link
      href="/profile"
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[13px] bg-white/35 pl-1.5 pr-3 text-sm font-extrabold tabular-nums text-brand-ink transition hover:bg-white/50 dark:bg-white/10 dark:text-brand-cream"
      aria-label={me ? `My profile: ${me.coins} coins` : "My profile"}
      data-account="in"
    >
      <Coin3D className="size-7 text-xs" />
      <span translate="no" className="notranslate">{me ? me.coins : "…"}</span>
    </Link>
  );
}

// Menu sheet: who is signed in + sign out, or Sign in / Join free.
export function AccountPanel({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const signedIn = useSignedIn();
  const me = useMe();

  if (!signedIn) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-12 rounded-xl text-base font-semibold">
          <Link href="/login" onClick={onDone}>Sign in</Link>
        </Button>
        <Button asChild className="press-3d h-12 rounded-xl text-base font-bold">
          <Link href="/register" onClick={onDone}>Join free</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-11 rounded-xl">
        <AvatarFallback className="rounded-xl bg-primary font-semibold text-primary-foreground">{me ? initials(me.name, me.email) : "…"}</AvatarFallback>
      </Avatar>
      <Link href="/profile" onClick={onDone} className="min-w-0 flex-1 rounded-lg hover:underline">
        <span className="block truncate font-semibold">{me?.name || "Student"}</span>
        {me && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <CoinsIcon className="size-3.5 text-brand-amber-text" /> {me.coins} coins · My profile
          </span>
        )}
      </Link>
      <Button
        variant="ghost"
        className="h-11 px-3 text-destructive hover:text-destructive"
        onClick={async () => {
          await logout();
          onDone?.();
          router.refresh();
        }}
      >
        <LogOutIcon /> Sign out
      </Button>
    </div>
  );
}
