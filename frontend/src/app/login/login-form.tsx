"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MailIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { FormError, SubmitButton } from "@/components/auth/form-bits";
import { ApiError, publicJson } from "@/lib/api";
import { setTokens } from "@/lib/auth";

// Only same-site paths may be used as the post-login destination.
export const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export function LoginForm() {
  const id = useId();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await publicJson<{ accessToken: string; refreshToken: string }>("/api/auth/login", {
        method: "POST",
        json: { email: email.trim(), password },
      });
      setTokens(data.accessToken, data.refreshToken);
      router.push(next);
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      setError(
        e.status === 401
          ? "That email and password don't match. Check them and try again."
          : e.status === 429
            ? "Too many tries. Please wait 15 minutes and try again."
            : e.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5" aria-describedby={error ? `${id}-err` : undefined}>
      <FormError id={`${id}-err`} message={error} />
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
        <div className="flex items-center justify-between">
          <Label htmlFor={`${id}-pw`} className="text-sm font-semibold">Password</Label>
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Forgot password?</Link>
        </div>
        <PasswordInput id={`${id}-pw`} value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />
      </div>
      <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
