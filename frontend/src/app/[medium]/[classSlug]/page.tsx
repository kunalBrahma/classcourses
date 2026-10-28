import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { PageTitle } from "@/components/kit/page-title";
import { RememberMedium } from "@/components/catalog/remember-medium";
import { SubjectAccordion } from "@/components/catalog/subject-accordion";
import { Container } from "@/components/site/container";
import { CatalogSkeleton } from "@/components/catalog/page-skeleton";
import { NONE, orPlaceholder, classParams } from "@/lib/catalog-params";
import { catalogHref, plural } from "@/lib/catalog";
import { getClassSubjects } from "@/lib/server-api";

export async function generateStaticParams() {
  return orPlaceholder(await classParams(), { medium: NONE, classSlug: NONE });
}

export async function generateMetadata({ params }: PageProps<"/[medium]/[classSlug]">): Promise<Metadata> {
  const { medium, classSlug } = await params;
  const data = await getClassSubjects(medium, classSlug);
  if (!data) return {};
  const names = data.subjects.map((s) => s.name).join(", ");
  return {
    title: `${data.classLevel.name} · ${data.medium.name}`,
    description: `${data.classLevel.name} (${data.medium.name}) chapter-wise question-answers and MCQs: ${names}.`,
    alternates: { canonical: catalogHref(data.medium.slug, data.classLevel.slug) },
  };
}

async function ClassPageContent({ params }: { params: PageProps<"/[medium]/[classSlug]">["params"] }) {
  const { medium, classSlug } = await params;
  const data = await getClassSubjects(medium, classSlug);
  if (!data) notFound();

  return (
    <>
      <RememberMedium slug={data.medium.slug} />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: data.medium.name, href: catalogHref(data.medium.slug) },
        ]}
      />
      <PageTitle title={data.classLevel.name} nativeTitle={data.classLevel.nativeName} kicker={data.medium.name}>
        {plural(data.subjects.length, "subject")}. Tap a subject to see its chapters.
      </PageTitle>
      <div className="max-w-3xl">
        <SubjectAccordion data={data} />
      </div>
    </>
  );
}

// Params are awaited inside <Suspense>: chapters added after the build still
// get an instant page shell, then stream in (Cache Components).
export default function ClassPage(props: PageProps<"/[medium]/[classSlug]">) {
  return (
    <Container className="py-6 sm:py-10">
      <Suspense fallback={<CatalogSkeleton />}>
        <ClassPageContent params={props.params} />
      </Suspense>
    </Container>
  );
}
