"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArchiveIcon, CheckIcon, InboxIcon, MailIcon, MailWarningIcon, PhoneIcon, ReplyIcon, SearchIcon, Trash2Icon, UserIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate, formatPhone } from "@/lib/people";
import { cn } from "@/lib/utils";

type Status = "NEW" | "READ" | "REPLIED" | "ARCHIVED";
interface Message {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  message: string;
  status: Status;
  emailNote: string | null;
  createdAt: string;
  user: { id: string; name: string | null } | null;
}
interface ListResponse {
  messages: Message[];
  total: number;
  page: number;
  totalPages: number;
  counts: Partial<Record<Status, number>>;
}

const STATUS: Record<Status, { label: string; className: string }> = {
  NEW: { label: "New", className: "border-transparent bg-primary text-primary-foreground" },
  READ: { label: "Read", className: "" },
  REPLIED: { label: "Replied", className: "border-success/30 bg-success/10 text-success" },
  ARCHIVED: { label: "Archived", className: "text-muted-foreground" },
};
const TABS: { value: "inbox" | Status; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "NEW", label: "New" },
  { value: "REPLIED", label: "Replied" },
  { value: "ARCHIVED", label: "Archived" },
];

// Opens the admin's own mail app with the reply started.
const replyHref = (m: Message) =>
  `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.topic} — Class Course`)}&body=${encodeURIComponent(
    `Hi ${m.name.split(" ")[0]},\n\n\n\n—\nYou wrote on ${formatDate(m.createdAt, true)}:\n> ${m.message.replace(/\n/g, "\n> ")}`
  )}`;

function MessageSheet({ message, onClose, onStatus, onDelete }: { message: Message | null; onClose: () => void; onStatus: (m: Message, s: Status) => void; onDelete: (m: Message) => void }) {
  return (
    <Sheet open={message !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {message && (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading">{message.topic}</SheetTitle>
              <SheetDescription>{formatDate(message.createdAt, true)}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-5 px-4 pb-6">
              <div className="grid gap-2 rounded-xl border p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <UserIcon className="size-4 text-muted-foreground" /> {message.name}
                  {message.user && (
                    <Link href={`/users/${message.user.id}`} className="text-xs font-normal text-brand-amber-text hover:underline">
                      (student account)
                    </Link>
                  )}
                </p>
                <a href={`mailto:${message.email}`} className="flex items-center gap-2 break-all hover:underline">
                  <MailIcon className="size-4 shrink-0 text-muted-foreground" /> {message.email}
                </a>
                {message.phone && (
                  <a href={`tel:+91${message.phone}`} className="flex items-center gap-2 tabular-nums hover:underline">
                    <PhoneIcon className="size-4 text-muted-foreground" /> {formatPhone(message.phone)}
                  </a>
                )}
              </div>

              <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-4 leading-relaxed">{message.message}</p>

              {message.emailNote && message.emailNote !== "sent" && (
                <Alert className="border-warning/40 bg-warning/10">
                  <MailWarningIcon className="text-warning" />
                  <AlertDescription>The notification email to you wasn&apos;t sent ({message.emailNote}). The message is safe here.</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2">
                <Button asChild className={pressable}>
                  <a href={replyHref(message)} onClick={() => message.status !== "REPLIED" && onStatus(message, "REPLIED")}>
                    <ReplyIcon /> Reply by email
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">Opens your email app with the reply started, and marks the message as replied.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {message.status !== "REPLIED" && (
                  <Button variant="outline" className="h-10" onClick={() => onStatus(message, "REPLIED")}>
                    <CheckIcon /> Mark replied
                  </Button>
                )}
                {message.status !== "ARCHIVED" ? (
                  <Button variant="outline" className="h-10" onClick={() => onStatus(message, "ARCHIVED")}>
                    <ArchiveIcon /> Archive
                  </Button>
                ) : (
                  <Button variant="outline" className="h-10" onClick={() => onStatus(message, "READ")}>
                    <InboxIcon /> Move to inbox
                  </Button>
                )}
                <Button variant="ghost" className="h-10 text-destructive hover:text-destructive" onClick={() => onDelete(message)}>
                  <Trash2Icon /> Delete
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Messages sent from the website's contact form. Every message is kept here
// even if the notification email to the contact address failed.
export default function MessagesPage() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<"inbox" | Status>("inbox");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Message | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (tab !== "inbox") q.set("status", tab);
    if (query) q.set("search", query);
    return apiJson<ListResponse>(`/api/admin/messages?${q}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: ApiError) => setError(err.message));
  }, [tab, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (m: Message, status: Status) => {
    try {
      const { message } = await apiJson<{ message: Message }>(`/api/admin/messages/${m.id}`, { method: "PATCH", json: { status } });
      setOpen((cur) => (cur?.id === m.id ? { ...cur, status: message.status } : cur));
      if (status === "ARCHIVED") {
        toast.success("Archived");
        setOpen(null);
      }
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  // Opening a new message marks it read.
  const openMessage = (m: Message) => {
    setOpen(m);
    if (m.status === "NEW") void setStatus(m, "READ");
  };

  const remove = async (m: Message) => {
    if (!(await confirm({ title: "Delete this message?", description: `From ${m.name}. This can't be undone.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/messages/${m.id}`, { method: "DELETE" });
      toast.success("Message deleted");
      setOpen(null);
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const counts = data?.counts ?? {};

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Sent from the Contact page on the website. Each one is also emailed to your contact address; replies go straight to the student." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "inbox" | Status);
            setPage(1);
          }}
        >
          <TabsList className="h-auto flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="h-9 px-3">
                {t.label}
                {t.value === "NEW" && (counts.NEW ?? 0) > 0 && <Badge className="ml-1 h-5 px-1.5 text-xs">{counts.NEW}</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <form
          className="relative sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
        >
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or text" aria-label="Search messages" className={cn(inputClass, "pl-9")} />
        </form>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!data && !error && <Skeleton className="h-80 rounded-2xl" />}

      {data && (
        <Card className={`${formCard} gap-0 py-0`}>
          {data.messages.length === 0 ? (
            <div className="grid place-items-center gap-2 px-6 py-14 text-center">
              <InboxIcon className="size-8 text-muted-foreground" />
              <p className="font-heading font-bold">{query ? "No messages match" : tab === "inbox" ? "No messages yet" : "Nothing here"}</p>
              <p className="max-w-sm text-sm text-muted-foreground">Messages students send from the website&apos;s Contact page appear here.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.messages.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => openMessage(m)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/40", m.status === "NEW" && "bg-accent/40")}>
                    <span className={cn("mt-2 size-2 shrink-0 rounded-full", m.status === "NEW" ? "bg-primary" : "bg-transparent")} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={cn("truncate", m.status === "NEW" ? "font-bold" : "font-medium")}>{m.name}</span>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-xs", STATUS[m.status].className)}>
                          {STATUS[m.status].label}
                        </Badge>
                        {m.emailNote && m.emailNote !== "sent" && <MailWarningIcon className="size-4 text-warning" aria-label="Notification email not sent" />}
                      </span>
                      <span className="block truncate text-sm">
                        <span className="font-medium">{m.topic}</span> <span className="text-muted-foreground">— {m.message}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(m.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </span>
              <span className="flex gap-2">
                <Button variant="outline" className="h-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" className="h-9" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </span>
            </div>
          )}
        </Card>
      )}

      <MessageSheet message={open} onClose={() => setOpen(null)} onStatus={setStatus} onDelete={remove} />
    </div>
  );
}
