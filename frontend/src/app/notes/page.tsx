import type { Metadata } from "next";
import { PageTitle } from "@/components/kit/page-title";
import { NotesStore } from "@/components/notes/notes-store";
import { Container } from "@/components/site/container";
import { getSiteSettings, getStoreNotes } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Notes & study material",
  description: "Chapter notes for students of Assam: free notes and premium PDF notes. Use quiz coins for money off.",
};

export default async function NotesPage() {
  const [notes, { coins }] = await Promise.all([getStoreNotes(), getSiteSettings()]);
  return (
    <Container className="py-6 sm:py-10">
      <PageTitle title="Notes & study material" kicker="Notes">
        Free notes and premium PDF notes. Pass quizzes to earn coins and get up to {coins.maxDiscountPercent}% off.
      </PageTitle>
      {notes.length === 0 ? (
        <p className="card-3d rounded-2xl p-8 text-center text-muted-foreground">Notes are on the way. Please check back soon.</p>
      ) : (
        <NotesStore notes={notes} />
      )}
    </Container>
  );
}
