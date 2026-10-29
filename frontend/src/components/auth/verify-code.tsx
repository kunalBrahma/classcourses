"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError, SubmitButton } from "@/components/auth/form-bits";
import { ApiError, publicJson } from "@/lib/api";
import { setTokens } from "@/lib/auth";

// Second step of sign-up (and of signing in to an account that was never
// verified): enter the 6-digit code emailed by the backend. A correct code
// logs the student in.
export function VerifyCodeStep({ email, retryAfter = 60, next, onBack }: { email: string; retryAfter?: number; next: string; onBack: () => void }) {
  const id = useId();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(retryAfter);
  const submitted = useRef<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    if (loading) return;
    submitted.current = value;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const data = await publicJson<{ accessToken: string; refreshToken: string }>("/api/auth/verify-email", {
        method: "POST",
        json: { email, code: value },
      });
      setTokens(data.accessToken, data.refreshToken);
      router.push(next);
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      if (e.code === "ALREADY_VERIFIED") router.push(`/login?next=${encodeURIComponent(next)}`);
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError("Enter all 6 digits of the code.");
    void verify(code);
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    try {
      const data = await publicJson<{ retryAfter: number }>("/api/auth/resend-code", { method: "POST", json: { email } });
      setWait(data.retryAfter);
      setCode("");
      submitted.current = null;
      setNotice("A new code is on its way. Check your inbox (and the spam folder).");
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="flex gap-3 rounded-2xl border border-brand-amber/30 bg-accent p-4 text-sm">
        <MailCheckIcon className="mt-0.5 size-5 shrink-0 text-brand-amber-text" aria-hidden="true" />
        <p>
          We&apos;ve sent a 6-digit code to <strong className="break-all">{email}</strong>. Enter it below to finish. It can take a minute, and may land in spam.
        </p>
      </div>
      <FormError message={error} />
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-code`} className="text-sm font-semibold">Code from the email</Label>
        <Input
          id={`${id}-code`}
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            // Check as soon as the 6th digit is typed or pasted.
            if (digits.length === 6 && submitted.current !== digits) void verify(digits);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="••••••"
          autoFocus
          className="h-14 rounded-xl text-center font-mono text-2xl tracking-[0.5em]"
        />
      </div>
      <SubmitButton loading={loading} loadingText="Checking…">Verify &amp; continue</SubmitButton>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button type="button" variant="ghost" className="h-11 px-2" onClick={onBack}>
          <ArrowLeftIcon /> Change email
        </Button>
        {wait > 0 ? (
          <span className="px-2 text-muted-foreground tabular-nums">New code in {wait}s</span>
        ) : (
          <Button type="button" variant="ghost" className="h-11 px-2 font-semibold text-brand-amber-text" onClick={resend}>
            Send a new code
          </Button>
        )}
      </div>
    </form>
  );
}
