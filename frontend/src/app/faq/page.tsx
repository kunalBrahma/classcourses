import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { Container } from "@/components/site/container";
import { getFaq, getSiteSettings } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Questions & answers",
  description: "Answers to common questions about Class Course: quizzes, coins, notes and payments.",
  alternates: { canonical: "/faq" },
};

// FAQ from Admin → FAQ (published items, in the admin's order), as native
// <details> so it works without JavaScript; also marked up as FAQPage.
export default async function FaqPage() {
  const [items, { site }] = await Promise.all([getFaq(), getSiteSettings()]);
  if (items.length === 0) notFound();
  const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: plain(i.answerHtml) } })),
  };

  return (
    <Container className="py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }]} />
      <div className="max-w-3xl">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">Questions &amp; answers</h1>
        <p className="mt-2 text-muted-foreground">Common questions about {site.name}. Tap a question to see the answer.</p>
        <ul className="mt-6 grid gap-3">
          {items.map((i) => (
            <li key={i.id}>
              <details className="card-3d group rounded-2xl">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden" lang="as">
                  <span className="min-w-0 flex-1">{i.question}</span>
                  <ChevronDownIcon className="size-5 shrink-0 text-brand-amber-text transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="rich border-t px-4 pb-4 pt-3" lang="as" dangerouslySetInnerHTML={{ __html: i.answerHtml }} />
              </details>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
