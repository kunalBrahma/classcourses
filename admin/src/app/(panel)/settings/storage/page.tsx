"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, HardDriveIcon, Loader2Icon, RotateCcwIcon, ShieldCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { Field, SecretInput } from "@/components/admin/settings/field";
import { SettingSource, SourceBadge } from "@/components/admin/settings/source-badge";
import { TestResult, TestResultData } from "@/components/admin/settings/test-result";
import { CorsHelp } from "@/components/admin/settings/cors-help";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { useConfirm } from "@/components/admin/confirm";

interface StorageView {
  source: SettingSource;
  endpoint: string;
  accessKeyId: string;
  secretAccessKeyMasked: string | null;
  hasSecret: boolean;
  bucket: string;
  privateBucket: string;
  publicUrl: string;
  signedUrlTtlSeconds: number;
}

type Form = Omit<StorageView, "source" | "secretAccessKeyMasked" | "hasSecret"> & { secretAccessKey: string };

const toForm = (s: StorageView): Form => ({
  endpoint: s.endpoint,
  accessKeyId: s.accessKeyId,
  secretAccessKey: "",
  bucket: s.bucket,
  privateBucket: s.privateBucket,
  publicUrl: s.publicUrl,
  signedUrlTtlSeconds: s.signedUrlTtlSeconds,
});

export default function StorageSettingsPage() {
  const id = useId();
  const confirm = useConfirm();
  const [current, setCurrent] = useState<StorageView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResultData | null>(null);

  useEffect(() => {
    apiJson<{ storage: StorageView }>("/api/admin/settings/storage")
      .then(({ storage }) => {
        setCurrent(storage);
        setForm(toForm(storage));
      })
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const run = async (action: "save" | "test" | "reset") => {
    if (!form) return;
    setBusy(action);
    setError(null);
    setResult(null);
    try {
      if (action === "test") {
        const { result } = await apiJson<{ result: TestResultData }>("/api/admin/settings/storage/test", { method: "POST", json: form });
        setResult(result);
      } else if (action === "save") {
        const data = await apiJson<{ storage: StorageView; result: TestResultData }>("/api/admin/settings/storage", { method: "PUT", json: form });
        setCurrent(data.storage);
        setForm(toForm(data.storage));
        setResult(data.result);
        toast.success("Storage settings saved", { description: "New uploads and downloads use them immediately." });
      } else {
        if (
          !(await confirm({
            title: "Use the server's storage settings?",
            description: "The settings saved here are removed and the values in the server's configuration file are used instead.",
            confirmLabel: "Reset",
            destructive: true,
          }))
        )
          return;
        const data = await apiJson<{ storage: StorageView }>("/api/admin/settings/storage", { method: "DELETE" });
        setCurrent(data.storage);
        setForm(toForm(data.storage));
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
        title="Storage"
        description="Cloudflare R2 holds images (public bucket) and premium note PDFs (private bucket). Every save is tested against R2 first."
        actions={current && <SourceBadge source={current.source} />}
      />

      {!form || !current ? (
        error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load storage settings</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-[560px] rounded-2xl" />
        )
      ) : (
        <form onSubmit={onSubmit}>
          <Card className={formCard}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <HardDriveIcon className="size-5 text-brand-amber-text" /> Connection
              </CardTitle>
              <CardDescription>Cloudflare dashboard → R2 → your bucket → Settings → S3 API.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <Field id={`${id}-endpoint`} label="S3 API endpoint">
                <Input
                  id={`${id}-endpoint`}
                  className={inputClass}
                  value={form.endpoint}
                  onChange={(e) => set("endpoint", e.target.value)}
                  placeholder="https://<account-id>.r2.cloudflarestorage.com"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={`${id}-key`} label="Access key ID">
                  <Input
                    id={`${id}-key`}
                    className={`${inputClass} font-mono text-sm`}
                    value={form.accessKeyId}
                    onChange={(e) => set("accessKeyId", e.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </Field>
                <Field
                  id={`${id}-secret`}
                  label="Secret access key"
                  hint={current.hasSecret ? "Leave blank to keep the saved secret. Stored encrypted." : "Required. Stored encrypted."}
                >
                  <SecretInput
                    id={`${id}-secret`}
                    value={form.secretAccessKey}
                    onChange={(v) => set("secretAccessKey", v)}
                    placeholder={current.secretAccessKeyMasked ?? "Paste the secret"}
                    hasHint
                  />
                </Field>
              </div>

              <Separator />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={`${id}-bucket`} label="Public bucket" hint="Images in questions and pages.">
                  <Input
                    id={`${id}-bucket`}
                    className={inputClass}
                    value={form.bucket}
                    onChange={(e) => set("bucket", e.target.value)}
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </Field>
                <Field
                  id={`${id}-private`}
                  label={
                    <span className="flex items-center gap-1.5">
                      Private bucket <ShieldCheckIcon className="size-3.5 text-success" />
                    </span>
                  }
                  hint="Premium note PDFs. Must NOT have public access. Paid notes can't be sold until this is set."
                >
                  <Input
                    id={`${id}-private`}
                    className={inputClass}
                    value={form.privateBucket}
                    onChange={(e) => set("privateBucket", e.target.value)}
                    placeholder="e.g. classcourse-notes"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </Field>
              </div>

              {!form.privateBucket && (
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertTriangleIcon className="text-warning" />
                  <AlertTitle>No private bucket yet</AlertTitle>
                  <AlertDescription>
                    Create a second R2 bucket with public access <strong>off</strong> and enter its name here before selling notes. The public
                    bucket can be read by anyone who knows a file&apos;s address.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
                <Field id={`${id}-public-url`} label="Public URL (optional)" hint="r2.dev address or a custom domain for the public bucket.">
                  <Input
                    id={`${id}-public-url`}
                    className={inputClass}
                    value={form.publicUrl}
                    onChange={(e) => set("publicUrl", e.target.value)}
                    placeholder="https://pub-xxxx.r2.dev"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </Field>
                <Field id={`${id}-ttl`} label="Download link lifetime" hint="Seconds (60 – 604800).">
                  <Input
                    id={`${id}-ttl`}
                    className={inputClass}
                    type="number"
                    min={60}
                    max={604800}
                    inputMode="numeric"
                    value={form.signedUrlTtlSeconds}
                    onChange={(e) => set("signedUrlTtlSeconds", Number(e.target.value))}
                  />
                </Field>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Not saved</AlertTitle>
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
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" className={actionButton} disabled={busy !== null} onClick={() => run("test")}>
                  {busy === "test" && <Loader2Icon className="animate-spin" />} Test connection
                </Button>
                <Button type="submit" className={pressable} disabled={busy !== null}>
                  {busy === "save" && <Loader2Icon className="animate-spin" />} {busy === "save" ? "Testing & saving…" : "Save"}
                </Button>
              </div>
            </CardFooter>
          </Card>
          <div className="mt-4">
            <CorsHelp />
          </div>
        </form>
      )}
    </div>
  );
}
