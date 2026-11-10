"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, MegaphoneIcon } from "lucide-react";
import { useSignedIn } from "@/components/site/account-menu";
import { apiJson } from "@/lib/api";
import type { Announcement } from "@/lib/server-api";

// Home page announcements (client requirements of 6 Nov 2026). The server
// renders the ones for everyone; a signed-in student's own (their class,
// students only) are added in the browser. Nothing shows when there are none.
export function Announcements({ initial }: { initial: Announcement[] }) {
  const signedIn = useSignedIn();
  const [mine, setMine] = useState<Announcement[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    apiJson<{ items: Announcement[] }>("/api/content/announcements")
      .then((r) => !cancelled && setMine(r.items))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const items = signedIn && mine ? mine : initial;
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="announcements-title" className="grid gap-3">
      <h2 id="announcements-title" className="flex items-center gap-2 font-heading text-xl font-extrabold">
        <MegaphoneIcon className="size-5 text-brand-amber-text" aria-hidden="true" /> Announcements
      </h2>
      <ul className="grid gap-3 lg:grid-cols-2">
        {items.map((a) => {
          const external = a.link && !a.link.startsWith("/");
          return (
            <li key={a.id} className="card-3d flex gap-4 rounded-xl border-l-4 border-l-brand-amber p-4">
              {a.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- admin upload; shown whole
                <img src={a.imageUrl} alt="" width={a.imageWidth ?? undefined} height={a.imageHeight ?? undefined} loading="lazy" className="h-auto w-20 shrink-0 self-start rounded-lg sm:w-28" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg font-bold leading-snug" lang="as">{a.title}</p>
                {/* Sanitised by the backend on save (sanitizeHtml.ts allowlist). */}
                {a.bodyHtml && <div className="rich mt-1 text-[15px]" lang="as" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />}
                {a.link && (
                  <Link
                    href={a.link}
                    {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-brand-amber-text hover:underline"
                  >
                    {a.linkLabel || "Read more"} <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
