"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GiftIcon } from "lucide-react";
import { publicJson } from "@/lib/api";
import { rememberReferral, storedReferral } from "@/lib/referral";

// Sign-up page: "Rohan invited you". Remembers the code from ?ref= for the
// sign-up (or a Google sign-up) and shows who invited them.
export function InviteNote() {
  const ref = useSearchParams().get("ref");
  const [invite, setInvite] = useState<{ inviterFirstName: string; friendCoins: number } | null>(null);

  useEffect(() => {
    if (ref) rememberReferral(ref);
    const code = storedReferral();
    if (!code) return;
    let cancelled = false;
    publicJson<{ valid: boolean; inviterFirstName?: string; friendCoins?: number }>(`/api/referrals/invite/${encodeURIComponent(code)}`)
      .then((r) => !cancelled && r.valid && setInvite({ inviterFirstName: r.inviterFirstName!, friendCoins: r.friendCoins ?? 0 }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (!invite) return null;
  return (
    <p role="status" className="flex items-start gap-3 rounded-xl bg-accent px-4 py-3 text-[15px]">
      <GiftIcon className="mt-0.5 size-5 shrink-0 text-brand-amber-text" aria-hidden="true" />
      <span>
        <strong>{invite.inviterFirstName}</strong> invited you to Class Course.
        {invite.friendCoins > 0 && ` Verify your email to get ${invite.friendCoins} welcome coins.`}
      </span>
    </p>
  );
}
