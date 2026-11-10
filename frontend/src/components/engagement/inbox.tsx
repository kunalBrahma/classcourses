"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon, BellRingIcon, CircleUserRoundIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useRequireSignIn } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { announceNotificationsChanged, Notification } from "@/lib/engagement";
import { cn } from "@/lib/utils";

interface Page {
  items: Notification[];
  unread: number;
  page: number;
  totalPages: number;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const KIND = {
  NOTICE: { Icon: BellRingIcon, label: "From the Class Course team", tone: "bg-accent text-brand-amber-text" },
  WARNING: { Icon: TriangleAlertIcon, label: "Warning", tone: "bg-destructive/10 text-destructive" },
  ACCOUNT: { Icon: CircleUserRoundIcon, label: "Your account", tone: "bg-muted text-muted-foreground" },
} as const;

// The bell's inbox: notices to everyone, notices and warnings to this student,
// and the site's own messages (refunds, parent's permission, coins).
// Opening it marks everything read.
export function Inbox() {
  const signedIn = useRequireSignIn();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (p: number) =>
      apiJson<Page>(`/api/users/me/notifications?page=${p}`).then((r) => {
        setItems((old) => (p === 1 ? r.items : [...(old ?? []), ...r.items]));
        setPage(r.page);
        setTotalPages(r.totalPages);
        if (r.unread > 0) apiJson("/api/users/me/notifications/read", { method: "POST", json: { all: true } }).then(announceNotificationsChanged, () => undefined);
      }),
    []
  );

  useEffect(() => {
    if (!signedIn) return;
    load(1).catch((err: ApiError) => setError(err.message));
  }, [signedIn, load]);

  if (error) return <p role="alert" className="card-3d rounded-2xl p-4 text-destructive">{error}</p>;
  if (!items) return <div className="card-3d h-32 animate-pulse rounded-2xl" aria-hidden="true" />;
  if (items.length === 0) {
    return (
      <div className="card-3d grid justify-items-center gap-2 rounded-2xl px-6 py-12 text-center">
        <BellIcon className="size-10 text-brand-amber-text" aria-hidden="true" />
        <p className="font-heading text-xl font-bold">No notifications yet</p>
        <p className="text-muted-foreground">Messages from the Class Course team appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {items.map((n) => {
          const k = KIND[n.kind];
          return (
            <li key={n.id} className={cn("card-3d flex gap-3 rounded-2xl p-4", !n.read && "ring-2 ring-primary/50", n.kind === "WARNING" && "ring-2 ring-destructive/40")}>
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", k.tone)} aria-hidden="true">
                <k.Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  {k.label} · <time dateTime={n.createdAt}>{when(n.createdAt)}</time>
                  {!n.read && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-brand-ink">New</span>}
                </p>
                <p className="mt-0.5 font-heading text-lg font-bold leading-snug" lang="as">{n.title}</p>
                <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed" lang="as">{n.body}</p>
                {n.link && (
                  <Link
                    href={n.link}
                    {...(n.link.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer" })}
                    className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-amber-text hover:underline"
                  >
                    Open
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {page < totalPages && (
        <button
          type="button"
          disabled={more}
          onClick={() => {
            setMore(true);
            load(page + 1)
              .catch((err: ApiError) => setError(err.message))
              .finally(() => setMore(false));
          }}
          className="inline-flex h-11 items-center justify-center gap-2 justify-self-center rounded-xl border bg-card px-5 font-semibold hover:bg-accent"
        >
          {more && <Loader2Icon className="size-4 animate-spin" />} Show older
        </button>
      )}
    </div>
  );
}
