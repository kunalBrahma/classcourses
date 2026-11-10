"use client";

import { FormEvent, useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MailIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { FormError, SubmitButton } from "@/components/auth/form-bits";
import { GoogleButton } from "@/components/auth/google-button";
import { VerifyCodeStep } from "@/components/auth/verify-code";
import { ApiError, publicJson } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { ACCOUNT_NOTICE_KEY } from "@/lib/api";
import { PausedHelp } from "@/components/auth/unlock-code";
import { whereAfterSignIn } from "@/lib/profile";

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
  // The account exists but its email was never verified: the backend has
  // sent a code, so show the code step.
  const [needsCode, setNeedsCode] = useState<string | null>(null);
  // Sign-in paused after wrong passwords: offer a reset or an unlock code.
  const [paused, setPaused] = useState(false);
  // Suspended / blocked while signed in: the reason the server gave (lib/api.ts)
  const accountNotice = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(ACCOUNT_NOTICE_KEY);
      } catch {
        return null;
      }
    },
    () => null
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPaused(false);
    setLoading(true);
    try {
      const data = await publicJson<{ accessToken: string; refreshToken: string }>("/api/auth/login", {
        method: "POST",
        json: { email: email.trim(), password },
      });
      setTokens(data.accessToken, data.refreshToken);
      try {
        sessionStorage.removeItem(ACCOUNT_NOTICE_KEY);
      } catch {
        /* nothing stored */
      }
      router.push(await whereAfterSignIn(next));
      router.refresh();
    } catch (err) {
      const e = err as ApiError;
      if (e.code === "EMAIL_NOT_VERIFIED") {
        setNeedsCode(email.trim());
        return;
      }
      setPaused(e.code === "LOGIN_LOCKED");
      // The server's wording: tries left, or how long sign-in is paused
      setError(e.status === 401 && !/\b(try|tries) left\b/.test(e.message) ? "That email and password don't match. Check them and try again." : e.message);
    } finally {
      setLoading(false);
    }
  };

  if (needsCode) return <VerifyCodeStep email={needsCode} next={next} onBack={() => setNeedsCode(null)} />;

  return (
    <div className="grid gap-5">
    <GoogleButton next={next} />
    <form onSubmit={submit} className="grid gap-5" aria-describedby={error ? `${id}-err` : undefined}>
      <FormError id={`${id}-err`} message={error ?? accountNotice} />
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
          <Link href="/forgot-password" className="-my-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-amber-text hover:underline">Forgot password?</Link>
        </div>
        <PasswordInput id={`${id}-pw`} value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />
      </div>
      <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>
    </form>
    {paused && (
      <PausedHelp
        email={email.trim()}
        onUnlocked={() => {
          setPaused(false);
          setError(null);
        }}
      />
    )}
    </div>
  );
}
