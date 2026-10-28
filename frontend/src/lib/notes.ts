"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { apiJson } from "@/lib/api";
import { getAccessToken, subscribeAuth } from "@/lib/auth";

// Shapes from /api/notes and /api/payments (backend order.service.ts).
// A note unlocks ONLY on the server (verified payment, webhook, coins or an
// admin grant); this file never decides ownership itself.

export interface NotePlace {
  medium: { name: string; slug: string };
  classLevel: { name: string; slug: string };
  subject: { name: string; nativeName: string | null; slug: string };
  chapter: { number: number; title: string; slug: string } | null;
  href: string;
}

export interface NoteItem {
  id: string;
  title: string;
  description: string | null;
  pricePaise: number;
  isFree: boolean;
  place?: NotePlace | null;
}

export interface PriceQuote {
  listPricePaise: number;
  coinsUsed: number;
  discountPaise: number;
  amountPaise: number;
  coinBalance: number;
  maxDiscountPaise: number;
}

export interface OrderView {
  id: string;
  noteId: string;
  status: "CREATED" | "PAID" | "CANCELLED";
  amountPaise: number;
  coinsUsed: number;
}

export interface CheckoutOptions {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { email?: string; name?: string };
}

// ---- Which notes the student owns (one shared request, refreshed on purchase)

const OWNED_EVENT = "cc-notes";
let ownedCache: Promise<Set<string>> | null = null;

const fetchOwned = () => {
  ownedCache ??= apiJson<{ notes: { id: string }[] }>("/api/users/me/notes")
    .then(({ notes }) => new Set(notes.map((n) => n.id)))
    .catch(() => {
      ownedCache = null;
      return new Set<string>();
    });
  return ownedCache;
};

export const announceNotesChanged = () => {
  ownedCache = null;
  window.dispatchEvent(new Event(OWNED_EVENT));
};

export function useOwnedNotes() {
  const signedIn = useSyncExternalStore(subscribeAuth, () => Boolean(getAccessToken()), () => false);
  const [owned, setOwned] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = () => fetchOwned().then((set) => !cancelled && setOwned(set));
    load();
    window.addEventListener(OWNED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(OWNED_EVENT, load);
    };
  }, [signedIn]);
  return { signedIn, owned: signedIn ? owned : null };
}

// ---- Download: a short-lived signed link from the private bucket

export const downloadNote = async (noteId: string) => {
  const { url } = await apiJson<{ url: string }>(`/api/notes/${noteId}/download`);
  window.location.assign(url);
};

// ---- Razorpay Checkout (loaded only when a student pays)

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (r: { error?: { description?: string } }) => void) => void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let scriptPromise: Promise<RazorpayCtor> | null = null;
export const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  scriptPromise ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay didn't load")));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't open the payment window. Check your internet connection and try again."));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
};
