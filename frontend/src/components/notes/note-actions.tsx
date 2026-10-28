"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DownloadIcon, Loader2Icon, LockIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { ApiError } from "@/lib/api";
import { downloadNote, NoteItem, useOwnedNotes } from "@/lib/notes";

// The buy window (Radix dialog + Razorpay code) loads only when Buy is tapped.
const BuyDialog = dynamic(() => import("@/components/notes/buy-dialog").then((m) => m.BuyDialog), { ssr: false });

// Download (free or already bought) / Buy (premium) / Sign in (guests).
// Free notes also need an account (client question #27).
export function NoteActions({ note }: { note: NoteItem }) {
  const pathname = usePathname();
  const { signedIn, owned } = useOwnedNotes();
  // null = closed; otherwise whether the window opens with coins switched on.
  const [buying, setBuying] = useState<null | { coins: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="press-3d inline-flex h-11 items-center justify-center rounded-xl px-4 font-bold">
        {note.isFree ? "Sign in to download" : "Sign in to buy"}
      </Link>
    );
  }

  const canDownload = note.isFree || owned?.has(note.id);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadNote(note.id);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid w-full justify-items-end gap-1 sm:w-auto">
      {canDownload ? (
        <button type="button" onClick={download} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 font-bold text-white shadow-[0_3px_0_color-mix(in_oklch,var(--success),black_30%)] active:translate-y-0.5">
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <DownloadIcon className="size-4" />} Download
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setBuying({ coins: true })}
            disabled={owned === null}
            className="inline-flex min-h-11 items-center rounded-[12px] border-2 border-brand-amber px-3 text-sm font-bold text-brand-amber-text hover:bg-accent disabled:opacity-60"
          >
            Use coins for discount
          </button>
          <button
            type="button"
            onClick={() => setBuying({ coins: false })}
            disabled={owned === null}
            className="press-3d inline-flex h-11 items-center gap-2 rounded-xl px-4 font-bold disabled:opacity-60"
          >
            <LockIcon className="size-4" /> Pay &amp; Download
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="max-w-56 text-right text-sm text-destructive">
          {error}
        </p>
      )}
      {!note.isFree && buying && (
        <BuyDialog note={note} open initialUseCoins={buying.coins} onOpenChange={(open) => !open && setBuying(null)} />
      )}
    </div>
  );
}
