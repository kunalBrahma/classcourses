"use client";

import { FormEvent, useId, useState } from "react";
import { MailIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError, FormSuccess, SubmitButton } from "@/components/auth/form-bits";
import { ApiError, publicJson } from "@/lib/api";

export function ForgotForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await publicJson("/api/auth/forgot-password", { method: "POST", json: { email: email.trim() } });
      // Same message whether or not the email exists (no account guessing).
      setSent(true);
    } catch (err) {
      const e = err as ApiError;
      setError(e.message); // a 429 says whether it's this address or this network
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <FormSuccess>
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-muted-foreground">
          If <strong className="text-foreground">{email}</strong> has a Class Course account, we&apos;ve sent a link to reset the password. It works for
          1 hour. Check your spam folder too.
        </p>
      </FormSuccess>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormError message={error} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-email`} className="text-sm font-semibold">Email</Label>
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
      <SubmitButton loading={loading} loadingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
