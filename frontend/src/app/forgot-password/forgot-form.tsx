"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, MailIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError, FormSuccess, SubmitButton } from "@/components/auth/form-bits";
import { PasswordInput } from "@/components/auth/password-input";
import { CodeField, useCountdown } from "@/components/auth/code-field";
import { ApiError, publicJson } from "@/lib/api";

// Forgot password (client requirements of 6 Nov 2026): a 6-digit code is
// emailed, valid exactly 5 minutes; asking again cancels the old code.
// Choosing the new password also ends a sign-in pause and signs out every device.
export function ForgotForm() {
  const id = useId();
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useCountdown(0);

  const sendCode = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const data = await publicJson<{ retryAfter: number }>("/api/auth/forgot-password", { method: "POST", json: { email: email.trim() } });
      // Same answer whether or not the email exists (no account guessing).
      setStep("code");
      setCode("");
      setWait(data.retryAfter);
      return true;
    } catch (err) {
      setError((err as ApiError).message); // a 429 says whether it's this address or this network
      return false;
    } finally {
      setLoading(false);
    }
  };

  const askForCode = async (e: FormEvent) => {
    e.preventDefault();
    await sendCode();
  };

  const resend = async () => {
    if (await sendCode()) setNotice("We've sent a new code. Only the newest code works.");
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter all 6 digits of the code.");
    if (password.length < 8) return setError("Use at least 8 characters for your new password.");
    if (password !== confirm) return setError("The two passwords don't match. Type them again.");
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await publicJson("/api/auth/reset-password", { method: "POST", json: { email: email.trim(), code, password } });
      setStep("done");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };

  if (step === "done") {
    return (
      <div className="grid gap-5">
        <FormSuccess>
          <p className="font-semibold">Password changed</p>
          <p className="mt-1 text-muted-foreground">You&apos;re signed out on every device. Sign in with your new password.</p>
        </FormSuccess>
        <Link href="/login" className="press-3d inline-flex h-12 items-center justify-center rounded-xl text-base font-semibold">
          Sign in
        </Link>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={reset} className="grid gap-5" noValidate>
        <p className="rounded-xl bg-accent px-4 py-3 text-[15px] leading-relaxed">
          If <strong>{email.trim()}</strong> has a Class Course account, we&apos;ve emailed it a 6-digit code. It works for <strong>5 minutes</strong>.
          Check your spam folder too.
        </p>
        <FormError message={error} />
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        <CodeField id={`${id}-code`} value={code} onChange={setCode} />
        <div className="grid gap-2">
          <Label htmlFor={`${id}-pw`} className="text-sm font-semibold">
            New password
          </Label>
          <PasswordInput id={`${id}-pw`} value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-pw2`} className="text-sm font-semibold">
            Confirm new password
          </Label>
          <PasswordInput id={`${id}-pw2`} value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Type it again" />
        </div>
        <SubmitButton loading={loading} loadingText="Saving…">
          Set new password
        </SubmitButton>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" /> Change email
          </button>
          <button type="button" onClick={resend} disabled={wait > 0 || loading} className="inline-flex min-h-11 items-center font-semibold text-brand-amber-text disabled:text-muted-foreground">
            {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={askForCode} className="grid gap-5">
      <FormError message={error} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-email`} className="text-sm font-semibold">
          Email
        </Label>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12 rounded-xl pl-11 text-base"
          />
        </div>
      </div>
      <SubmitButton loading={loading} loadingText="Sending…">
        Email me a code
      </SubmitButton>
    </form>
  );
}
