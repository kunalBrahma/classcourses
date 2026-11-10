"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2Icon, Loader2Icon, MailIcon, MailCheckIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError, SubmitButton } from "@/components/auth/form-bits";
import { useCountdown } from "@/components/auth/code-field";
import { announceProfileChanged, useMe, useRequireSignIn } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { safeNext } from "@/app/login/login-form";

// The student's side of parental consent: give a parent's or guardian's email,
// then wait for them to answer the link we email them.
export function AskParent() {
  const id = useId();
  useRequireSignIn();
  const me = useMe();
  const next = safeNext(useSearchParams().get("next") ?? "/");
  const [email, setEmail] = useState("");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useCountdown(0);

  if (!me) return <Loader2Icon className="mx-auto my-8 size-8 animate-spin text-brand-amber-text" aria-label="Loading" />;
  const consent = me.access?.consent;
  const continueLink = (
    <Link href={next} className="inline-flex min-h-11 items-center justify-center rounded-xl border bg-card px-5 font-semibold transition hover:bg-accent">
      {me.access?.fullAccess ? "Continue" : "Look around meanwhile"}
    </Link>
  );

  // Nothing to do: an adult, or a parent already agreed.
  if (!consent?.required || consent.status === "GRANTED") {
    return (
      <div className="grid gap-5 text-center">
        <CheckCircle2Icon className="mx-auto size-14 text-success" aria-hidden="true" />
        <p className="text-[15px]">{consent?.status === "GRANTED" ? "Your parent or guardian has agreed. Your account is fully active." : "Your account doesn't need a parent's permission."}</p>
        {continueLink}
      </div>
    );
  }

  // to = a new email; null = send again to the saved one
  const send = async (to: string | null) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiJson<{ message: string; retryAfter: number }>(to === null ? "/api/users/me/consent/resend" : "/api/users/me/consent", {
        method: "POST",
        json: to === null ? {} : { parentEmail: to.trim() },
      });
      setNotice(res.message);
      setWait(res.retryAfter);
      setChanging(false);
      announceProfileChanged(); // reload /me (status: PENDING)
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(email);
  };

  const waiting = consent.status === "PENDING" && !consent.expired && !changing;
  if (waiting) {
    return (
      <div className="grid gap-5">
        <div className="grid justify-items-center gap-3 text-center">
          <MailCheckIcon className="size-12 text-brand-amber-text" aria-hidden="true" />
          <p className="text-[15px] leading-relaxed">
            We&apos;ve emailed <strong>{consent.parentEmail}</strong>. Ask them to open the email from Class Course (check spam too) and answer. The link works
            for 7 days.
          </p>
        </div>
        <FormError message={error} />
        {notice && (
          <p role="status" className="rounded-xl bg-accent px-4 py-3 text-sm">
            {notice}
          </p>
        )}
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          Meanwhile you can read every chapter and free note. Quizzes, coins and buying notes start once they agree.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" onClick={() => setChanging(true)} className="inline-flex min-h-11 items-center font-medium text-muted-foreground hover:text-foreground">
            Use a different email
          </button>
          <button type="button" disabled={wait > 0 || busy} className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-amber-text disabled:text-muted-foreground" onClick={() => void send(null)}>
            {busy && <Loader2Icon className="size-4 animate-spin" />}
            {wait > 0 ? `Send again in ${wait}s` : "Send the email again"}
          </button>
        </div>
        {continueLink}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      {consent.status === "DECLINED" && <p className="rounded-xl bg-accent px-4 py-3 text-[15px]">Your parent or guardian said no. You can ask them again, or ask your other parent or guardian.</p>}
      {consent.status === "WITHDRAWN" && <p className="rounded-xl bg-accent px-4 py-3 text-[15px]">Your parent or guardian took back their permission. Ask them if you&apos;d like to use quizzes and notes again.</p>}
      {consent.status === "PENDING" && consent.expired && <p className="rounded-xl bg-accent px-4 py-3 text-[15px]">The last link expired before anyone answered. Send a new one.</p>}
      <FormError message={error} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-email`} className="text-sm font-semibold">
          Your parent&apos;s or guardian&apos;s email
        </Label>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="parent@example.com"
            className="h-12 rounded-xl pl-11 text-base"
          />
        </div>
        <p className="text-xs text-muted-foreground">We email them a link. They read what we store and decide. We don&apos;t use it for anything else.</p>
      </div>
      <SubmitButton loading={busy} loadingText="Sending…">
        Email my parent
      </SubmitButton>
      {continueLink}
    </form>
  );
}
