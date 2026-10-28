import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2Icon } from "lucide-react";
import { QuizRunner } from "@/components/quiz/quiz-runner";
import { Container } from "@/components/site/container";
import { getSiteSettings } from "@/lib/server-api";

export const metadata: Metadata = { title: "Quiz", robots: { index: false } };

// A student's own attempt: rendered in the browser (needs their login).
export default async function QuizPage() {
  const { coins } = await getSiteSettings();
  return (
    <Container className="py-6 sm:py-10">
      <Suspense fallback={<Loader2Icon className="mx-auto mt-10 size-8 animate-spin text-brand-amber-text" aria-label="Loading the quiz" />}>
        <QuizRunner coinRule={coins.awardRule ?? "firstPassPerChapter"} />
      </Suspense>
    </Container>
  );
}
