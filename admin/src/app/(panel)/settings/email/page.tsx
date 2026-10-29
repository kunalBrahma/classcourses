"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, MailIcon, RotateCcwIcon, SendIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/page-header";
import { Field, SecretInput } from "@/components/admin/settings/field";
import { SettingSource, SourceBadge } from "@/components/admin/settings/source-badge";
import { TestResult, TestResultData } from "@/components/admin/settings/test-result";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { useAdmin } from "@/components/admin/session";
import { ApiError, apiJson } from "@/lib/api";
import { useConfirm } from "@/components/admin/confirm";

interface SmtpValue {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  passwordMasked: string | null;
  hasPassword: boolean;
}

interface SmtpView {
  source: SettingSource;
  value: SmtpValue | null;
}

interface Form {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}

const EMPTY: Form = { host: "", port: 587, secure: false, user: "", password: "", fromName: "Class Course", fromEmail: "", replyTo: "" };

const toForm = (v: SmtpValue | null): Form =>
  v
    ? {
        host: v.host,
        port: v.port,
        secure: v.secure,
        user: v.user ?? "",
        password: "",
        fromName: v.fromName,
        fromEmail: v.fromEmail,
        replyTo: v.replyTo ?? "",
      }
    : EMPTY;

// Common providers; the admin still enters their own username + app password.
const PRESETS = [
  { name: "Gmail", host: "smtp.gmail.com", port: 587, secure: false },
  { name: "Outlook", host: "smtp.office365.com", port: 587, secure: false },
  { name: "Zoho", host: "smtp.zoho.in", port: 465, secure: true },
];

export default function EmailSettingsPage() {
  const id = useId();
  const admin = useAdmin();
  const confirm = useConfirm();
  const [current, setCurrent] = useState<SmtpView | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [testTo, setTestTo] = useState(admin.email);
  const [busy, setBusy] = useState<"save" | "test" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResultData | null>(null);

  useEffect(() => {
    apiJson<{ smtp: SmtpView }>("/api/admin/settings/smtp")
      .then(({ smtp }) => {
        setCurrent(smtp);
        setForm(toForm(smtp.value));
      })
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Port 465 = implicit TLS ("secure" on); 587 = STARTTLS ("secure" off).
  const setSecure = (secure: boolean) =>
    setForm((f) => ({ ...f, secure, port: secure && f.port === 587 ? 465 : !secure && f.port === 465 ? 587 : f.port }));

  const payload = () => ({ ...form, user: form.user || null, replyTo: form.replyTo || null });

  const run = async (action: "save" | "test" | "reset") => {
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      if (action === "test") {
        const { result } = await apiJson<{ result: TestResultData }>("/api/admin/settings/smtp/test", {
          method: "POST",
          json: { ...payload(), to: testTo || undefined },
        });
        setResult(result);
        if (result.ok) toast.success(`Test email sent to ${testTo || admin.email}`, { description: "Check the inbox (and spam folder)." });
      } else if (action === "save") {
        const data = await apiJson<{ smtp: SmtpView; result: TestResultData }>("/api/admin/settings/smtp", { method: "PUT", json: payload() });
        setCurrent(data.smtp);
        setForm(toForm(data.smtp.value));
        setResult(data.result);
        toast.success("Email settings saved");
      } else {
        if (
          !(await confirm({
            title: "Use the server's email settings?",
            description: "The settings saved here are removed and the values in the server's configuration file are used instead.",
            confirmLabel: "Reset",
            destructive: true,
          }))
        )
          return;
        const data = await apiJson<{ smtp: SmtpView }>("/api/admin/settings/smtp", { method: "DELETE" });
        setCurrent(data.smtp);
        setForm(toForm(data.smtp.value));
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

  const hasPassword = current?.value?.hasPassword ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description="SMTP account used for password resets and purchase receipts. Saving checks that the server accepts the login."
        actions={current && <SourceBadge source={current.source} />}
      />

      {!current ? (
        error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load email settings</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-[620px] rounded-2xl" />
        )
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          {current.source === "none" && (
            <Alert>
              <MailIcon />
              <AlertTitle>Email isn&apos;t set up yet</AlertTitle>
              <AlertDescription>
                Until it is, emails are only printed in the server log in development, and fail in production. Use your business mailbox (Gmail and
                Outlook need an <strong>app password</strong>, not your normal password).
              </AlertDescription>
            </Alert>
          )}

          <Card className={formCard}>
            <CardHeader>
              <CardTitle className="font-heading text-lg">SMTP server</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                Quick fill:
                {PRESETS.map((p) => (
                  <Button
                    key={p.name}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setForm((f) => ({ ...f, host: p.host, port: p.port, secure: p.secure }))}
                  >
                    {p.name}
                  </Button>
                ))}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-[1fr_130px]">
                <Field id={`${id}-host`} label="Host">
                  <Input
                    id={`${id}-host`}
                    className={inputClass}
                    value={form.host}
                    onChange={(e) => set("host", e.target.value)}
                    placeholder="smtp.example.com"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </Field>
                <Field id={`${id}-port`} label="Port">
                  <Input
                    id={`${id}-port`}
                    className={inputClass}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(e) => set("port", Number(e.target.value))}
                    required
                  />
                </Field>
              </div>

              <label
                htmlFor={`${id}-secure`}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3"
              >
                <span>
                  <span className="block text-sm font-semibold">Use SSL/TLS from the start</span>
                  <span className="block text-xs text-muted-foreground">On for port 465. Off for 587 (upgrades with STARTTLS).</span>
                </span>
                <Switch id={`${id}-secure`} checked={form.secure} onCheckedChange={setSecure} />
              </label>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={`${id}-user`} label="Username">
                  <Input
                    id={`${id}-user`}
                    className={inputClass}
                    value={form.user}
                    onChange={(e) => set("user", e.target.value)}
                    placeholder="usually your email address"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </Field>
                <Field
                  id={`${id}-password`}
                  label="Password / app password"
                  hint={hasPassword ? "Leave blank to keep the saved password. Stored encrypted." : "Stored encrypted."}
                >
                  <SecretInput
                    id={`${id}-password`}
                    value={form.password}
                    onChange={(v) => set("password", v)}
                    placeholder={current.value?.passwordMasked ?? "App password"}
                    hasHint
                  />
                </Field>
              </div>

              <Separator />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={`${id}-from-name`} label="Sender name">
                  <Input id={`${id}-from-name`} className={inputClass} value={form.fromName} onChange={(e) => set("fromName", e.target.value)} required />
                </Field>
                <Field id={`${id}-from-email`} label="Sender email" hint="Must be allowed to send from this account.">
                  <Input
                    id={`${id}-from-email`}
                    className={inputClass}
                    type="email"
                    inputMode="email"
                    value={form.fromEmail}
                    onChange={(e) => set("fromEmail", e.target.value)}
                    placeholder="no-reply@classcourse.in"
                    autoCapitalize="none"
                    required
                  />
                </Field>
              </div>
              <Field id={`${id}-reply`} label="Reply-to (optional)" hint="Where student replies go, e.g. the support inbox.">
                <Input
                  id={`${id}-reply`}
                  className={inputClass}
                  type="email"
                  inputMode="email"
                  value={form.replyTo}
                  onChange={(e) => set("replyTo", e.target.value)}
                  autoCapitalize="none"
                />
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Something went wrong</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {result && <TestResult result={result} />}
            </CardContent>
            <CardFooter className="flex flex-col-reverse gap-2 border-t sm:flex-row sm:justify-between">
              {current.source === "database" ? (
                <Button type="button" variant="ghost" className={`${actionButton} text-destructive`} disabled={busy !== null} onClick={() => run("reset")}>
                  <RotateCcwIcon /> Use server values
                </Button>
              ) : (
                <span className="hidden sm:block" />
              )}
              <Button type="submit" className={pressable} disabled={busy !== null}>
                {busy === "save" && <Loader2Icon className="animate-spin" />} {busy === "save" ? "Checking & saving…" : "Save"}
              </Button>
            </CardFooter>
          </Card>

          <Card className={formCard}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <SendIcon className="size-5 text-brand-amber-text" /> Send a test email
              </CardTitle>
              <CardDescription>Uses the details above (saved or not), so you can try before saving.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field id={`${id}-to`} label="Send to" className="flex-1">
                <Input
                  id={`${id}-to`}
                  className={inputClass}
                  type="email"
                  inputMode="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  autoCapitalize="none"
                />
              </Field>
              <Button type="button" variant="outline" className={actionButton} disabled={busy !== null || !form.host} onClick={() => run("test")}>
                {busy === "test" ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send test
              </Button>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
