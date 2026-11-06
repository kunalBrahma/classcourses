"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { CodeField } from "@/components/auth/code-field";
import { ApiError, publicJson } from "@/lib/api";

// Shown when sign-in is paused after wrong passwords: reset the password, or
// get an unlock code by email (valid 5 minutes) to sign in again now.
export function PausedHelp({ email, onUnlocked }: { email: string; onUnlocked: () => void }) {
  const id = useId();
  const [step, setStep] = useState<"choose" | "code" | "done">("choose");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setNote(null);
    try {
      await publicJson("/api/auth/unlock/request", { method: "POST", json: { email } });
      setStep("code");
    } catch (err) {
      setNote((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setNote("Enter all 6 digits of the code.");
    setBusy(true);
    setNote(null);
    try {
      await publicJson("/api/auth/unlock", { method: "POST", json: { email, code } });
      setStep("done");
      onUnlocked();
    } catch (err) {
      setNote((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <p role="status" className="rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold">
        Unlocked! Type your password and sign in.
      </p>
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4 text-[15px]">
      {step === "choose" ? (
        <>
          <p className="font-semibold">Forgot your password?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href={`/forgot-password?email=${encodeURIComponent(email)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border bg-card px-4 font-semibold transition hover:bg-accent"
            >
              Reset my password
            </Link>
            <button
              type="button"
              onClick={ask}
              disabled={busy || !email}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 font-semibold transition hover:bg-accent disabled:opacity-60"
            >
              {busy && <Loader2Icon className="size-4 animate-spin" />} Email me an unlock code
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={unlock} className="grid gap-3" noValidate>
          <p className="text-muted-foreground">
            If <strong className="text-foreground">{email}</strong> is paused, we&apos;ve emailed it an unlock code. It works for 5 minutes.
          </p>
          <CodeField id={`${id}-code`} value={code} onChange={setCode} label="Unlock code" />
          <button type="submit" disabled={busy} className="press-3d inline-flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold disabled:opacity-70">
            {busy && <Loader2Icon className="size-5 animate-spin" />} Unlock
          </button>
        </form>
      )}
      {note && (
        <p role="alert" className="text-sm text-destructive">
          {note}
        </p>
      )}
    </div>
  );
}
