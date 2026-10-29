import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpenIcon, BookOpenTextIcon, FileTextIcon, ListChecksIcon, StarIcon, TimerIcon, VideoIcon } from "lucide-react";
import { Breadcrumbs } from "@/components/kit/breadcrumbs";
import { PrevNext } from "@/components/catalog/prev-next";
import { BreadcrumbJsonLd } from "@/components/catalog/breadcrumb-json-ld";
import { ChapterQuizzes } from "@/components/chapter/chapter-quizzes";
import { ChapterSection } from "@/components/chapter/chapter-section";
import { JumpBar } from "@/components/chapter/jump-bar";
import { McqPractice } from "@/components/chapter/mcq-practice";
import { QaList } from "@/components/chapter/qa-list";
import { VideoCard } from "@/components/kit/video-card";
import { NoteList } from "@/components/notes/note-list";
import { RememberMedium } from "@/components/catalog/remember-medium";
import { Container } from "@/components/site/container";
import { CatalogSkeleton } from "@/components/catalog/page-skeleton";
import { NONE, orPlaceholder, chapterParams } from "@/lib/catalog-params";
import { catalogHref, chapterName, isPlaceholderTitle } from "@/lib/catalog";
import { getChapter, getChapterQuizzes } from "@/lib/server-api";

// Prerender the first chapter of each subject; the rest render on first visit
// and are cached.
export async function generateStaticParams() {
  return orPlaceholder(await chapterParams(), { medium: NONE, classSlug: NONE, subject: NONE, chapter: NONE });
}

type Props = PageProps<"/[medium]/[classSlug]/[subject]/[chapter]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { medium, classSlug, subject, chapter } = await params;
  const data = await getChapter(medium, classSlug, subject, chapter);
  if (!data) return {};
  const where = `${data.classLevel.name} ${data.subject.name} (${data.medium.name})`;
  return {
    title: `${chapterName(data.chapter)} · ${data.subject.name} · ${data.classLevel.name}`,
    description: `${chapterName(data.chapter)}, ${where}: textbook question-answers, extra questions, MCQs and a quick quiz.`,
    alternates: { canonical: catalogHref(data.medium.slug, data.classLevel.slug, data.subject.slug, data.chapter.slug) },
  };
}

async function ChapterPageContent({ params }: { params: Props["params"] }) {
  const { medium, classSlug, subject, chapter } = await params;
  const data = await getChapter(medium, classSlug, subject, chapter);
  if (!data) notFound();
  const { chapter: c } = data;
  const base = [data.medium.slug, data.classLevel.slug, data.subject.slug];

  const { content } = data;
  const quizzes = await getChapterQuizzes(c.id);
  const sections = [
    { id: "textbook-qa", label: "Textbook Q&A", items: content.textbook.qa },
    { id: "extra-qa", label: "Extra Q&A", items: content.extra.qa },
    { id: "textbook-mcq", label: "Textbook MCQs", items: content.textbook.mcq },
    { id: "extra-mcq", label: "Extra MCQs", items: content.extra.mcq },
  ];
  const hasContent = sections.some((x) => x.items.length > 0) || data.videos.length > 0 || data.notes.length > 0;
  const jump = [
    ...(c.aboutHtml ? [{ id: "about", label: "About" }] : []),
    ...sections.filter((x) => x.items.length > 0).map((x) => ({ id: x.id, label: x.label, count: x.items.length })),
    ...(quizzes.length ? [{ id: "quiz", label: "Quiz" }] : []),
    ...(data.videos.length ? [{ id: "videos", label: "Videos", count: data.videos.length }] : []),
    ...(data.notes.length ? [{ id: "notes", label: "Notes", count: data.notes.length }] : []),
  ];
  const crumbs = [
    { label: "Home", href: "/" },
    { label: data.medium.name, href: catalogHref(data.medium.slug) },
    { label: data.classLevel.name, href: catalogHref(data.medium.slug, data.classLevel.slug) },
    { label: data.subject.name, href: catalogHref(...base) },
  ];

  return (
    <>
      <RememberMedium slug={data.medium.slug} />
      <BreadcrumbJsonLd items={[...crumbs, { label: chapterName(c), href: catalogHref(...base, c.slug) }]} />
      <Breadcrumbs items={crumbs} />

      <header className="mb-6 flex items-start gap-4">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[image:var(--header-bg)] font-heading text-2xl font-extrabold text-brand-ink shadow-[0_4px_0_var(--press-edge)] dark:text-brand-cream"
          aria-hidden="true"
        >
          {c.number}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wider text-brand-amber-text">
            {data.subject.name} · {data.classLevel.name}
            {c.part && <span lang="as"> · {c.part.title}</span>}
          </p>
          <h1 className="font-heading text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl" lang="as">
            {isPlaceholderTitle(c.number, c.title) ? `Chapter ${c.number}` : c.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chapter {data.position.index} of {data.position.total}
          </p>
        </div>
      </header>

      <div className="max-w-3xl">
        <JumpBar links={jump} />

        <div className="grid gap-10">
          {c.aboutHtml && (
            <ChapterSection id="about" icon={BookOpenTextIcon} title="About the lesson">
              <div className="card-3d rounded-2xl p-5 sm:p-6">
                {/* Sanitised by the backend on save (sanitizeHtml.ts allowlist). */}
                <div className="rich" lang="as" dangerouslySetInnerHTML={{ __html: c.aboutHtml }} />
              </div>
            </ChapterSection>
          )}

          {content.textbook.qa.length > 0 && (
            <ChapterSection id="textbook-qa" icon={BookOpenIcon} title="Textbook Q&A" hint="Questions from your school book, with answers." count={content.textbook.qa.length}>
              <QaList items={content.textbook.qa} />
            </ChapterSection>
          )}
          {content.extra.qa.length > 0 && (
            <ChapterSection id="extra-qa" icon={StarIcon} title="Extra Q&A" hint="More questions beyond the book, for extra practice." count={content.extra.qa.length}>
              <QaList items={content.extra.qa} />
            </ChapterSection>
          )}
          {content.textbook.mcq.length > 0 && (
            <ChapterSection id="textbook-mcq" icon={ListChecksIcon} title="Textbook MCQs" hint="Tap an answer to check it." count={content.textbook.mcq.length}>
              <McqPractice items={content.textbook.mcq} />
            </ChapterSection>
          )}
          {content.extra.mcq.length > 0 && (
            <ChapterSection id="extra-mcq" icon={ListChecksIcon} title="Extra MCQs" hint="Tap an answer to check it." count={content.extra.mcq.length}>
              <McqPractice items={content.extra.mcq} />
            </ChapterSection>
          )}
          {quizzes.length > 0 && (
            <ChapterSection id="quiz" icon={TimerIcon} title="Quiz" hint="Test yourself against the clock and earn coins.">
              <ChapterQuizzes quizzes={quizzes} chapterId={c.id} />
            </ChapterSection>
          )}
          {data.videos.length > 0 && (
            <ChapterSection id="videos" icon={VideoIcon} title="Videos" count={data.videos.length}>
              <ul className="flex flex-wrap items-start gap-4">
                {data.videos.map((v) => (
                  <li key={v.id} className={v.format === "SHORT" ? undefined : "w-full sm:w-auto"}>
                    <VideoCard youtubeId={v.youtubeId} format={v.format} title={v.title} fluid className="w-full sm:w-96" />
                  </li>
                ))}
              </ul>
            </ChapterSection>
          )}

          {data.notes.length > 0 && (
            <ChapterSection id="notes" icon={FileTextIcon} title="Notes" hint="PDF notes for this chapter and the whole subject." count={data.notes.length}>
              <NoteList notes={data.notes} subtitle={(n) => (data.notes.find((x) => x.id === n.id)?.scope === "subject" ? `Whole ${data.subject.name} subject` : "This chapter")} />
            </ChapterSection>
          )}

          {!hasContent && (
            <p className="card-3d rounded-2xl p-6 text-muted-foreground">
              Question-answers and MCQs for this chapter are being added. Please check back soon.
            </p>
          )}
        </div>

        <PrevNext base={base} prev={data.prev} next={data.next} />
      </div>
    </>
  );
}

// Params are awaited inside <Suspense>: chapters added after the build still
// get an instant page shell, then stream in (Cache Components).
export default function ChapterPage(props: Props) {
  return (
    <Container className="py-6 sm:py-10">
      <Suspense fallback={<CatalogSkeleton />}>
        <ChapterPageContent params={props.params} />
      </Suspense>
    </Container>
  );
}
