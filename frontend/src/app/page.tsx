import { Suspense } from "react";
import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, FileTextIcon, InfoIcon, NewspaperIcon, VideoIcon } from "lucide-react";
import { ClassPicker, ClassPickerSkeleton } from "@/components/home/class-picker";
import { CoinCard } from "@/components/home/coin-card";
import { NotePlaceholders, VideoPlaceholders } from "@/components/home/placeholders";
import { QuizCard } from "@/components/home/quiz-card";
import { NewsCard } from "@/components/kit/news-card";
import { ScrollRow } from "@/components/kit/scroll-row";
import { SectionTitle } from "@/components/kit/section-title";
import { VideoCard } from "@/components/kit/video-card";
import { NoteList } from "@/components/notes/note-list";
import { placeLine } from "@/components/notes/place-line";
import { Container } from "@/components/site/container";
import { getFeaturedVideos, getNews, getPublishedPages, getSiteSettings, getStoreNotes } from "@/lib/server-api";
import { DEFAULT_NEWS } from "@/lib/site-links";

// The client's home-page mock (docs/design/home-page-mock.html), in its order:
// coins → quizzes → classes → notes → videos → news → about. Every section is
// always there: until the admin adds notes, videos or news links, a
// "coming soon" placeholder (or the mock's news sources) fills the spot.
export default async function HomePage() {
  const [{ site, quiz, coins }, videos, news, pages, notes] = await Promise.all([
    getSiteSettings(),
    getFeaturedVideos(),
    getNews(),
    getPublishedPages(),
    getStoreNotes(),
  ]);
  const newsLinks = news.length ? news : DEFAULT_NEWS;
  const aboutPublished = pages.some((p) => p.slug === "about");

  return (
    <Container className="flex flex-col gap-7 py-4 sm:gap-9 sm:py-6 [&>*]:min-w-0">
      {/* The mock starts with the coins strip; the page title is for screen readers and search. */}
      <h1 className="sr-only">
        {site.name}: chapter-wise question-answers, MCQs, quizzes and notes for students of Assam
      </h1>

      <CoinCard />

      <QuizCard quiz={quiz} coins={coins} />

      <section id="classes" className="scroll-mt-24" aria-labelledby="classes-title">
        <SectionTitle icon={BookOpenIcon}>
          <span id="classes-title">Choose Your Class</span>
        </SectionTitle>
        <Suspense fallback={<ClassPickerSkeleton />}>
          <ClassPicker />
        </Suspense>
      </section>

      <section id="notes" className="scroll-mt-24" aria-labelledby="notes-title">
        <SectionTitle icon={FileTextIcon} action={notes.length ? { href: "/notes", label: "See all" } : undefined}>
          <span id="notes-title">Notes &amp; Study Material</span>
        </SectionTitle>
        {notes.length ? <NoteList notes={notes.slice(0, 4)} subtitle={placeLine} /> : <NotePlaceholders />}
      </section>

      <section id="videos" className="scroll-mt-24" aria-labelledby="videos-title">
        <SectionTitle icon={VideoIcon}>
          <span id="videos-title">Videos</span>
        </SectionTitle>
        {videos.length ? (
          <ScrollRow label="Videos">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                youtubeId={v.youtubeId}
                format={v.format}
                title={v.title}
                subtitle={`${v.classLevel.name} · ${v.subject.name} · Chapter ${v.chapter.number}`}
                href={v.chapter.href}
              />
            ))}
          </ScrollRow>
        ) : (
          <VideoPlaceholders />
        )}
      </section>

      <section id="news" className="scroll-mt-24" aria-labelledby="news-title">
        <SectionTitle icon={NewspaperIcon}>
          <span id="news-title">Latest News</span>
        </SectionTitle>
        <ScrollRow label="Latest news">
          {newsLinks.map((n) => (
            <NewsCard key={n.id} source={n.source} title={n.title} url={n.url} />
          ))}
        </ScrollRow>
      </section>

      <section id="about" className="scroll-mt-24" aria-labelledby="about-title">
        <div className="card-3d rounded-2xl p-4 sm:p-5">
          <SectionTitle icon={InfoIcon}>
            <span id="about-title">What is {site.name}?</span>
          </SectionTitle>
          <p className="max-w-4xl text-[15px] leading-relaxed text-muted-foreground">
            {site.name} is an online learning platform for students from Class 1 to Class 12 in Assam. Every subject has chapter-wise
            textbook Q&amp;A, extra advanced Q&amp;A, and practice MCQs. Students can test their knowledge through quizzes, earn coins, and
            use those coins to get a discount on premium notes. Education videos and the latest education-related news are also available
            in one place, so students don&apos;t need to go anywhere else to study.
          </p>
          {aboutPublished && (
            <Link href="/about" className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-amber-text hover:underline">
              More about us <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>
    </Container>
  );
}
