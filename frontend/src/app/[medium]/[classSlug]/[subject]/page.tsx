import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { PageTitle } from "@/components/kit/page-title";
import { ChapterList } from "@/components/catalog/chapter-list";
import { RememberMedium } from "@/components/catalog/remember-medium";
import { Container } from "@/components/site/container";
import { CatalogSkeleton } from "@/components/catalog/page-skeleton";
import { NONE, orPlaceholder, subjectParams } from "@/lib/catalog-params";
import { catalogHref, plural } from "@/lib/catalog";
import { getSubject } from "@/lib/server-api";

export async function generateStaticParams() {
  return orPlaceholder(await subjectParams(), { medium: NONE, classSlug: NONE, subject: NONE });
}

type Props = PageProps<"/[medium]/[classSlug]/[subject]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { medium, classSlug, subject } = await params;
  const s = await getSubject(medium, classSlug, subject);
  if (!s) return {};
  return {
    title: `${s.name} · ${s.classLevel.name} · ${s.medium.name}`,
    description: `${s.classLevel.name} ${s.name}${s.nativeName ? ` (${s.nativeName})` : ""}: all ${plural(s.chapterCount, "chapter")} with question-answers, MCQs and quizzes.`,
    alternates: { canonical: catalogHref(s.medium.slug, s.classLevel.slug, s.slug) },
  };
}

async function SubjectPageContent({ params }: { params: Props["params"] }) {
  const { medium, classSlug, subject } = await params;
  const s = await getSubject(medium, classSlug, subject);
  if (!s) notFound();
  const base = [s.medium.slug, s.classLevel.slug, s.slug];

  return (
    <>
      <RememberMedium slug={s.medium.slug} />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: s.medium.name, href: catalogHref(s.medium.slug) },
          { label: s.classLevel.name, href: catalogHref(s.medium.slug, s.classLevel.slug) },
        ]}
      />
      <PageTitle title={s.name} nativeTitle={s.nativeName} kicker={`${s.classLevel.name} · ${s.medium.name}`}>
        {plural(s.chapterCount, "chapter")}
      </PageTitle>
      {s.chapterCount === 0 ? (
        <p className="card-3d p-8 text-center text-muted-foreground">Chapters are being added. Please check back soon.</p>
      ) : (
        <ChapterList groups={s.groups} base={base} />
      )}
    </>
  );
}

// Params are awaited inside <Suspense>: chapters added after the build still
// get an instant page shell, then stream in (Cache Components).
export default function SubjectPage(props: Props) {
  return (
    <Container className="py-6 sm:py-10">
      <Suspense fallback={<CatalogSkeleton />}>
        <SubjectPageContent params={props.params} />
      </Suspense>
    </Container>
  );
}
