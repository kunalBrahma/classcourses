"use client";

import { FormEvent, use, useEffect, useId, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, Loader2Icon, ShieldCheckIcon, XCircleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/auth/form-bits";
import { ApiError, publicJson } from "@/lib/api";

interface Request {
  siteName: string;
  studentFirstName: string;
  status: "PENDING" | "GRANTED" | "DECLINED" | "WITHDRAWN";
  expired: boolean;
}

// What we store about a student, in plain words (matches the Privacy Policy).
const WE_STORE = [
  "Their name, email, class, district and date of birth (only to know they are under 18). A phone number only if they give one.",
  "Their quiz scores and coins, and the notes they download or buy.",
  "Payments are handled by the payment company; we never see card, UPI or bank details.",
];

// The parent's or guardian's answer (client requirements of 6 Nov 2026; DPDP).
export function ParentDecision({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const id = useId();
  const [request, setRequest] = useState<Request | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<"parent" | "guardian" | "">("");
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState<"grant" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"GRANTED" | "DECLINED" | null>(null);

  useEffect(() => {
    let active = true;
    publicJson<Request>(`/api/consent/${encodeURIComponent(token)}`)
      .then((r) => active && setRequest(r))
      .catch((err: ApiError) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, [token]);

  const answer = async (decision: "grant" | "decline") => {
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!relationship) return setError("Please choose whether you are the parent or the guardian.");
    if (!adult) return setError("Please tick the box to confirm you are the parent or lawful guardian and 18 or older.");
    setError(null);
    setBusy(decision);
    try {
      const res = await publicJson<{ status: "GRANTED" | "DECLINED" }>(`/api/consent/${encodeURIComponent(token)}`, {
        method: "POST",
        json: { decision, parentName: name.trim(), relationship, confirmAdult: true },
      });
      setDone(res.status);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const box = "card-3d mx-auto grid max-w-xl gap-5 rounded-3xl p-6 sm:p-8";

  if (loadError) {
    return (
      <div role="alert" className={`${box} justify-items-center text-center`}>
        <XCircleIcon className="size-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-heading text-2xl font-extrabold">This link doesn&apos;t work</h1>
        <p className="text-muted-foreground">{loadError}</p>
      </div>
    );
  }
  if (!request) return <Loader2Icon className="mx-auto size-8 animate-spin text-brand-amber-text" aria-label="Loading" />;

  const finished = done ?? (request.status !== "PENDING" ? request.status : null);
  if (finished) {
    return (
      <div role="status" className={`${box} justify-items-center text-center`}>
        {finished === "GRANTED" ? <CheckCircle2Icon className="size-14 text-success" aria-hidden="true" /> : <ShieldCheckIcon className="size-14 text-brand-amber-text" aria-hidden="true" />}
        <h1 className="font-heading text-2xl font-extrabold">{finished === "GRANTED" ? "Thank you" : "Your answer is saved"}</h1>
        <p className="text-muted-foreground">
          {finished === "GRANTED"
            ? `${request.studentFirstName}'s account is now fully active. You can take your permission back at any time by writing to our Helpline.`
            : finished === "DECLINED"
              ? `${request.studentFirstName}'s account stays limited: they can read free chapters, but not take quizzes or buy notes.`
              : "This request has already been answered."}
        </p>
        <Link href="/contact" className="font-semibold text-brand-amber-text underline">
          Questions? Write to our Helpline
        </Link>
      </div>
    );
  }
  if (request.expired) {
    return (
      <div role="alert" className={`${box} justify-items-center text-center`}>
        <XCircleIcon className="size-12 text-muted-foreground" aria-hidden="true" />
        <h1 className="font-heading text-2xl font-extrabold">This link has expired</h1>
        <p className="text-muted-foreground">Ask {request.studentFirstName} to send a new one from their profile on {request.siteName}.</p>
      </div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void answer("grant");
  };

  return (
    <form onSubmit={submit} className={box} noValidate translate="no">
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-brand-amber-text">Parent or guardian permission</p>
        <h1 className="mt-1 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          {request.studentFirstName} would like to use {request.siteName}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          {request.siteName} is a study website for school students in Assam: chapter-wise answers, quizzes that earn coins, and notes. Because{" "}
          {request.studentFirstName} is under 18, we need your permission before their account is fully active.
        </p>
      </div>

      <div className="rounded-2xl bg-accent px-4 py-3 text-[15px]">
        <p className="font-semibold">What we store about your child</p>
        <ul className="mt-2 grid list-disc gap-1 pl-5">
          {WE_STORE.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          We don&apos;t sell it, and we don&apos;t use it for advertising. Read our{" "}
          <Link href="/privacy" target="_blank" className="font-semibold text-brand-amber-text underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" target="_blank" className="font-semibold text-brand-amber-text underline">
            Terms
          </Link>
          . You can ask to see, correct or delete this data at any time through our Helpline.
        </p>
      </div>

      <FormError message={error} />
      <div className="grid gap-2">
        <Label htmlFor={`${id}-name`} className="text-sm font-semibold">
          Your full name
        </Label>
        <Input id={`${id}-name`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl text-base" />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">You are {request.studentFirstName}&apos;s</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["parent", "guardian"] as const).map((r) => (
            <label key={r} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-card px-4">
              <input type="radio" name={`${id}-rel`} checked={relationship === r} onChange={() => setRelationship(r)} className="size-5 accent-brand-amber" />
              <span className="font-semibold capitalize">{r}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3 text-[15px] leading-snug">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-amber" />
        <span>I am {request.studentFirstName}&apos;s parent or lawful guardian, and I am 18 or older.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="submit" disabled={busy !== null} className="press-3d inline-flex h-12 items-center justify-center gap-2 rounded-xl text-base font-bold disabled:opacity-70">
          {busy === "grant" && <Loader2Icon className="size-5 animate-spin" />} I give permission
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void answer("decline")} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-card text-base font-semibold transition hover:bg-accent disabled:opacity-70">
          {busy === "decline" && <Loader2Icon className="size-5 animate-spin" />} I don&apos;t give permission
        </button>
      </div>
    </form>
  );
}
