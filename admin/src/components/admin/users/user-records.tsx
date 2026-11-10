import Link from "next/link";
import { BookmarkIcon, GiftIcon, InboxIcon, ReceiptIndianRupeeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formCard } from "@/components/admin/styles";
import { formatDate, UserDetail } from "@/lib/people";
import { ORDER_STATUS, REFUND_STATUS } from "@/lib/sales";
import { siteLink } from "@/lib/site";
import { cn } from "@/lib/utils";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const MESSAGE_STATUS: Record<string, string> = { NEW: "New", READ: "Read", REPLIED: "Replied", ARCHIVED: "Archived" };
const REFERRAL_STATUS: Record<string, string> = { PENDING: "Email not verified", HELD: "Needs review", REWARDED: "Rewarded", REJECTED: "No coins", REVERSED: "Reversed" };

function Section({ title, icon: Icon, hint, children }: { title: string; icon: typeof InboxIcon; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className={cn(formCard, "gap-0 py-0")}>
      <div className="border-b px-4 py-3">
        <p className="flex items-center gap-2 font-heading font-bold"><Icon className="size-4 text-brand-amber-text" /> {title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;

// Users → a student: purchases, Helpline messages, saved items and referrals on
// one page (client requirements of 6 Nov 2026).
export function UserRecords({ user, isSuper }: { user: UserDetail; isSuper: boolean }) {
  if (user.role !== "STUDENT") return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Purchases" icon={ReceiptIndianRupeeIcon} hint="Latest 20 orders · refunds start from Orders">
        {user.orders.length === 0 ? (
          <Empty>No orders yet.</Empty>
        ) : (
          <ul className="divide-y">
            {user.orders.map((o) => {
              const refund = o.refunds[0];
              return (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" lang="as">{o.note.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(o.paidAt ?? o.createdAt, true)} · {rupees(o.amountPaise)}{o.coinsUsed > 0 && ` + ${o.coinsUsed} coins`}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline" className={ORDER_STATUS[o.status].className}>{ORDER_STATUS[o.status].label}</Badge>
                    {refund && <Badge variant="outline" className={REFUND_STATUS[refund.status].className}>Refund: {REFUND_STATUS[refund.status].label}</Badge>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Helpline messages" icon={InboxIcon} hint={<>Latest 20 · answer them in <Link href="/messages" className="underline-offset-2 hover:underline">Messages</Link></>}>
        {user.contactMessages.length === 0 ? (
          <Empty>No messages from this student.</Empty>
        ) : (
          <ul className="divide-y">
            {user.contactMessages.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold capitalize text-foreground">{m.topic}</span>
                  <span>{MESSAGE_STATUS[m.status] ?? m.status} · {formatDate(m.createdAt, true)}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-sm" lang="as">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Saved" icon={BookmarkIcon} hint={`${user.savedCount} saved in all · latest 10`}>
        {user.savedItems.length === 0 ? (
          <Empty>Nothing saved.</Empty>
        ) : (
          <ul className="divide-y">
            {user.savedItems.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" lang="as">
                    {s.type === "CHAPTER" && s.chapterNumber !== null
                      ? s.title.trim().toLowerCase() === `chapter ${s.chapterNumber}`
                        ? `Chapter ${s.chapterNumber}`
                        : `Chapter ${s.chapterNumber}: ${s.title}`
                      : s.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.type === "CHAPTER" ? "Chapter" : "Blog post"} · {s.context}{!s.available && " · not on the site"}
                  </span>
                </span>
                {s.available && (
                  <a href={siteLink(s.href)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-amber-text hover:underline">Open</a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Refer and Earn"
        icon={GiftIcon}
        hint={isSuper ? <Link href={`/referrals?userId=${user.id}`} className="underline-offset-2 hover:underline">Review in Refer and Earn</Link> : undefined}
      >
        {user.referredBy && (
          <p className="border-b px-4 py-3 text-sm">
            Joined with <Link href={`/users/${user.referredBy.referrer.id}`} className="font-semibold hover:underline">{user.referredBy.referrer.name || user.referredBy.referrer.email}</Link>&apos;s link ·{" "}
            {REFERRAL_STATUS[user.referredBy.status]}{user.referredBy.coinsFriend > 0 && ` · +${user.referredBy.coinsFriend} welcome coins`}
          </p>
        )}
        {user.referralsMade.length === 0 ? (
          <Empty>Hasn&apos;t invited anyone yet.</Empty>
        ) : (
          <ul className="divide-y">
            {user.referralsMade.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/users/${r.referred.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{r.referred.name || r.referred.email}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {REFERRAL_STATUS[r.status]}{r.status === "REWARDED" && ` · +${r.coinsReferrer}`} · {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
