"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon } from "lucide-react";
import { headerIconButton } from "@/components/site/header-styles";
import { useSignedIn } from "@/components/site/account-menu";
import { apiJson } from "@/lib/api";
import { NOTIFICATIONS_EVENT } from "@/lib/engagement";

const POLL_MS = 3 * 60_000;

// Header bell for signed-in students: opens the inbox, with the unread count.
// Light on purpose (no Radix): it's on every page.
export function NotificationBell() {
  const signedIn = useSignedIn();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = () =>
      apiJson<{ unread: number }>("/api/users/me/notifications/unread")
        .then((r) => !cancelled && setUnread(r.unread))
        .catch(() => undefined);
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIFICATIONS_EVENT, onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(NOTIFICATIONS_EVENT, onFocus);
    };
  }, [signedIn]);

  if (!signedIn) return null;
  const count = unread > 9 ? "9+" : String(unread);
  return (
    <Link href="/notifications" className={`${headerIconButton} relative`} aria-label={unread ? `Notifications: ${unread} new` : "Notifications"}>
      <BellIcon className="size-5" />
      {unread > 0 && (
        <span translate="no" className="notranslate absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-white ring-2 ring-brand-amber">
          {count}
        </span>
      )}
    </Link>
  );
}
