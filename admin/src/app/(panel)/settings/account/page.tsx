"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { KeyRoundIcon, Loader2Icon, MailIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { Field, SecretInput } from "@/components/admin/settings/field";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { setTokens } from "@/lib/auth";

interface Account {
  id: string;
  email: string;
  name: string | null;
  hasPassword: boolean;
}

// How strong a new password looks: a hint, not a rule (the server needs 8+ characters).
const strength = (p: string): { label: string; tone: string } | null => {
  if (!p) return null;
  if (p.length < 8) return { label: "Too short: use at least 8 characters", tone: "text-destructive" };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (p.length >= 12 && kinds >= 3) return { label: "Strong", tone: "text-success" };
  if (p.length >= 10 && kinds >= 2) return { label: "Good. Longer, with numbers and symbols, is better", tone: "text-brand-amber-text" };
  return { label: "Weak: add capitals, numbers or symbols, or make it longer", tone: "text-destructive" };
};

function PasswordCard() {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = strength(next);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== repeat) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      const res = await apiJson<{ accessToken: string; refreshToken: string }>("/api/admin/account/password", {
        method: "POST",
        json: { currentPassword: current, newPassword: next },
      });
      setTokens(res.accessToken, res.refreshToken);
      setCurrent("");
      setNext("");
      setRepeat("");
      toast.success("Password changed. Other devices have been signed out.");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={formCard}>
      <form onSubmit={save}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <KeyRoundIcon className="size-5 text-brand-amber-text" /> Change password
          </CardTitle>
          <CardDescription>
            Use a password only you know, with at least 8 characters. After the change, every other phone or computer signed in to this account is signed out.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-2 sm:max-w-md">
          <Field id={`${id}-current`} label="Current password">
            <SecretInput id={`${id}-current`} value={current} onChange={setCurrent} autoComplete="current-password" label="password" />
          </Field>
          <Field id={`${id}-new`} label="New password" hint={hint && <span className={hint.tone}>{hint.label}</span>}>
            <SecretInput id={`${id}-new`} value={next} onChange={setNext} hasHint={Boolean(hint)} label="password" />
          </Field>
          <Field id={`${id}-repeat`} label="Type the new password again">
            <SecretInput id={`${id}-repeat`} value={repeat} onChange={setRepeat} label="password" />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="mt-2">
          <Button type="submit" className={pressable} disabled={busy || !current || next.length < 8 || !repeat}>
            {busy && <Loader2Icon className="animate-spin" />} Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function EmailCard({ account }: { account: Account }) {
  const id = useId();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ newEmail: string }>("/api/admin/account/email", { method: "POST", json: { newEmail, password } });
      setSentTo(res.newEmail);
      setPassword("");
      toast.success(`Code sent to ${res.newEmail}`);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ email: string }>("/api/admin/account/email/confirm", { method: "POST", json: { code } });
      toast.success(`Your sign-in email is now ${res.email}`);
      // The sidebar and every page read the session once: load it again.
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <Card className={formCard}>
      <form onSubmit={sentTo ? confirmCode : sendCode}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <MailIcon className="size-5 text-brand-amber-text" /> Sign-in email
          </CardTitle>
          <CardDescription>
            You sign in with <span className="font-semibold text-foreground">{account.email}</span>. Use an email you own: password reset and unlock codes are
            sent there.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-2 sm:max-w-md">
          {!sentTo ? (
            <>
              <Field id={`${id}-email`} label="New email">
                <Input
                  id={`${id}-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </Field>
              <Field id={`${id}-pass`} label="Current password" hint="To make sure it's you.">
                <SecretInput id={`${id}-pass`} value={password} onChange={setPassword} autoComplete="current-password" label="password" hasHint />
              </Field>
            </>
          ) : (
            <Field id={`${id}-code`} label="6-digit code" hint={`We emailed it to ${sentTo}. It works for 5 minutes. Check spam if you don't see it.`}>
              <Input
                id={`${id}-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                aria-describedby={`${id}-code-hint`}
                className={`${inputClass} font-mono text-lg tracking-[0.4em]`}
              />
            </Field>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="mt-2 flex flex-wrap gap-2">
          {!sentTo ? (
            <Button type="submit" className={pressable} disabled={busy || !newEmail || !password}>
              {busy && <Loader2Icon className="animate-spin" />} Send code
            </Button>
          ) : (
            <>
              <Button type="submit" className={pressable} disabled={busy || code.length !== 6}>
                {busy && <Loader2Icon className="animate-spin" />} Confirm new email
              </Button>
              <Button
                type="button"
                variant="outline"
                className={actionButton}
                disabled={busy}
                onClick={() => {
                  setSentTo(null);
                  setCode("");
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

export default function MyAccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Account>("/api/admin/account")
      .then(setAccount)
      .catch((err: ApiError) => setLoadError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="My account" description="Your own sign-in details for this admin panel." />
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {!account && !loadError ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : account ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PasswordCard />
          <EmailCard account={account} />
        </div>
      ) : null}
    </div>
  );
}
