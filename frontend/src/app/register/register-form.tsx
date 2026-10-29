"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckIcon, MailIcon, PhoneIcon, UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { FormError, SubmitButton } from "@/components/auth/form-bits";
import { VerifyCodeStep } from "@/components/auth/verify-code";
import { ApiError, publicJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { safeNext } from "../login/login-form";

// Same rule as the backend (auth.validation.ts): spaces, dashes and a
// +91 / 91 / 0 prefix are fine; what's left must be a 10-digit mobile number.
const normalisePhone = (v: string) => v.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");
const validPhone = (v: string) => /^[6-9]\d{9}$/.test(normalisePhone(v));

export function RegisterForm({ termsPublished, privacyPublished }: { termsPublished: boolean; privacyPublished: boolean }) {
  const id = useId();
  const next = safeNext(useSearchParams().get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set once the account is created: shows the "enter the code" step.
  const [sent, setSent] = useState<{ email: string; retryAfter: number } | null>(null);
  const longEnough = password.length >= 8;
  const matches = confirm.length > 0 && confirm === password;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validPhone(phone)) {
      setError("Enter a 10-digit mobile number, e.g. 98765 43210.");
      return;
    }
    if (!longEnough) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match. Type them again.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await publicJson<{ email: string; retryAfter: number }>("/api/auth/register", {
        method: "POST",
        json: { name: name.trim(), email: email.trim(), phone: normalisePhone(phone), password },
      });
      setSent({ email: data.email, retryAfter: data.retryAfter });
    } catch (err) {
      const e = err as ApiError;
      setError(
        /already registered/i.test(e.message)
          ? "An account with this email already exists. Sign in instead."
          : e.message // includes the server's rate-limit wording
      );
    } finally {
      setLoading(false);
    }
  };

  const legal = (slug: string, label: string, published: boolean) =>
    published ? (
      <Link href={`/${slug}`} className="font-medium text-brand-amber-text hover:underline">{label}</Link>
    ) : (
      label
    );

  if (sent) return <VerifyCodeStep email={sent.email} retryAfter={sent.retryAfter} next={next} onBack={() => setSent(null)} />;

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
        <Label htmlFor={`${id}-phone`} className="text-sm font-semibold">Mobile number</Label>
        <div className="relative">
          <PhoneIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <span className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-base text-muted-foreground" aria-hidden="true">+91</span>
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+()-]/g, ""))}
            placeholder="98765 43210"
            maxLength={16}
            aria-invalid={phone.length >= 10 && !validPhone(phone) ? true : undefined}
            className="h-12 rounded-xl pl-[4.75rem] text-base tabular-nums"
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
      <div className="grid gap-2">
        <Label htmlFor={`${id}-pw2`} className="text-sm font-semibold">Confirm password</Label>
        <PasswordInput
          id={`${id}-pw2`}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          placeholder="Type the password again"
          describedBy={`${id}-pw2-hint`}
          invalid={confirm.length > 0 && !password.startsWith(confirm)}
        />
        <p id={`${id}-pw2-hint`} className={cn("flex items-center gap-1.5 text-xs", matches ? "text-success" : confirm && !password.startsWith(confirm) ? "text-destructive" : "text-muted-foreground")}>
          <CheckIcon className={cn("size-3.5", !matches && "opacity-30")} /> {confirm && !password.startsWith(confirm) ? "Passwords don't match yet" : "Both passwords match"}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        By joining you agree to our {legal("terms", "Terms", termsPublished)} and {legal("privacy", "Privacy Policy", privacyPublished)}. If you are under 18,
        please ask a parent or guardian before signing up.
      </p>
      <SubmitButton loading={loading} loadingText="Sending your code…">Join free</SubmitButton>
    </form>
  );
}
