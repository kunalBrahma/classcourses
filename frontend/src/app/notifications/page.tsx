import type { Metadata } from "next";
import { PageTitle } from "@/components/kit/page-title";
import { Container } from "@/components/site/container";
import { Inbox } from "@/components/engagement/inbox";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <Container className="py-6 sm:py-10">
      <div className="max-w-3xl">
        <PageTitle title="Notifications" kicker="My profile">
          News and messages from the Class Course team.
        </PageTitle>
        <Inbox />
      </div>
    </Container>
  );
}
