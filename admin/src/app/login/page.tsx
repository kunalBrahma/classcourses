"use client";

import { FormEvent, KeyboardEvent, Suspense, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearTokens, setTokens } from "@/lib/auth";
import { LogoFull } from "@/components/admin/logo-mark";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Brand panel colour: the student site's dark-brown footer, with amber glows.
const BROWN = "#2e2000";

// ---------------------------------------------------------------------------
// Icons (inline, decorative — the controls that use them carry their own labels)
// ---------------------------------------------------------------------------

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" strokeLinecap="round" />
  </svg>
);

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.2 6.7C3.9 8.3 2.5 12 2.5 12S6 19 12 19a9.4 9.4 0 0 0 4.4-1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" />
    </svg>
  );

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" strokeLinecap="round" />
  </svg>
);

const Spinner = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={3} />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// Brand panel: the stacked "3D" cards from the client's document cover
// ---------------------------------------------------------------------------

function CardStack({ compact = false }: { compact?: boolean }) {
  const size = compact ? "w-44 h-24 sm:w-52 sm:h-28" : "w-72 h-40 xl:w-80 xl:h-44";
  const card = `absolute inset-0 rounded-2xl motion-safe:animate-[cc-deal_700ms_cubic-bezier(.2,.8,.2,1)_both]`;
  return (
    <div className={`relative ${size}`} aria-hidden="true">
      <div
        className={`${card} bg-[#8a5a00] shadow-[0_18px_40px_-12px_rgba(0,0,0,.6)]`}
        style={{ transform: "translate(22px, 22px) rotate(6deg)", ["--cc-rot" as string]: "6deg", ["--cc-rot-from" as string]: "16deg", animationDelay: "60ms" }}
      />
      <div
        className={`${card} bg-[#c9780c] shadow-[0_18px_40px_-12px_rgba(0,0,0,.55)]`}
        style={{ transform: "translate(11px, 11px) rotate(3deg)", ["--cc-rot" as string]: "3deg", ["--cc-rot-from" as string]: "11deg", animationDelay: "140ms" }}
      />
      <div
        className={`${card} flex flex-col justify-between bg-gradient-to-br from-[#ffbe4d] to-[#f5a623] p-4 text-brand-ink shadow-[0_24px_50px_-14px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.35)] ${compact ? "" : "xl:p-6"}`}
        style={{ ["--cc-rot-from" as string]: "-6deg", animationDelay: "220ms" }}
      >
        <span className={`font-[family-name:var(--font-display)] font-bold leading-none ${compact ? "text-lg" : "text-2xl xl:text-3xl"}`}>
          Class 1 – 12
        </span>
        <span className={`flex items-center gap-x-2 whitespace-nowrap font-medium text-brand-ink/80 ${compact ? "text-[11px]" : "text-sm"}`}>
          Q&amp;A <span className="text-brand-ink/50">·</span> MCQ <span className="text-brand-ink/50">·</span> Notes
          {!compact && (
            <>
              <span className="text-brand-ink/50">·</span> Quiz
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="grid gap-1.5">
      <LogoFull className="h-10" />
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#ffd889]">Admin panel</span>
    </div>
  );
}

// Subtle dot grid + amber glows so the brown panel has depth instead of a flat fill.
const panelBackground = {
  backgroundColor: BROWN,
  backgroundImage: [
    "radial-gradient(circle at 85% 15%, rgba(245,166,35,.35), transparent 45%)",
    "radial-gradient(circle at 10% 90%, rgba(245,158,11,.18), transparent 40%)",
    "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)",
  ].join(","),
  backgroundSize: "auto, auto, 22px 22px",
};

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

const friendlyError = (status: number, message?: string) => {
  if (status === 401) return "That email and password don't match. Check them and try again.";
  if (status === 429) return message || "Too many sign-in attempts. Please wait 15 minutes and try again.";
  if (status === 400) return "Enter a valid email address and your password.";
  return message || "Sign-in failed. Please try again.";
};

function LoginForm() {
  const router = useRouter();
  const denied = useSearchParams().get("denied");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // re-triggers the shake on each failure
  const [loading, setLoading] = useState(false);

  const ids = { email: useId(), password: useId(), error: useId(), caps: useId() };
  // `?denied=1` is set by the (panel) layout when a non-admin token is rejected.
  const message = error ?? (denied ? "This account doesn't have admin access." : null);

  const fail = (text: string) => {
    setError(text);
    setAttempt((n) => n + 1);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        fail(friendlyError(res.status, data.error));
        return;
      }
      if (data.user?.role !== "ADMIN") {
        clearTokens();
        fail("This account doesn't have admin access.");
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      router.push("/dashboard");
    } catch {
      fail("Can't reach the server. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const trackCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  const inputBase =
    "peer h-12 w-full rounded-xl border bg-card pl-11 text-base text-foreground placeholder:text-muted-foreground/70 outline-none transition " +
    "focus:border-ring focus:ring-4 focus:ring-ring/20 " +
    "aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-500/15";
  const inputBorder = "border-input";
  const iconBox =
    "pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-muted-foreground transition peer-focus:text-brand-amber-text";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate={false}
      className="motion-safe:animate-[cc-rise_600ms_cubic-bezier(.2,.8,.2,1)_both] [animation-delay:120ms]"
      aria-describedby={message ? ids.error : undefined}
    >
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        Welcome back
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">Sign in to manage classes, content, quizzes and notes.</p>

      {message && (
        <div
          key={attempt}
          id={ids.error}
          role="alert"
          className="mt-6 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800 motion-safe:animate-[cc-shake_400ms_ease-in-out] dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          <AlertIcon />
          <span>{message}</span>
        </div>
      )}

      <div className="mt-7 space-y-5">
        <div>
          <label htmlFor={ids.email} className="mb-1.5 block text-sm font-semibold text-foreground">
            Email
          </label>
          <div className="relative">
            <input
              id={ids.email}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
              className={`${inputBase} ${inputBorder} pr-4`}
            />
            <span className={iconBox}>
              <MailIcon />
            </span>
          </div>
        </div>

        <div>
          <label htmlFor={ids.password} className="mb-1.5 block text-sm font-semibold text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              id={ids.password}
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={trackCapsLock}
              onKeyDown={trackCapsLock}
              onBlur={() => setCapsLock(false)}
              aria-invalid={Boolean(error)}
              aria-describedby={capsLock ? ids.caps : undefined}
              className={`${inputBase} ${inputBorder} pr-14`}
            />
            <span className={iconBox}>
              <LockIcon />
            </span>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              aria-controls={ids.password}
              title={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-1 right-1 grid w-11 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <EyeIcon open={!showPassword} />
            </button>
          </div>
          {capsLock && (
            <p id={ids.caps} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-amber-text">
              <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs">⇪</span>
              Caps Lock is on
            </p>
          )}
        </div>
      </div>

      {/* Pressable "3D" button, the student site's amber style */}
      <button
        type="submit"
        disabled={loading}
        className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#ffbe4d] to-[#f5a623] text-base font-bold text-brand-ink shadow-[0_5px_0_#c9780c,0_12px_24px_-8px_rgba(201,120,12,.6)] transition-[transform,box-shadow,filter] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_2px_0_#c9780c,0_6px_14px_-8px_rgba(201,120,12,.6)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:cursor-wait disabled:opacity-80 disabled:active:translate-y-0"
      >
        {loading ? (
          <>
            <Spinner />
            <span>Signing in…</span>
          </>
        ) : (
          <span>Sign in</span>
        )}
      </button>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Admin access only · Students sign in on the main Class Course site
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel: full-height column on large screens, header band on phones/tablets */}
      <section
        style={panelBackground}
        className="relative overflow-hidden px-6 pb-24 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20"
      >
        <BrandMark />

        {/* Large screens: headline + big card stack */}
        <div className="hidden lg:block">
          <CardStack />
          <h2 className="mt-16 max-w-md font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.1] tracking-tight text-white xl:text-5xl">
            Every class. Every chapter.{" "}
            <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">One place.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[#ffe9c2]/80">
            Manage Assamese and English medium content, quizzes, coins and premium notes for students across Assam.
          </p>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <span className="h-1 w-10 rounded-full bg-amber-400" />
          <span className="text-sm text-[#ffd889]/80">Classes 1–12 · Q&amp;A · MCQ · Notes</span>
        </div>

        {/* Phones / tablets: compact stack in the header band */}
        <div className="mt-6 flex justify-end pr-6 sm:pr-10 lg:hidden">
          <CardStack compact />
        </div>
      </section>

      {/* Form: overlaps the header band on small screens, centred column on large ones */}
      <section className="relative -mt-16 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-[0_24px_60px_-20px_rgba(201,120,12,.35)] sm:p-9 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
