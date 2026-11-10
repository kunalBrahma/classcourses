import type { Metadata } from "next";
import { PageTitle } from "@/components/kit/page-title";
import { Container } from "@/components/site/container";
import { ReferView } from "@/components/engagement/refer-view";

export const metadata: Metadata = { title: "Refer and Earn", robots: { index: false } };

export default function ReferPage() {
  return (
    <Container className="py-6 sm:py-10">
      <div className="max-w-3xl">
        <PageTitle title="Refer and Earn" kicker="Invite friends" />
        <ReferView />
      </div>
    </Container>
  );
}
