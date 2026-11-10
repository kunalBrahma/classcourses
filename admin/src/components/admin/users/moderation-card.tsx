"use client";

import Link from "next/link";
import { BellIcon, BookmarkIcon, HeartIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canAccess } from "@/components/admin/nav";
import { useAdmin } from "@/components/admin/session";
import { formCard } from "@/components/admin/styles";
import { UserDetail } from "@/lib/people";

// Users → a student: notices and warnings, likes and saves (client
// requirements of 6 Nov 2026: "warn the user, then suspend or block if it repeats").
export function ModerationCard({ user }: { user: UserDetail }) {
  const me = useAdmin();
  if (user.role !== "STUDENT" || user.status === "DELETED" || !canAccess(me, "users")) return null;
  return (
    <Card className={formCard}>
      <CardHeader>
        <CardTitle className="font-heading text-lg">Notices and activity</CardTitle>
        <CardDescription>Send a notice or a warning to this student. It appears under the bell on the site, and can be emailed too.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><TriangleAlertIcon className="size-3.5 text-destructive" /> Warnings</dt>
            <dd className="font-heading text-xl font-bold tabular-nums">{user.warnings}</dd>
          </div>
          <div className="rounded-xl border px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><HeartIcon className="size-3.5" /> Likes</dt>
            <dd className="font-heading text-xl font-bold tabular-nums">{user.likeCount}</dd>
          </div>
          <div className="rounded-xl border px-3 py-2">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><BookmarkIcon className="size-3.5" /> Saved</dt>
            <dd className="font-heading text-xl font-bold tabular-nums">{user.savedCount}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10">
            <Link href={`/notices?to=${user.id}`}><BellIcon /> Send a notice or warning</Link>
          </Button>
          {canAccess(me, "super") && (
            <Button asChild variant="ghost" className="h-10">
              <Link href={`/referrals?userId=${user.id}`}>Referrals</Link>
            </Button>
          )}
          {(user.likeCount > 0 || user.savedCount > 0) && (
            <Button asChild variant="ghost" className="h-10">
              <Link href={`/likes-saves?userId=${user.id}${user.likeCount === 0 ? "&kind=save" : ""}`}>See likes and saves</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
