"use client";

import { FormEvent, Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, MailIcon, SearchIcon, SendIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/admin/confirm";
import { PageHeader } from "@/components/admin/page-header";
import { useFilterParams } from "@/components/admin/quiz/filters";
import { Field } from "@/components/admin/settings/field";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { Notice, NOTICE_KIND } from "@/lib/engagement";
import { formatDate } from "@/lib/people";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string | null; email: string };

// Picks one student by name or email.
function StudentPicker({ value, onChange }: { value: Person | null; onChange: (p: Person | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiJson<{ users: Person[] }>(`/api/admin/users?role=STUDENT&pageSize=8&search=${encodeURIComponent(term)}`)
        .then((r) => !cancelled && setResults(r.users))
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-2.5">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{value.name || "No name"}</span>
          <span className="block truncate text-xs text-muted-foreground">{value.email}</span>
        </span>
        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Choose another student" onClick={() => onChange(null)}><XIcon /></Button>
      </div>
    );
  }
  const shown = q.trim().length >= 2 ? results : [];
  return (
    <div className="grid gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a student's name or email" aria-label="Find a student" className="h-10 pl-9" />
      </div>
      {shown.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} className="block w-full px-3 py-2 text-left hover:bg-muted/60">
                <span className="block truncate text-sm font-semibold">{p.name || "No name"}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && shown.length === 0 && <p className="text-xs text-muted-foreground">No student found yet.</p>}
    </div>
  );
}

function Compose({ preselect, onSent }: { preselect: Person | null; onSent: () => void }) {
  const id = useId();
  const [toAll, setToAll] = useState(!preselect);
  const [person, setPerson] = useState<Person | null>(preselect);
  const [kind, setKind] = useState<"NOTICE" | "WARNING">("NOTICE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastPre, setLastPre] = useState(preselect);
  if (preselect !== lastPre) {
    setLastPre(preselect);
    if (preselect) {
      setPerson(preselect);
      setToAll(false);
    }
  }

  const ready = title.trim().length >= 3 && body.trim().length >= 5 && (toAll || person);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ message: string }>("/api/admin/notices", {
        method: "POST",
        json: { to: toAll ? "all" : person!.id, kind: toAll ? "NOTICE" : kind, title: title.trim(), body: body.trim(), link: link.trim() || null, email: !toAll && email },
      });
      toast.success(res.message);
      setTitle("");
      setBody("");
      setLink("");
      onSent();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={formCard}>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Send a notice</CardTitle>
        <CardDescription>It appears under the bell on the student site. A warning goes to one student (warn first, then suspend if it happens again).</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div role="radiogroup" aria-label="Send to" className="grid grid-cols-2 gap-2">
            {[
              { all: true, label: "Everyone", Icon: UsersIcon },
              { all: false, label: "One student", Icon: SearchIcon },
            ].map(({ all, label, Icon }) => (
              <button key={label} type="button" role="radio" aria-checked={toAll === all} onClick={() => setToAll(all)} className={cn("flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition", toAll === all ? "border-primary bg-primary/10 text-brand-amber-text" : "hover:bg-muted/60")}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          {!toAll && (
            <>
              <StudentPicker value={person} onChange={setPerson} />
              <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-2">
                {(["NOTICE", "WARNING"] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("h-9 rounded-lg border px-3 text-sm font-semibold", kind === k ? (k === "WARNING" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary bg-primary/10 text-brand-amber-text") : "hover:bg-muted/60")}>
                    {k === "WARNING" ? "Warning" : "Notice"}
                  </button>
                ))}
              </div>
            </>
          )}
          <Field id={`${id}-title`} label="Title">
            <Input id={`${id}-title`} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} lang="as" placeholder={kind === "WARNING" && !toAll ? "E.g. Please keep Helpline messages polite" : "E.g. New Class 10 chapters are up"} />
          </Field>
          <Field id={`${id}-body`} label="Message">
            <Textarea id={`${id}-body`} rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} className="text-base" lang="as" />
          </Field>
          <Field id={`${id}-link`} label={<>Link <span className="font-normal text-muted-foreground">(optional)</span></>} hint="A page on this site such as /notes, or a full https:// link.">
            <Input id={`${id}-link`} className={inputClass} value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="/notes" />
          </Field>
          {!toAll && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
              <Checkbox checked={email} onCheckedChange={(v) => setEmail(v === true)} className="mt-0.5" />
              <span>
                <span className="flex items-center gap-1.5 font-semibold"><MailIcon className="size-4" /> Also email it</span>
                <span className="text-xs text-muted-foreground">A suspended or blocked student can&apos;t open the site, so email reaches them.</span>
              </span>
            </label>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button type="submit" className={cn(pressable, "justify-self-start")} disabled={busy || !ready}>
            {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {toAll ? "Send to everyone" : kind === "WARNING" ? "Send warning" : "Send notice"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface Page {
  items: Notice[];
  total: number;
  page: number;
  totalPages: number;
}

function NoticesInner() {
  const confirm = useConfirm();
  const { params, set } = useFilterParams();
  const filter = params.get("show") ?? "all";
  const toId = params.get("to");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preselect, setPreselect] = useState<Person | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!toId) return;
    apiJson<{ user: Person }>(`/api/admin/users/${toId}`)
      .then((r) => setPreselect({ id: r.user.id, name: r.user.name, email: r.user.email }))
      .catch(() => undefined);
  }, [toId]);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (toId) q.set("userId", toId);
    else if (filter === "everyone") q.set("to", "all");
    else if (filter === "one") q.set("to", "one");
    else if (filter === "warnings") q.set("kind", "WARNING");
    let cancelled = false;
    apiJson<Page>(`/api/admin/notices?${q}`)
      .then((r) => !cancelled && (setData(r), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [filter, toId, page, reload]);

  const remove = async (n: Notice) => {
    if (!(await confirm({ title: "Remove this notice?", description: `“${n.title}” disappears from ${n.user ? "the student's" : "every"} inbox. An email already sent can't be taken back.`, confirmLabel: "Remove", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/notices/${n.id}`, { method: "DELETE" });
      toast.success("Removed");
      setReload((r) => r + 1);
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Notices" description="Messages to students: to everyone (site news) or to one student (a notice or a warning). Notices from the site itself, such as refunds and coin changes, are listed too." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Compose preselect={preselect} onSent={() => setReload((r) => r + 1)} />
        <div className="grid content-start gap-3">
          {toId ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Showing notices to <strong>{preselect?.name || preselect?.email || "this student"}</strong></span>
              <Button variant="outline" size="sm" className="h-8" onClick={() => set({ to: null })}>Show all</Button>
            </div>
          ) : (
            <Tabs value={filter} onValueChange={(v) => set({ show: v === "all" ? null : v })}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="all" className="h-9 px-2 sm:px-3">All</TabsTrigger>
                <TabsTrigger value="everyone" className="h-9 px-2 sm:px-3">Everyone</TabsTrigger>
                <TabsTrigger value="one" className="h-9 px-2 sm:px-3">One student</TabsTrigger>
                <TabsTrigger value="warnings" className="h-9 px-2 sm:px-3">Warnings</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {!data && !error && <Skeleton className="h-64 rounded-2xl" />}
          {data && (
            <Card className={cn(formCard, "gap-0 py-0")}>
              <ul className="divide-y">
                {data.items.map((n) => (
                  <li key={n.id} className="flex gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={NOTICE_KIND[n.kind].className}>{NOTICE_KIND[n.kind].label}</Badge>
                        <span className="font-semibold" lang="as">{n.title}</span>
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground" lang="as">{n.body}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>{formatDate(n.createdAt, true)}</span>
                        <span>
                          To{" "}
                          {n.user ? (
                            <Link href={`/users/${n.user.id}`} className="font-medium text-foreground hover:underline">{n.user.name || n.user.email}</Link>
                          ) : (
                            "everyone"
                          )}
                        </span>
                        <span>{n.user ? (n.reads ? "Read" : "Not read yet") : `Read by ${n.reads}`}</span>
                        {n.emailNote && <span className={n.emailNote === "sent" ? "" : "text-destructive"}>{n.emailNote === "sent" ? "Emailed" : n.emailNote}</span>}
                        {n.sentBy && <span>by {n.sentBy.name || n.sentBy.email}</span>}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="size-9 shrink-0 text-destructive hover:text-destructive" aria-label={`Remove “${n.title}”`} onClick={() => void remove(n)}><Trash2Icon /></Button>
                  </li>
                ))}
                {data.items.length === 0 && <li className="px-4 py-12 text-center text-sm text-muted-foreground">Nothing sent yet.</li>}
              </ul>
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                  <span className="text-muted-foreground">{data.total} notices</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeftIcon /></Button>
                    <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRightIcon /></Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NoticesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
      <NoticesInner />
    </Suspense>
  );
}
