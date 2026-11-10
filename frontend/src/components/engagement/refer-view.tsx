"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CoinsIcon, CopyIcon, GiftIcon, Share2Icon, UsersIcon } from "lucide-react";
import { useRequireSignIn } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { deviceId, referralLink } from "@/lib/referral";
import { cn } from "@/lib/utils";

interface Overview {
  enabled: boolean;
  code: string | null;
  coinsPerReferral: number;
  friendCoins: number;
  validityDays: number;
  totals: { joined: number; rewarded: number; coinsEarned: number; waiting: number };
  history: { id: string; friend: string; status: "PENDING" | "REWARDED" | "HELD" | "REJECTED" | "REVERSED"; statusText: string; coins: number; createdAt: string }[];
}

const TONE: Record<Overview["history"][number]["status"], string> = {
  PENDING: "text-muted-foreground",
  HELD: "text-brand-amber-text",
  REWARDED: "text-success",
  REJECTED: "text-muted-foreground",
  REVERSED: "text-destructive",
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// Three-dot menu → Refer and Earn (client requirements of 6 Nov 2026): the
// student's link to copy or share, the rules, and who joined with it.
export function ReferView() {
  const signedIn = useRequireSignIn();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    const device = deviceId();
    apiJson<Overview>("/api/users/me/referrals", { headers: device ? { "X-Device-Id": device } : {} })
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
    const id = setTimeout(() => setCanShare(typeof navigator.share === "function"), 0);
    return () => clearTimeout(id);
  }, [signedIn]);

  if (error) return <p role="alert" className="card-3d rounded-2xl p-4 text-destructive">{error}</p>;
  if (!data) return <div className="card-3d h-48 animate-pulse rounded-3xl" aria-hidden="true" />;
  if (!data.enabled || !data.code) {
    return (
      <div className="card-3d grid justify-items-center gap-2 rounded-3xl px-6 py-12 text-center">
        <GiftIcon className="size-10 text-brand-amber-text" aria-hidden="true" />
        <p className="font-heading text-xl font-bold">Refer and Earn isn&apos;t open right now</p>
        <p className="text-muted-foreground">Check back soon.</p>
      </div>
    );
  }

  const link = referralLink(window.location.origin, data.code);
  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : data.code!);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };
  const share = () =>
    navigator
      .share({ title: "Class Course", text: "Learn every chapter, take quizzes and earn coins on Class Course. Join with my link:", url: link })
      .catch(() => undefined);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-3xl bg-[image:var(--header-bg)] p-5 text-brand-ink shadow-[var(--header-shadow)] sm:p-6 dark:text-brand-cream">
        <div className="flex items-start gap-3">
          <GiftIcon className="size-10 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-heading text-2xl font-extrabold leading-tight">
              {data.coinsPerReferral > 0 ? `Get ${data.coinsPerReferral} coins for every friend who joins` : "Invite your friends to Class Course"}
            </p>
            {data.friendCoins > 0 && <p className="mt-1 font-semibold">Your friend gets {data.friendCoins} welcome coins too.</p>}
          </div>
        </div>
        <div className="grid gap-2 rounded-2xl bg-white/60 p-3 dark:bg-black/20">
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">Your link</p>
          <p translate="no" className="notranslate break-all font-semibold">{link}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy("link")} className="press-3d inline-flex h-11 items-center gap-2 rounded-xl px-4 font-bold">
              {copied === "link" ? <CheckIcon className="size-5" /> : <CopyIcon className="size-5" />} <span key={copied ?? "x"}>{copied === "link" ? "Copied" : "Copy link"}</span>
            </button>
            {canShare && (
              <button type="button" onClick={() => void share()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-brand-ink/20 bg-white px-4 font-bold text-brand-ink dark:bg-white/10 dark:text-brand-cream">
                <Share2Icon className="size-5" /> Share
              </button>
            )}
            <button type="button" onClick={() => void copy("code")} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 font-semibold underline-offset-4 hover:underline">
              Code <span translate="no" className="notranslate font-mono tracking-widest">{data.code}</span> {copied === "code" && <CheckIcon className="size-4" />}
            </button>
          </div>
        </div>
      </section>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { icon: UsersIcon, label: "Friends joined", value: data.totals.joined },
          { icon: CheckIcon, label: "Rewarded", value: data.totals.rewarded },
          { icon: CoinsIcon, label: "Coins earned", value: data.totals.coinsEarned },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card-3d rounded-2xl p-3 sm:p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:text-sm"><Icon className="size-4 shrink-0 text-brand-amber-text" aria-hidden="true" /> {label}</dt>
            <dd className="font-heading text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="how-title" className="card-3d rounded-2xl p-5">
        <h2 id="how-title" className="font-heading text-lg font-bold">How it works</h2>
        <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-[15px]">
          <li>Share your link with a friend who isn&apos;t on Class Course yet.</li>
          <li>They sign up with it and enter the code we email them.</li>
          <li>You get your coins{data.coinsPerReferral > 0 ? ` (${data.coinsPerReferral})` : ""}. Use them for money off notes. Coins are valid for {data.validityDays} days.</li>
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">
          Each email counts once. Fake or repeated accounts don&apos;t earn coins, and coins from them can be taken back. Some sign-ups are checked by our team first.
        </p>
      </section>

      <section aria-labelledby="joined-title">
        <h2 id="joined-title" className="mb-3 font-heading text-xl font-extrabold">Friends who joined</h2>
        {data.history.length === 0 ? (
          <p className="card-3d rounded-2xl p-4 text-muted-foreground">Nobody yet. Share your link to get started.</p>
        ) : (
          <ul className="card-3d divide-y overflow-hidden rounded-2xl">
            {data.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.friend}</span>
                  <span className={cn("block text-sm", TONE[h.status])}>
                    <span key={h.statusText}>{h.statusText}</span> · {day(h.createdAt)}
                  </span>
                </span>
                {h.coins > 0 && <span className="font-heading text-lg font-extrabold tabular-nums text-success">+{h.coins}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
