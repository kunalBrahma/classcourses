"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { useConfirm } from "@/components/admin/confirm";
import { CashfreeSettings } from "@/components/admin/payments/cashfree-settings";
import { RazorpaySettings } from "@/components/admin/payments/razorpay-settings";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type Provider = "cashfree" | "razorpay";

// Settings → Payments: which gateway new orders use (Cashfree at launch) and
// each gateway's keys. A note unlocks only after the server confirms the
// payment with the gateway.
export default function PaymentsSettingsPage() {
  const confirm = useConfirm();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson<{ setting: { value: { provider: Provider } } }>("/api/admin/settings/payments")
      .then(({ setting }) => setProvider(setting.value.provider))
      .catch((err: ApiError) => toast.error(err.message));
  }, []);

  const choose = async (next: Provider) => {
    if (next === provider) return;
    const ok = await confirm({
      title: `Take payments with ${next === "cashfree" ? "Cashfree" : "Razorpay"}?`,
      description: "New checkouts use it straight away. Orders already started keep their own gateway. Make sure its keys are saved and tested below.",
      confirmLabel: "Switch",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const { setting } = await apiJson<{ setting: { value: { provider: Provider } } }>("/api/admin/settings/payments", { method: "PUT", json: { provider: next } });
      setProvider(setting.value.provider);
      toast.success(`New payments now go through ${next === "cashfree" ? "Cashfree" : "Razorpay"}`);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Payments" description="Choose the payment gateway for premium notes and save its keys. A note is only unlocked after the server confirms the payment with the gateway." />

      {provider === null ? (
        <Skeleton className="h-36 rounded-2xl" />
      ) : (
        <Card className={formCard}>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Gateway for new payments</CardTitle>
            <CardDescription>Cashfree is the gateway at launch. Razorpay stays here, switched off, until its KYC is done.</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Payment gateway" className="grid gap-2 sm:grid-cols-2">
              {(["cashfree", "razorpay"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={provider === p}
                  disabled={saving}
                  onClick={() => void choose(p)}
                  className={cn("flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition", provider === p ? "border-primary/60 bg-primary/10" : "hover:bg-muted/50")}
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", provider === p ? "border-primary" : "border-muted-foreground/40")} aria-hidden="true">
                    {provider === p && <span className="size-2.5 rounded-full bg-primary" />}
                  </span>
                  <span>
                    <span className="block font-semibold">{p === "cashfree" ? "Cashfree" : "Razorpay"}</span>
                    <span className="block text-xs text-muted-foreground">{provider === p ? "New payments go here" : "Not in use"}</span>
                  </span>
                  {saving && provider !== p && <Loader2Icon className="ml-auto size-4 animate-spin" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {provider === "razorpay" ? (
        <>
          <RazorpaySettings />
          <CashfreeSettings />
        </>
      ) : (
        <>
          <CashfreeSettings />
          <RazorpaySettings />
        </>
      )}
    </div>
  );
}
