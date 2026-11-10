"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import {
  Loader2Icon,
  MailIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdmin } from "@/components/admin/session";
import { formCard, inputClass } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import {
  CONSENT_BADGE,
  ConsentAdmin,
  formatDate,
  UserDetail,
} from "@/lib/people";

// Users → a student under 18: the parent's permission (client requirements of
// 6 Nov 2026). Anyone with Students can see it and send the link again; only
// the Super Admin records or withdraws consent.
export function ConsentCard({ user }: { user: UserDetail }) {
  const id = useId();
  const me = useAdmin();
  const isSuper = me.adminLevel !== "HELPER";
  const [data, setData] = useState<ConsentAdmin | null>(null);
  const [dialog, setDialog] = useState<"record" | "withdraw" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    parentEmail: "",
    parentName: "",
    relationship: "parent" as "parent" | "guardian",
    note: "",
  });

  const load = useCallback(() => {
    apiJson<ConsentAdmin>(`/api/admin/users/${user.id}/consent`)
      .then(setData)
      .catch(() => setData(null));
  }, [user.id]);
  useEffect(load, [load]);

  if (user.role !== "STUDENT" || !data || (!data.required && !data.record))
    return null;
  const record = data.record;
  const status = record?.status ?? "NONE";
  const badge = CONSENT_BADGE[status];

  const open = (which: "record" | "withdraw") => {
    setForm({
      parentEmail: record?.parentEmail ?? "",
      parentName: record?.parentName ?? "",
      relationship: (record?.relationship as "parent" | "guardian") ?? "parent",
      note: "",
    });
    setError(null);
    setDialog(which);
  };

  const run = async (key: string, path: string, json?: object) => {
    setBusy(key);
    setError(null);
    try {
      const res = await apiJson<ConsentAdmin & { message: string }>(path, {
        method: "POST",
        json,
      });
      setData(res);
      toast.success(res.message);
      setDialog(null);
    } catch (err) {
      const message = (err as ApiError).message;
      if (dialog) setError(message);
      else toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const noteOk = form.note.trim().length >= 5;
  const recordOk =
    noteOk &&
    /\S+@\S+\.\S+/.test(form.parentEmail) &&
    form.parentName.trim().length >= 2;

  return (
    <Card className={formCard}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 font-heading text-lg">
            Parent&apos;s permission{" "}
            <Badge variant={badge.variant} className={badge.className}>
              {badge.label}
            </Badge>
          </CardTitle>
          <CardDescription className="mt-1">
            {data.fullAccess
              ? "This student can take quizzes and buy notes."
              : data.block === "NO_DATE_OF_BIRTH"
                ? "No date of birth yet, so quizzes and buying are off."
                : "Under 18: quizzes and buying notes stay off until a parent or guardian agrees."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {record && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                Parent&apos;s email
              </dt>
              <dd className="break-all font-medium">{record.parentEmail}</dd>
            </div>
            {record.parentName && (
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="font-medium">
                  {record.parentName}
                  {record.relationship && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {record.relationship}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {status === "PENDING" && (
              <div>
                <dt className="text-xs text-muted-foreground">Link sent</dt>
                <dd>
                  {formatDate(record.lastSentAt, true)} ({record.sendCount}×) ·{" "}
                  {new Date(record.expiresAt) <= new Date()
                    ? "expired"
                    : `valid until ${formatDate(record.expiresAt, true)}`}
                </dd>
              </div>
            )}
            {record.decidedAt && (
              <div>
                <dt className="text-xs text-muted-foreground">Answered</dt>
                <dd>
                  {formatDate(record.decidedAt, true)} ·{" "}
                  {record.decidedVia === "admin"
                    ? "recorded by an admin"
                    : "by the parent's link"}
                </dd>
              </div>
            )}
            {record.decidedVia === "parent_link" && record.decidedIp && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">From</dt>
                <dd className="break-all text-xs text-muted-foreground">
                  {record.decidedIp}
                  {record.decidedUserAgent && ` · ${record.decidedUserAgent}`}
                </dd>
              </div>
            )}
            {record.adminNote && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Admin note</dt>
                <dd>{record.adminNote}</dd>
              </div>
            )}
          </dl>
        )}
        {!record && (
          <p className="text-sm text-muted-foreground">
            The student hasn&apos;t given a parent&apos;s email yet.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {record && status !== "GRANTED" && (
            <Button
              variant="outline"
              className="h-10"
              disabled={busy !== null}
              onClick={() =>
                void run("resend", `/api/admin/users/${user.id}/consent/resend`)
              }
            >
              {busy === "resend" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <MailIcon />
              )}{" "}
              Send the link again
            </Button>
          )}
          {isSuper && data.required && status !== "GRANTED" && (
            <Button
              variant="outline"
              className="h-10"
              onClick={() => open("record")}
            >
              <ShieldCheckIcon /> Record permission
            </Button>
          )}
          {isSuper && status === "GRANTED" && (
            <Button
              variant="outline"
              className="h-10 text-destructive hover:text-destructive"
              onClick={() => open("withdraw")}
            >
              <ShieldOffIcon /> Withdraw permission
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && !busy && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {dialog === "record"
                ? "Record a parent's permission"
                : "Withdraw the permission?"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "record"
                ? "Only when the parent or guardian agreed another way (e.g. wrote to the Helpline from their own email). The account becomes fully active."
                : "When the parent or guardian takes it back. Quizzes and buying notes switch off straight away; notes already bought stay."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {dialog === "record" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-pe`} className="text-sm font-semibold">
                    Parent&apos;s email
                  </Label>
                  <Input
                    id={`${id}-pe`}
                    type="email"
                    value={form.parentEmail}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, parentEmail: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`${id}-pn`}
                      className="text-sm font-semibold"
                    >
                      Their name
                    </Label>
                    <Input
                      id={`${id}-pn`}
                      value={form.parentName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, parentName: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`${id}-rel`}
                      className="text-sm font-semibold"
                    >
                      They are the
                    </Label>
                    <select
                      id={`${id}-rel`}
                      value={form.relationship}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          relationship: e.target.value as "parent" | "guardian",
                        }))
                      }
                      className="h-10 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                    >
                      <option value="parent">Parent</option>
                      <option value="guardian">Guardian</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor={`${id}-note`} className="text-sm font-semibold">
                {dialog === "record" ? "How they gave permission" : "Reason"}
              </Label>
              <Textarea
                id={`${id}-note`}
                rows={3}
                maxLength={500}
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                className="text-base"
                placeholder={
                  dialog === "record"
                    ? "E.g. “Mother emailed the Helpline on 12 Nov”"
                    : "E.g. “Father asked on 20 Nov”"
                }
              />
              <p className="text-xs text-muted-foreground">
                Kept with the record and in the activity log.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-10"
              disabled={busy !== null}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            {dialog === "record" ? (
              <Button
                className="h-10"
                disabled={busy !== null || !recordOk}
                onClick={() =>
                  void run(
                    "record",
                    `/api/admin/users/${user.id}/consent/record`,
                    {
                      ...form,
                      parentName: form.parentName.trim(),
                      note: form.note.trim(),
                    },
                  )
                }
              >
                {busy === "record" && <Loader2Icon className="animate-spin" />}{" "}
                Record permission
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="h-10"
                disabled={busy !== null || !noteOk}
                onClick={() =>
                  void run(
                    "withdraw",
                    `/api/admin/users/${user.id}/consent/withdraw`,
                    { note: form.note.trim() },
                  )
                }
              >
                {busy === "withdraw" && (
                  <Loader2Icon className="animate-spin" />
                )}{" "}
                Withdraw
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
