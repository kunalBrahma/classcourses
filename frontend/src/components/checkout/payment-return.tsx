"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2Icon, Clock3Icon, Loader2Icon, XCircleIcon } from "lucide-react";
import { announceCoinsChanged, useRequireSignIn } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { announceNotesChanged } from "@/lib/notes";
import { getAccessToken } from "@/lib/auth";

type State = { kind: "checking" } | { kind: "paid"; refunded: boolean } | { kind: "failed"; message: string } | { kind: "waiting" } | { kind: "missing" };

const TRIES = 40; // about two minutes
const EVERY_MS = 3000;

export function PaymentReturn() {
  const orderId = useSearchParams().get("order_id");
  useRequireSignIn();
  const [state, setState] = useState<State>(orderId ? { kind: "checking" } : { kind: "missing" });

  useEffect(() => {
    if (!orderId || !getAccessToken()) return;
    let tries = 0;
    let stopped = false;
    const check = async () => {
      tries += 1;
      try {
        const res = await apiJson<{ status: "PAID" | "PENDING" | "REFUNDED" }>("/api/payments/verify", { method: "POST", json: { orderId } });
        if (stopped) return;
        if (res.status === "PAID" || res.status === "REFUNDED") {
          stopped = true;
          setState({ kind: "paid", refunded: res.status === "REFUNDED" });
          announceNotesChanged();
          announceCoinsChanged();
          return;
        }
      } catch (err) {
        if (stopped) return;
        const e = err as ApiError;
        if (e.status === 400 || e.status === 404) {
          stopped = true;
          setState(e.status === 404 ? { kind: "missing" } : { kind: "failed", message: e.message });
          return;
        }
      }
      if (tries >= TRIES) {
        stopped = true;
        setState({ kind: "waiting" });
      } else {
        setTimeout(check, EVERY_MS);
      }
    };
    void check();
    return () => {
      stopped = true;
    };
  }, [orderId]);

  const box = "card-3d mx-auto grid max-w-md justify-items-center gap-4 rounded-3xl p-8 text-center";
  const button = "press-3d inline-flex h-12 items-center justify-center rounded-xl px-6 text-base font-bold";

  if (state.kind === "checking") {
    return (
      <div role="status" className={box}>
        <Loader2Icon className="size-12 animate-spin text-brand-amber-text" aria-hidden="true" />
        <h1 className="font-heading text-2xl font-extrabold">Confirming your payment…</h1>
        <p className="text-muted-foreground">Please don&apos;t close this page. It takes a few seconds.</p>
      </div>
    );
  }
  if (state.kind === "paid") {
    return (
      <div role="status" className={box}>
        <CheckCircle2Icon className="size-14 text-success" aria-hidden="true" />
        <h1 className="font-heading text-2xl font-extrabold">{state.refunded ? "You already had this note" : "Payment successful!"}</h1>
        <p className="text-muted-foreground">
          {state.refunded
            ? "So this payment is being refunded to you. The money reaches your account in a few working days."
            : "Your note is unlocked. Download it any time from My profile."}
        </p>
        <Link href="/profile" className={button}>
          Go to my notes
        </Link>
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <div role="alert" className={box}>
        <XCircleIcon className="size-14 text-destructive" aria-hidden="true" />
        <h1 className="font-heading text-2xl font-extrabold">The payment didn&apos;t go through</h1>
        <p className="text-muted-foreground">{state.message}</p>
        <Link href="/notes" className={button}>
          Try again
        </Link>
      </div>
    );
  }
  if (state.kind === "waiting") {
    return (
      <div role="status" className={box}>
        <Clock3Icon className="size-14 text-brand-amber-text" aria-hidden="true" />
        <h1 className="font-heading text-2xl font-extrabold">Still being confirmed</h1>
        <p className="text-muted-foreground">
          Your bank hasn&apos;t confirmed the payment yet. If money was taken, the note unlocks on its own, usually within minutes. Check My profile, or
          write to the Helpline if it doesn&apos;t.
        </p>
        <Link href="/profile" className={button}>
          Go to my profile
        </Link>
      </div>
    );
  }
  return (
    <div role="alert" className={box}>
      <XCircleIcon className="size-14 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-heading text-2xl font-extrabold">We couldn&apos;t find this payment</h1>
      <p className="text-muted-foreground">Open My profile to see your orders, or go back to the notes.</p>
      <Link href="/notes" className={button}>
        Back to notes
      </Link>
    </div>
  );
}
