"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { FormError, FormSuccess, SubmitButton } from "@/components/auth/form-bits";
import { ApiError, publicJson } from "@/lib/api";

export function ResetForm() {
  const id = useId();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <FormError message="This link is incomplete. Open the link from your email again, or ask for a new one." />
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setError(null);
    setLoading(true);
    try {
      await publicJson("/api/auth/reset-password", { method: "POST", json: { token, password } });
      setDone(true);
    } catch (err) {
      const e = err as ApiError;
      setError(/invalid or expired/i.test(e.message) ? "This reset link has expired or was already used. Ask for a new one." : e.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="grid gap-5">
        <FormSuccess>
          <p className="font-semibold">Password changed</p>
          <p className="mt-1 text-muted-foreground">You&apos;ve been signed out on other devices. Sign in with your new password.</p>
        </FormSuccess>
        <Button asChild className="press-3d h-12 rounded-xl text-base font-semibold">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormError message={error} />
      {error?.includes("expired") && (
        <Link href="/forgot-password" className="-mt-2 text-sm font-semibold text-brand-amber-text hover:underline">Send me a new link</Link>
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-pw`} className="text-sm font-semibold">New password</Label>
        <PasswordInput id={`${id}-pw`} value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-pw2`} className="text-sm font-semibold">Type it again</Label>
        <PasswordInput id={`${id}-pw2`} value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={confirm.length > 0 && confirm !== password} />
      </div>
      <SubmitButton loading={loading} loadingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
