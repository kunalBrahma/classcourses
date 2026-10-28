import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { ClassTile } from "@/components/kit/class-tile";
import { PageTitle } from "@/components/kit/page-title";
import { RememberMedium } from "@/components/catalog/remember-medium";
import { Container } from "@/components/site/container";
import { CatalogSkeleton } from "@/components/catalog/page-skeleton";
import { NONE } from "@/lib/catalog-params";
import { catalogHref, plural } from "@/lib/catalog";
import { getMediumClasses, getMediums } from "@/lib/server-api";

export async function generateStaticParams() {
  const mediums = await getMediums();
  return mediums.length ? mediums.map((m) => ({ medium: m.slug })) : [{ medium: NONE }];
}

export async function generateMetadata({ params }: PageProps<"/[medium]">): Promise<Metadata> {
  const { medium } = await params;
  const data = await getMediumClasses(medium);
  if (!data) return {};
  const name = data.medium.name;
  return {
    title: name,
    description: `Choose your class in ${name}: chapter-wise question-answers, MCQs and quizzes for students of Assam.`,
    alternates: { canonical: catalogHref(data.medium.slug) },
  };
}

async function MediumPageContent({ params }: { params: PageProps<"/[medium]">["params"] }) {
  const { medium } = await params;
  const data = await getMediumClasses(medium);
  if (!data) notFound();

  return (
    <>
      <RememberMedium slug={data.medium.slug} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }]} />
      <PageTitle title={data.medium.name} nativeTitle={data.medium.nativeName} kicker="Choose your class">
        {plural(data.classes.length, "class", "classes")}. Tap your class to see its subjects.
      </PageTitle>
      {data.classes.length === 0 ? (
        <p className="card-3d p-8 text-center text-muted-foreground">Classes are being set up. Please check back soon.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {data.classes.map((c, i) => (
            <li key={c.id}>
              <ClassTile href={catalogHref(data.medium.slug, c.slug)} name={c.name} nativeName={c.nativeName} index={i} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Params are awaited inside <Suspense>: chapters added after the build still
// get an instant page shell, then stream in (Cache Components).
export default function MediumPage(props: PageProps<"/[medium]">) {
  return (
    <Container className="py-6 sm:py-10">
      <Suspense fallback={<CatalogSkeleton tiles />}>
        <MediumPageContent params={props.params} />
      </Suspense>
    </Container>
  );
}
