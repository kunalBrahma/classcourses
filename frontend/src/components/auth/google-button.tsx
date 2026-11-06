"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { FormError } from "@/components/auth/form-bits";
import { ApiError, publicJson } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { whereAfterSignIn } from "@/lib/profile";
import { cn } from "@/lib/utils";

// The placeholder in the example env files counts as not set up.
const rawClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const CLIENT_ID = rawClientId.startsWith("your-") ? "" : rawClientId;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleAccounts {
  id: {
    initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
    renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
  };
}
type GoogleWindow = Window & { google?: { accounts?: GoogleAccounts } };

let scriptLoading: Promise<GoogleAccounts> | null = null;

// Only the sign-in and sign-up pages download Google's script.
const loadGoogle = () => {
  scriptLoading ??= new Promise<GoogleAccounts>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const accounts = (window as GoogleWindow).google?.accounts;
      if (accounts) resolve(accounts);
      else reject(new Error("Google sign-in didn't load"));
    };
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error("Google sign-in didn't load"));
    };
    document.head.appendChild(script);
  });
  return scriptLoading;
};

// Google's script may be set up only once per page, so the latest button's handler lives here.
let onCredential: ((credential: string) => void) | null = null;
let initialized = false;

// Google's "G", as its sign-in branding guidelines show it.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Google's button lives in Google's iframe: its corners are fixed (4 px or a
// pill) and in dark mode it showed a white box. So students see OUR button,
// styled like the inputs (h-12, rounded-xl), and Google's real button lies on
// top of it, invisible and stretched to the same size: the tap still goes to
// Google, which hands back the same ID token. Focus inside it shows our ring.
// Renders nothing until a client ID is set, so the page shows the email form.
export function GoogleButton({ next }: { next: string }) {
  const router = useRouter();
  const frame = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let active = true;
    let observer: ResizeObserver | null = null;

    onCredential = async (credential) => {
      setError(null);
      try {
        const data = await publicJson<{ accessToken: string; refreshToken: string }>("/api/auth/google", {
          method: "POST",
          json: { credential },
        });
        setTokens(data.accessToken, data.refreshToken);
        router.push(await whereAfterSignIn(next));
        router.refresh();
      } catch (err) {
        setError((err as ApiError).message);
      }
    };

    // Stretches Google's (at most 400 px wide) button over the whole of ours.
    const fit = () => {
      const box = frame.current;
      const inner = holder.current;
      const rendered = inner?.firstElementChild as HTMLElement | null;
      if (!box || !inner || !rendered || !rendered.offsetWidth || !rendered.offsetHeight) return;
      inner.style.transform = `scale(${box.offsetWidth / rendered.offsetWidth}, ${box.offsetHeight / rendered.offsetHeight})`;
    };

    loadGoogle()
      .then((accounts) => {
        if (!active || !holder.current || !frame.current) return;
        if (!initialized) {
          accounts.id.initialize({ client_id: CLIENT_ID, callback: ({ credential }) => onCredential?.(credential) });
          initialized = true;
        }
        holder.current.style.transform = "";
        accounts.id.renderButton(holder.current, {
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          logo_alignment: "center",
          width: Math.min(frame.current.offsetWidth, 400),
        });
        // Google adds its iframe a moment later, and the page can change width.
        observer = new ResizeObserver(fit);
        observer.observe(frame.current);
        observer.observe(holder.current);
        fit();
        setReady(true);
      })
      .catch(() => {
        if (active) setError("Google sign-in couldn't load. You can still use your email below.");
      });

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [next, router]);

  if (!CLIENT_ID) return null;

  return (
    <div className="grid gap-5">
      <FormError message={error} />
      <div
        ref={frame}
        className={cn(
          "group relative h-12 w-full rounded-xl focus-within:ring-3 focus-within:ring-ring/50",
          !ready && !error && "cursor-wait"
        )}
      >
        {/* What students see. Google's invisible button above takes the tap. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex h-full items-center justify-center gap-3 rounded-xl border border-input bg-card px-4 text-base font-semibold shadow-xs transition group-hover:bg-accent group-active:translate-y-px",
            !ready && "opacity-60"
          )}
        >
          {!ready && !error ? <Loader2Icon className="size-5 animate-spin text-muted-foreground" /> : <GoogleLogo />}
          Continue with Google
        </div>
        {/* color-scheme: Google's frame drew a white box on dark pages. */}
        <div className="absolute inset-0 overflow-hidden rounded-xl opacity-[0.01] [color-scheme:light]">
          <div ref={holder} className="w-max origin-top-left" />
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
