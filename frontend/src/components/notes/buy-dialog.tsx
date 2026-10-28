"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { CheckCircle2Icon, Loader2Icon, LockIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Coin3D } from "@/components/kit/coin";
import { rupees } from "@/components/kit/note-card";
import { announceCoinsChanged } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { announceNotesChanged, CheckoutOptions, downloadNote, loadRazorpay, NoteItem, OrderView, PriceQuote } from "@/lib/notes";
import { cn } from "@/lib/utils";

type Step =
  | { kind: "quote" }
  | { kind: "paying" } // Razorpay window open
  | { kind: "verifying" }
  | { kind: "pending"; orderId: string } // paid, waiting for Razorpay to confirm
  | { kind: "paid" }
  | { kind: "closed" } // student closed the payment window
  | { kind: "error"; message: string };

const POLL_MS = 2500;
const POLL_LIMIT = 48; // ~2 minutes; the webhook finishes later if needed

// Buying one note. Prices come from the server's quote; the note unlocks only
// when the SERVER says the order is PAID (verified payment, webhook or coins).
export function BuyDialog({ note, open, onOpenChange, initialUseCoins = true }: {
  note: NoteItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Use coins for discount" opens with coins on; "Pay & Download" without. */
  initialUseCoins?: boolean;
}) {
  const id = useId();
  const [quote, setQuote] = useState<{ withoutCoins: PriceQuote; withCoins: PriceQuote } | null>(null);
  const [useCoins, setUseCoins] = useState(initialUseCoins);
  const [step, setStep] = useState<Step>({ kind: "quote" });
  const [downloading, setDownloading] = useState(false);

  // Fresh quote each time the window opens ("previous target" reset, no effect setState).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuote(null);
      setStep({ kind: "quote" });
    }
  }
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiJson<{ withoutCoins: PriceQuote; withCoins: PriceQuote }>(`/api/notes/${note.id}/quote`)
      .then((q) => !cancelled && setQuote(q))
      .catch((err: ApiError) => !cancelled && setStep({ kind: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [open, note.id]);

  const finishPaid = useCallback(() => {
    setStep({ kind: "paid" });
    announceNotesChanged();
    announceCoinsChanged();
  }, []);

  // PENDING: ask the server until the order is PAID.
  useEffect(() => {
    if (step.kind !== "pending") return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const { order } = await apiJson<{ order: OrderView }>(`/api/payments/orders/${step.orderId}`);
        if (order.status === "PAID") {
          clearInterval(timer);
          finishPaid();
        } else if (order.status === "CANCELLED" || tries >= POLL_LIMIT) {
          clearInterval(timer);
          setStep({
            kind: "error",
            message:
              order.status === "CANCELLED"
                ? "This payment was cancelled. No money was taken."
                : "Your payment is still being confirmed. If money was taken, the note unlocks on its own within a few minutes. Check My profile → My notes.",
          });
        }
      } catch {
        /* keep trying until the limit */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [step, finishPaid]);

  const chosen = quote ? (useCoins ? quote.withCoins : quote.withoutCoins) : null;
  const canUseCoins = !!quote && quote.withCoins.coinsUsed > 0;

  const pay = async () => {
    if (!chosen) return;
    setStep({ kind: "paying" });
    try {
      const { order, checkout } = await apiJson<{ order: OrderView; checkout: CheckoutOptions | null }>("/api/payments/orders", {
        method: "POST",
        json: { noteId: note.id, useCoins: useCoins && canUseCoins },
      });
      if (!checkout) {
        // Coins covered the whole price: the server already granted it.
        if (order.status === "PAID") finishPaid();
        else setStep({ kind: "pending", orderId: order.id });
        return;
      }
      const Razorpay = await loadRazorpay();
      const rzp = new Razorpay({
        key: checkout.keyId,
        order_id: checkout.razorpayOrderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: checkout.name,
        description: checkout.description,
        prefill: checkout.prefill,
        theme: { color: "#f5a623" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          setStep({ kind: "verifying" });
          try {
            const result = await apiJson<{ status: "PAID" | "PENDING"; order: OrderView }>("/api/payments/verify", {
              method: "POST",
              json: { orderId: order.id, ...resp },
            });
            if (result.status === "PAID") finishPaid();
            else setStep({ kind: "pending", orderId: order.id });
          } catch (err) {
            // The webhook may still confirm it: keep checking.
            setStep(err instanceof ApiError && err.status === 400 ? { kind: "error", message: err.message } : { kind: "pending", orderId: order.id });
          }
        },
        modal: { ondismiss: () => setStep((s) => (s.kind === "paying" ? { kind: "closed" } : s)) },
      });
      rzp.on("payment.failed", (r) => setStep({ kind: "error", message: r.error?.description || "The payment didn't go through. No money was taken." }));
      rzp.open();
    } catch (err) {
      setStep({ kind: "error", message: (err as Error).message });
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadNote(note.id);
    } catch (err) {
      setStep({ kind: "error", message: (err as ApiError).message });
    } finally {
      setDownloading(false);
    }
  };

  const busy = step.kind === "paying" || step.kind === "verifying" || step.kind === "pending";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 font-heading text-xl leading-snug" lang="as">
            {note.title}
          </DialogTitle>
          <DialogDescription>{step.kind === "paid" ? "It's yours! Download it any time from My profile." : "Premium notes (PDF). Pay once, download any time."}</DialogDescription>
        </DialogHeader>

        {step.kind === "paid" ? (
          <div className="grid gap-4 text-center">
            <CheckCircle2Icon className="mx-auto size-14 text-success" aria-hidden="true" />
            <button type="button" onClick={download} disabled={downloading} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-success font-bold text-white">
              {downloading && <Loader2Icon className="size-5 animate-spin" />} Download PDF
            </button>
          </div>
        ) : !quote && step.kind === "quote" ? (
          <Loader2Icon className="mx-auto my-6 size-8 animate-spin text-brand-amber-text" aria-label="Getting the price" />
        ) : (
          <div className="grid gap-4">
            {chosen && (
              <div className="rounded-2xl bg-secondary/70 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-heading text-2xl font-extrabold tabular-nums">
                    {chosen.discountPaise > 0 && <span className="mr-2 text-base font-semibold text-muted-foreground line-through">{rupees(chosen.listPricePaise)}</span>}
                    {chosen.amountPaise === 0 ? "Free with coins" : rupees(chosen.amountPaise)}
                  </span>
                </div>
                {canUseCoins && (
                  <label htmlFor={`${id}-coins`} className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl bg-card px-3 py-2.5">
                    <Coin3D className="size-8 text-xs" />
                    <span className="min-w-0 flex-1 text-[15px]">
                      <span className="block font-semibold">Use {quote!.withCoins.coinsUsed} coins</span>
                      <span className="block text-sm text-muted-foreground">
                        Save {rupees(quote!.withCoins.discountPaise)} · you have {quote!.withCoins.coinBalance}
                      </span>
                    </span>
                    <Switch id={`${id}-coins`} checked={useCoins} onCheckedChange={setUseCoins} disabled={busy} />
                  </label>
                )}
                {!canUseCoins && quote && quote.withoutCoins.coinBalance > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">Coins can&apos;t be used on this note.</p>
                )}
              </div>
            )}

            {step.kind === "closed" && (
              <p className="rounded-xl bg-accent px-4 py-3 text-[15px]">Payment not finished. No money was taken. Coins you chose come back on their own.</p>
            )}
            {step.kind === "error" && (
              <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
                {step.message}
              </p>
            )}
            {(step.kind === "verifying" || step.kind === "pending") && (
              <p role="status" className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-[15px]">
                <Loader2Icon className="size-5 shrink-0 animate-spin" /> Confirming your payment… please don&apos;t close this page.
              </p>
            )}

            <button
              type="button"
              onClick={pay}
              disabled={!chosen || busy}
              className={cn("press-3d inline-flex h-14 items-center justify-center gap-2 rounded-2xl text-lg font-bold disabled:opacity-60")}
            >
              {busy ? <Loader2Icon className="size-5 animate-spin" /> : <LockIcon className="size-5" />}
              {chosen?.amountPaise === 0 ? "Get it with coins" : chosen ? `Pay ${rupees(chosen.amountPaise)}` : "Pay"}
            </button>
            <p className="text-center text-xs text-muted-foreground">Secure payment by Razorpay: UPI, cards and net banking.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
