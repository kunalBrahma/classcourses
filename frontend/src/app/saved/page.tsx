import type { Metadata } from "next";
import { PageTitle } from "@/components/kit/page-title";
import { Container } from "@/components/site/container";
import { SavedPage } from "@/components/engagement/saved-page";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

export default function Saved() {
  return (
    <Container className="py-6 sm:py-10">
      <div className="max-w-3xl">
      <PageTitle title="Saved" kicker="My profile">
        Chapters and blog posts you saved. They stay here until you remove them.
      </PageTitle>
      <SavedPage />
      </div>
    </Container>
  );
}
