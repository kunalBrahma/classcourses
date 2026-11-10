import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2Icon } from "lucide-react";
import { Container } from "@/components/site/container";
import { ParentDecision } from "@/components/consent/parent-decision";

export const metadata: Metadata = { title: "Permission for your child", robots: { index: false } };

// The link emailed to a parent or guardian (no account needed).
export default function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Container className="py-8 sm:py-14">
      <Suspense fallback={<Loader2Icon className="mx-auto size-8 animate-spin text-brand-amber-text" aria-label="Loading" />}>
        <ParentDecision params={params} />
      </Suspense>
    </Container>
  );
}
