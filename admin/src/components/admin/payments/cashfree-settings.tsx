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
import { Field, SecretInput } from "@/components/admin/settings/field";
import { SettingSource, SourceBadge } from "@/components/admin/settings/source-badge";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type Environment = "sandbox" | "production";
interface CashfreeView {
  source: SettingSource;
  webhookUrl: string;
  value: { appId: string; environment: Environment; secretKeyMasked: string | null; hasSecretKey: boolean } | null;
}
interface TestResult {
  ok: boolean;
  message: string | null;
  latencyMs: number;
}

const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));

export function EnvironmentBadge({ environment }: { environment: Environment | null | undefined }) {
  if (!environment) return null;
  return environment === "production" ? (
    <Badge className="bg-success text-white">PRODUCTION — real money</Badge>
  ) : (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
      SANDBOX (test)
    </Badge>
  );
}

// Cashfree keys (client requirements of 6 Nov 2026: the gateway at launch).
// The secret stays on the server, encrypted; saving checks the keys first.
export function CashfreeSettings() {
  const id = useId();
  const confirm = useConfirm();
  const [current, setCurrent] = useState<CashfreeView | null>(null);
  const [form, setForm] = useState<{ appId: string; secretKey: string; environment: Environment }>({ appId: "", secretKey: "", environment: "sandbox" });
  const [busy, setBusy] = useState<"save" | "test" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const apply = (view: CashfreeView) => {
    setCurrent(view);
    setForm({ appId: view.value?.appId ?? "", secretKey: "", environment: view.value?.environment ?? "sandbox" });
  };

  useEffect(() => {
    apiJson<{ cashfree: CashfreeView }>("/api/admin/settings/cashfree")
      .then(({ cashfree }) => apply(cashfree))
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const payload = () => ({ appId: form.appId.trim(), secretKey: form.secretKey, environment: form.environment });

  const run = async (action: "save" | "test" | "reset") => {
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      if (action === "test") {
        setResult((await apiJson<{ result: TestResult }>("/api/admin/settings/cashfree/test", { method: "POST", json: payload() })).result);
      } else if (action === "save") {
        if (
          form.environment === "production" &&
          current?.value?.environment !== "production" &&
          !(await confirm({
            title: "Switch to PRODUCTION payments?",
            description: "Students will be charged real money. Only do this after a sandbox purchase, a failed payment and a refund all worked end to end.",
            confirmLabel: "Use production keys",
          }))
        )
          return;
        const data = await apiJson<{ cashfree: CashfreeView; result: TestResult }>("/api/admin/settings/cashfree", { method: "PUT", json: payload() });
        apply(data.cashfree);
        setResult(data.result);
        toast.success("Cashfree settings saved");
      } else {
        if (!(await confirm({ title: "Use the server's Cashfree keys?", description: "The keys saved here are removed and the server's configuration is used instead.", confirmLabel: "Reset", destructive: true })))
          return;
        apply((await apiJson<{ cashfree: CashfreeView }>("/api/admin/settings/cashfree", { method: "DELETE" })).cashfree);
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

  if (!current) {
    return error ? (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load the Cashfree settings</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : (
      <Skeleton className="h-[440px] rounded-2xl" />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-xl font-bold">Cashfree</h2>
        <div className="flex flex-wrap gap-2">
          <EnvironmentBadge environment={current.value?.environment} />
          <SourceBadge source={current.source} />
        </div>
      </div>
      <form onSubmit={onSubmit}>
        <Card className={formCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <CreditCardIcon className="size-5 text-brand-amber-text" /> API keys
            </CardTitle>
            <CardDescription>
              Cashfree Dashboard → Developers → API Keys. Test with <strong>sandbox</strong> keys first; switch to production keys after testing. Never send
              keys by chat or email: type them here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {current.source === "none" && (
              <Alert>
                <CreditCardIcon />
                <AlertTitle>Cashfree isn&apos;t set up yet</AlertTitle>
                <AlertDescription>Students can browse premium notes but can&apos;t buy them until keys are saved here.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={`${id}-app`} label="App ID (client ID)">
                <Input
                  id={`${id}-app`}
                  className={cn(inputClass, "font-mono text-sm")}
                  value={form.appId}
                  onChange={(e) => setForm((f) => ({ ...f, appId: e.target.value }))}
                  placeholder="App ID"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </Field>
              <Field id={`${id}-secret`} label="Secret key" hint={current.value?.hasSecretKey ? "Leave blank to keep the saved key. Stored encrypted; it also checks webhooks." : "Required. Stored encrypted; it also checks webhooks."}>
                <SecretInput id={`${id}-secret`} value={form.secretKey} onChange={(v) => setForm((f) => ({ ...f, secretKey: v }))} placeholder={current.value?.secretKeyMasked ?? "Secret key"} hasHint />
              </Field>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">Environment</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["sandbox", "production"] as const).map((env) => (
                  <label key={env} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", form.environment === env ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50")}>
                    <input type="radio" name={`${id}-env`} className="mt-1 accent-[var(--primary)]" checked={form.environment === env} onChange={() => setForm((f) => ({ ...f, environment: env }))} />
                    <span>
                      <span className="block font-semibold">{env === "sandbox" ? "Sandbox (testing)" : "Production (real money)"}</span>
                      <span className="block text-xs text-muted-foreground">{env === "sandbox" ? "Test payments; no money moves." : "Students are charged. Use the live keys."}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
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
                    {result.ok ? `Cashfree accepted these ${form.environment} keys` : "Cashfree rejected these keys"}
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
              <Button type="button" variant="outline" className={actionButton} disabled={busy !== null || !form.appId} onClick={() => run("test")}>
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
            <WebhookIcon className="size-5 text-brand-amber-text" /> Webhook
          </CardTitle>
          <CardDescription>
            Cashfree calls this address when a payment or a refund completes, so notes unlock and refunds finish even if the student closes the tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Cashfree Dashboard → Developers → <strong className="text-foreground">Webhooks</strong> → Add webhook endpoint.
            </li>
            <li>Paste the URL below, choose version 2023-08-01, and turn on the Payment and Refund events.</li>
            <li>No extra secret is needed: Cashfree signs each call with your Secret key.</li>
          </ol>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{current.webhookUrl}</code>
            <Button type="button" size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => copy(current.webhookUrl, "Webhook URL")}>
              <CopyIcon /> Copy
            </Button>
          </div>
          {/localhost|127\.0\.0\.1/.test(current.webhookUrl) && <p className="text-xs text-warning">This is a local address: Cashfree can reach it only once the API is live on a public domain.</p>}
          <div className="flex flex-wrap gap-2">
            {["PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK", "REFUND_STATUS_WEBHOOK"].map((e) => (
              <Badge key={e} variant="secondary" className="font-mono">
                {e}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
