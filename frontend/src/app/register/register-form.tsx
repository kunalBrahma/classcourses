"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, MailIcon, UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { FormError, SubmitButton } from "@/components/auth/form-bits";
import { ApiError, publicJson } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { safeNext } from "../login/login-form";

export function RegisterForm({ termsPublished, privacyPublished }: { termsPublished: boolean; privacyPublished: boolean }) {
  const id = useId();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const longEnough = password.length >= 8;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!longEnough) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await publicJson<{ accessToken: string; refreshToken: string }>("/api/auth/register", {
        method: "POST",
        json: { name: name.trim() || undefined, email: email.trim(), password },
      });
      setTokens(data.accessToken, data.refreshToken);
      router.push(next);
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      setError(
        /already exists/i.test(e.message)
          ? "An account with this email already exists. Sign in instead."
          : e.status === 429
            ? "Too many tries. Please wait 15 minutes and try again."
            : e.message
      );
    } finally {
      setLoading(false);
    }
  };

  const legal = (slug: string, label: string, published: boolean) =>
    published ? (
      <Link href={`/${slug}`} className="font-medium text-primary hover:underline">{label}</Link>
    ) : (
      label
    );

  return (
    <form onSubmit={submit} className="grid gap-5">
      <FormError message={error} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`} className="text-sm font-semibold">Your name</Label>
        <div className="relative">
          <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id={`${id}-name`} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Das" className="h-12 rounded-xl pl-11 text-base" />
        </div>
      </div>
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
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12 rounded-xl pl-11 text-base"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-pw`} className="text-sm font-semibold">Create a password</Label>
        <PasswordInput id={`${id}-pw`} value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" describedBy={`${id}-pw-hint`} minLength={8} />
        <p id={`${id}-pw-hint`} className={cn("flex items-center gap-1.5 text-xs", longEnough ? "text-success" : "text-muted-foreground")}>
          <CheckIcon className={cn("size-3.5", !longEnough && "opacity-30")} /> At least 8 characters
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        By joining you agree to our {legal("terms", "Terms", termsPublished)} and {legal("privacy", "Privacy Policy", privacyPublished)}. If you are under 18,
        please ask a parent or guardian before signing up.
      </p>
      <SubmitButton loading={loading} loadingText="Creating your account…">Join free</SubmitButton>
    </form>
  );
}
