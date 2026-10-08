"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, ScaleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/admin/page-header";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate } from "@/lib/people";
import { PAGE_LABELS, PageRow } from "@/lib/pages";

export default function PagesList() {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<{ pages: PageRow[] }>("/api/admin/pages")
      .then(({ pages }) => setPages(pages))
      .catch((err: ApiError) => setError(err.message));
  }, []);

  const published = pages?.filter((p) => p.isPublished).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Site pages" description="The fixed pages linked from the student site's footer. Students only see published pages." />

      {pages && published < pages.length && (
        <Alert className="border-warning/40 bg-warning/10">
          <ScaleIcon className="text-warning" />
          <AlertTitle>Drafts are waiting for approval</AlertTitle>
          <AlertDescription>
            These texts were drafted by the developer from how the site actually works. Have the owner read each one — and ideally a lawyer the
            Privacy, Terms and Refund pages — then publish. Razorpay checks the legal pages before approving payments.
          </AlertDescription>
        </Alert>
      )}

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!pages && !error && <Skeleton className="h-80 rounded-2xl" />}

      {pages && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {pages.map((p) => {
              const label = PAGE_LABELS[p.slug];
              return (
                <li key={p.slug}>
                  <Link href={`/pages/${p.slug}`} className="flex items-center gap-3 px-4 py-4 hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.title ?? label?.title ?? p.slug}</span>
                        {p.isPublished ? (
                          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Published</Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Draft</Badge>
                        )}
                        {label?.legal && <Badge variant="secondary" className="text-[10px]">Legal</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {label?.hint}
                        {p.updatedAt && ` · updated ${formatDate(p.updatedAt)}`}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
