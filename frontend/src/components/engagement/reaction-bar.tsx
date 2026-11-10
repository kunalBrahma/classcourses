"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookmarkIcon, CheckIcon, HeartIcon, LinkIcon, Share2Icon } from "lucide-react";
import { useSignedIn } from "@/components/site/account-menu";
import { ApiError } from "@/lib/api";
import { getReactions, ReactionState, ReactionTarget, setReaction } from "@/lib/engagement";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold shadow-[0_2px_0_var(--border)] transition hover:bg-accent active:translate-y-px disabled:opacity-60";

// Like, Save and Share, directly under the heading of a chapter page or a blog
// post (client requirements of 6 Nov 2026). One like per account with the total;
// Save goes to Profile → Saved; Share uses the phone's share sheet, plus Copy link.
export function ReactionBar({ target, title, className }: { target: ReactionTarget; title: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = useSignedIn();
  const [state, setState] = useState<ReactionState | null>(null);
  const [busy, setBusy] = useState<"like" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const key = "chapterId" in target ? target.chapterId : target.blogPostId;

  useEffect(() => {
    let cancelled = false;
    getReactions("chapterId" in target ? { chapterId: key } : { blogPostId: key })
      .then((s) => !cancelled && setState(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the target is identified by its id
  }, [key, signedIn]);

  useEffect(() => {
    // Read after mounting: the server doesn't know the visitor's device
    const id = setTimeout(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), 0);
    return () => clearTimeout(id);
  }, []);

  const toggle = async (kind: "like" | "save") => {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!state) return;
    const on = kind === "like" ? !state.liked : !state.saved;
    // Show the change at once; the server's answer replaces it
    setState(kind === "like" ? { ...state, liked: on, likes: state.likes + (on ? 1 : -1) } : { ...state, saved: on });
    setBusy(kind);
    setMessage(null);
    try {
      setState(await setReaction(kind, target, on));
      if (kind === "save") setMessage(on ? "Saved to your profile" : "Removed from Saved");
    } catch (err) {
      setState(state);
      setMessage((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const url = () => window.location.href.split("#")[0];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setMessage("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Couldn't copy. Copy the address from your browser instead.");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title, url: url() });
    } catch {
      // Cancelled: nothing to do
    }
  };

  const likes = state?.likes ?? 0;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div role="group" aria-label="Like, save and share" className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void toggle("like")}
          disabled={busy === "like"}
          aria-pressed={state?.liked ?? false}
          aria-label={`${state?.liked ? "Unlike" : "Like"} (${likes} ${likes === 1 ? "like" : "likes"})`}
          className={cn(chip, state?.liked && "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-300")}
        >
          <HeartIcon className={cn("size-5", state?.liked && "fill-current")} aria-hidden="true" />
          <span key={likes} translate="no" className="notranslate tabular-nums">{state ? likes : "–"}</span>
        </button>
        <button
          type="button"
          onClick={() => void toggle("save")}
          disabled={busy === "save"}
          aria-pressed={state?.saved ?? false}
          className={cn(chip, state?.saved && "border-primary/50 bg-primary/15 text-brand-amber-text")}
        >
          <BookmarkIcon className={cn("size-5", state?.saved && "fill-current")} aria-hidden="true" />
          <span key={state?.saved ? "saved" : "save"}>{state?.saved ? "Saved" : "Save"}</span>
        </button>
        {canShare && (
          <button type="button" onClick={() => void share()} className={chip}>
            <Share2Icon className="size-5" aria-hidden="true" /> Share
          </button>
        )}
        <button type="button" onClick={() => void copy()} className={chip}>
          {copied ? <CheckIcon className="size-5 text-success" aria-hidden="true" /> : <LinkIcon className="size-5" aria-hidden="true" />}
          <span key={copied ? "c" : "n"}>{copied ? "Copied" : "Copy link"}</span>
        </button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {message && <span key={message}>{message}</span>}
      </p>
    </div>
  );
}
