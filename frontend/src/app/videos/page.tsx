import type { Metadata } from "next";
import { PageTitle } from "@/components/kit/page-title";
import { VideoBrowser } from "@/components/media/video-browser";
import { Container } from "@/components/site/container";
import { getMediums, getVideoPage } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Videos",
  description: "Chapter video lessons and Shorts for students of Assam, by class and subject.",
};

export default async function VideosPage() {
  const [mediums, shorts, lessons] = await Promise.all([getMediums(), getVideoPage("SHORT"), getVideoPage("LANDSCAPE")]);
  return (
    <Container className="py-6 sm:py-10">
      <PageTitle title="Videos" kicker="Watch & learn">
        Short tricks and full chapter lessons. Tap a video to play it here, or open its chapter for the questions and answers.
      </PageTitle>
      <VideoBrowser mediums={mediums} initialShorts={shorts} initialLessons={lessons} />
    </Container>
  );
}
