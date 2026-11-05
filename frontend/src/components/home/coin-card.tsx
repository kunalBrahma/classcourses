"use client";

import Link from "next/link";
import { Coin3D } from "@/components/kit/coin";
import { useMe, useSignedIn } from "@/components/site/account-menu";

// The mock's reward strip: coin, "120 Coins Earned", "Win quizzes, get
// discounts", and a white Redeem pill (coins are spent as money off notes).
// Guests see an invitation instead of a made-up number.
export function CoinCard() {
  const signedIn = useSignedIn();
  const me = useMe();
  const title = signedIn ? (me ? `${me.coins} Coins Earned` : "Your Coins") : "Earn Coins";
  const pill =
    "ml-auto inline-flex min-h-11 max-w-[45%] items-center justify-center rounded-[18px] bg-white px-5 py-1 text-center font-extrabold leading-tight text-brand-ink shadow-[0_3px_0_var(--press-edge)] transition active:translate-y-0.5 active:shadow-[0_1px_0_var(--press-edge)]";

  return (
    <section
      id="rewards"
      aria-label="Your coins"
      className="scroll-mt-24 flex items-center gap-3 rounded-3xl bg-[image:var(--header-bg)] px-4 py-3.5 text-brand-ink shadow-[var(--header-shadow)] dark:text-brand-cream"
    >
      <Coin3D />
      <div className="min-w-0 flex-1">
        {/* key: a new element when the words change, so Google Translate picks them up. */}
        <p key={title} className="font-heading text-lg font-extrabold leading-tight tabular-nums">
          {title}
        </p>
        <p className="text-sm">Win quizzes, get discounts</p>
      </div>
      {signedIn ? (
        <Link href="/notes" className={pill}>
          Redeem
        </Link>
      ) : (
        <Link href="/register" className={pill}>
          Join Free
        </Link>
      )}
    </section>
  );
}
