"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, CopyIcon, CreditCardIcon, Loader2Icon, RotateCcwIcon, WebhookIcon, XCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { Field, SecretInput } from "@/components/admin/settings/field";
import { SettingSource, SourceBadge } from "@/components/admin/settings/source-badge";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RazorpayView {
  source: SettingSource;
  mode: "test" | "live" | null;
  webhookUrl: string;
  value: { keyId: string; keySecretMasked: string | null; hasKeySecret: boolean; webhookSecretMasked: string | null; hasWebhookSecret: boolean } | null;
}

interface TestResult {
  ok: boolean;
  mode: "test" | "live";
  message: string | null;
  latencyMs: number;
}

const EVENTS = ["payment.captured", "payment.failed", "order.paid"];

const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));

function ModeBadge({ mode }: { mode: "test" | "live" | null }) {
  if (!mode) return null;
  return mode === "live" ? (
    <Badge className="bg-success text-white">LIVE — real money</Badge>
  ) : (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
      TEST mode
    </Badge>
  );
}

export default function PaymentsSettingsPage() {
  const id = useId();
  const confirm = useConfirm();
  const [current, setCurrent] = useState<RazorpayView | null>(null);
  const [form, setForm] = useState({ keyId: "", keySecret: "", webhookSecret: "" });
  const [busy, setBusy] = useState<"save" | "test" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const apply = (view: RazorpayView) => {
    setCurrent(view);
    setForm({ keyId: view.value?.keyId ?? "", keySecret: "", webhookSecret: "" });
  };

  useEffect(() => {
    apiJson<{ razorpay: RazorpayView }>("/api/admin/settings/razorpay")
      .then(({ razorpay }) => apply(razorpay))
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const typedMode = form.keyId.startsWith("rzp_live_") ? "live" : form.keyId.startsWith("rzp_test_") ? "test" : null;
  const payload = () => ({ keyId: form.keyId.trim(), keySecret: form.keySecret, webhookSecret: form.webhookSecret });

  const run = async (action: "save" | "test" | "reset") => {
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      if (action === "test") {
        const { result } = await apiJson<{ result: TestResult }>("/api/admin/settings/razorpay/test", { method: "POST", json: payload() });
        setResult(result);
      } else if (action === "save") {
        if (
          typedMode === "live" &&
          current?.mode !== "live" &&
          !(await confirm({
            title: "Switch to LIVE payments?",
            description: "Students will be charged real money. Make sure KYC is approved and a test-mode purchase worked end to end first.",
            confirmLabel: "Use live keys",
          }))
        )
          return;
        const data = await apiJson<{ razorpay: RazorpayView; result: TestResult }>("/api/admin/settings/razorpay", { method: "PUT", json: payload() });
        apply(data.razorpay);
        setResult(data.result);
        toast.success("Payment settings saved");
      } else {
        if (!(await confirm({ title: "Use the server's payment keys?", description: "The keys saved here are removed and the keys in the server's configuration file are used instead.", confirmLabel: "Reset", destructive: true })))
          return;
        const data = await apiJson<{ razorpay: RazorpayView }>("/api/admin/settings/razorpay", { method: "DELETE" });
        apply(data.razorpay);
        toast.success("Now using the server's values");
      }
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run("save");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Razorpay takes the payment for premium notes. A note is only unlocked after the server confirms the payment with Razorpay."
        actions={
          current && (
            <div className="flex flex-wrap gap-2">
              <ModeBadge mode={current.mode} />
              <SourceBadge source={current.source} />
            </div>
          )
        }
      />

      {!current ? (
        error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load payment settings</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-[520px] rounded-2xl" />
        )
      ) : (
        <>
          <form onSubmit={onSubmit}>
            <Card className={formCard}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-heading text-lg">
                  <CreditCardIcon className="size-5 text-primary" /> API keys
                </CardTitle>
                <CardDescription>Razorpay Dashboard → Account &amp; Settings → API Keys. Start with Test keys; switch to Live after KYC.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                {current.source === "none" && (
                  <Alert>
                    <CreditCardIcon />
                    <AlertTitle>Payments aren&apos;t set up yet</AlertTitle>
                    <AlertDescription>Students can browse notes but can&apos;t buy them until keys are saved here.</AlertDescription>
                  </Alert>
                )}
                <Field
                  id={`${id}-key`}
                  label={
                    <span className="flex items-center gap-2">
                      Key ID <ModeBadge mode={typedMode} />
                    </span>
                  }
                >
                  <Input
                    id={`${id}-key`}
                    className={cn(inputClass, "font-mono text-sm")}
                    value={form.keyId}
                    onChange={(e) => setForm((f) => ({ ...f, keyId: e.target.value }))}
                    placeholder="rzp_test_…"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    id={`${id}-secret`}
                    label="Key secret"
                    hint={current.value?.hasKeySecret ? "Leave blank to keep the saved secret. Stored encrypted." : "Required. Stored encrypted."}
                  >
                    <SecretInput
                      id={`${id}-secret`}
                      value={form.keySecret}
                      onChange={(v) => setForm((f) => ({ ...f, keySecret: v }))}
                      placeholder={current.value?.keySecretMasked ?? "Key secret"}
                      hasHint
                    />
                  </Field>
                  <Field
                    id={`${id}-wh`}
                    label="Webhook secret"
                    hint={current.value?.hasWebhookSecret ? "Leave blank to keep the saved secret." : "The secret you set when creating the webhook below."}
                  >
                    <SecretInput
                      id={`${id}-wh`}
                      value={form.webhookSecret}
                      onChange={(v) => setForm((f) => ({ ...f, webhookSecret: v }))}
                      placeholder={current.value?.webhookSecretMasked ?? "Webhook secret"}
                      hasHint
                    />
                  </Field>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Not saved</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {result && (
                  <div role="status" className={cn("flex gap-2 rounded-xl border p-4 text-sm", result.ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}>
                    {result.ok ? <CheckCircle2Icon className="size-5 shrink-0 text-success" /> : <XCircleIcon className="size-5 shrink-0 text-destructive" />}
                    <span>
                      <span className={cn("font-semibold", result.ok ? "text-success" : "text-destructive")}>
                        {result.ok ? `Razorpay accepted the ${result.mode} keys` : "Razorpay rejected these keys"}
                      </span>
                      <span className="ml-2 text-muted-foreground">{result.latencyMs} ms</span>
                      {result.message && <span className="block text-xs text-muted-foreground">{result.message}</span>}
                    </span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col-reverse gap-2 border-t sm:flex-row sm:justify-between">
                {current.source === "database" ? (
                  <Button type="button" variant="ghost" className={`${actionButton} text-destructive`} disabled={busy !== null} onClick={() => run("reset")}>
                    <RotateCcwIcon /> Use server values
                  </Button>
                ) : (
                  <span className="hidden sm:block" />
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" className={actionButton} disabled={busy !== null || !form.keyId} onClick={() => run("test")}>
                    {busy === "test" && <Loader2Icon className="animate-spin" />} Test keys
                  </Button>
                  <Button type="submit" className={pressable} disabled={busy !== null}>
                    {busy === "save" && <Loader2Icon className="animate-spin" />} {busy === "save" ? "Checking & saving…" : "Save"}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </form>

          <Card className={formCard}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <WebhookIcon className="size-5 text-primary" /> Webhook
              </CardTitle>
              <CardDescription>
                Razorpay calls this address when a payment completes — it unlocks notes even if the student closes the tab before returning.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Razorpay Dashboard → Account &amp; Settings → <strong className="text-foreground">Webhooks</strong> → Add new webhook.</li>
                <li>Paste the URL below, choose a secret, and tick the events listed.</li>
                <li>Save the same secret above as <strong className="text-foreground">Webhook secret</strong>.</li>
                <li>Keep <strong className="text-foreground">automatic capture</strong> on (Payment Capture settings).</li>
              </ol>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{current.webhookUrl}</code>
                <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => copy(current.webhookUrl, "Webhook URL")}>
                  <CopyIcon /> Copy
                </Button>
              </div>
              {/localhost|127\.0\.0\.1/.test(current.webhookUrl) && (
                <p className="text-xs text-warning">This is a local address — Razorpay can only reach it once the API is deployed on a public domain.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {EVENTS.map((e) => (
                  <Badge key={e} variant="secondary" className="font-mono">
                    {e}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
