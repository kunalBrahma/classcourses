import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpenIcon, FileTextIcon, NewspaperIcon, TimerIcon, VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassTile } from "@/components/kit/class-tile";
import { Coin3D } from "@/components/kit/coin";
import { NewsCard } from "@/components/kit/news-card";
import { NoteCard } from "@/components/kit/note-card";
import { RowCard } from "@/components/kit/row-card";
import { ScrollRow } from "@/components/kit/scroll-row";
import { SectionTitle } from "@/components/kit/section-title";
import { VideoCard } from "@/components/kit/video-card";

export const metadata: Metadata = { title: "Design kit", robots: { index: false } };

// Dev-only preview of the design kit (components/kit) with sample data, for
// reviewing the look before the real pages use it. 404 in production.
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const classes = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Design kit preview (development only). Sample data.</p>

      <section className="flex items-center gap-3 rounded-2xl bg-[image:var(--header-bg)] p-4 text-brand-ink shadow-[var(--header-shadow)] dark:text-brand-cream">
        <Coin3D />
        <div>
          <p className="font-heading text-lg font-extrabold">120 coins</p>
          <p className="text-sm">Pass quizzes, get money off notes</p>
        </div>
        <Button className="press-3d ml-auto h-11 rounded-xl px-4 font-bold">Use coins</Button>
      </section>

      <section>
        <SectionTitle icon={BookOpenIcon}>Choose your class</SectionTitle>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {classes.map((c, i) => (
            <ClassTile key={c} href="#" name={c} nativeName={i === 4 ? "পঞ্চম শ্ৰেণী" : null} index={i} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle icon={TimerIcon}>Subjects</SectionTitle>
        <div className="grid gap-2.5 md:grid-cols-2">
          <RowCard href="#" title="Mathematics" nativeTitle="গণিত" subtitle="14 chapters" />
          <RowCard href="#" title="General Science" nativeTitle="বিজ্ঞান" subtitle="16 chapters" />
        </div>
      </section>

      <section>
        <SectionTitle icon={FileTextIcon} action={{ href: "#", label: "See all" }}>Notes &amp; study material</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <NoteCard title="Class 10 Maths — full notes" subtitle="Class 10 · Mathematics" isFree pricePaise={0}>
            <Button className="h-10 rounded-xl bg-success px-4 font-bold text-white hover:bg-success/90">Download</Button>
          </NoteCard>
          <NoteCard title="Class 12 Political Science — premium notes" subtitle="Class 12 · Political Science" isFree={false} pricePaise={4900} finalPaise={3700}>
            <Button className="press-3d h-10 rounded-xl px-4 font-bold">Pay ₹37 &amp; download</Button>
          </NoteCard>
        </div>
      </section>

      <section>
        <SectionTitle icon={VideoIcon}>Videos</SectionTitle>
        <ScrollRow label="Videos">
          <VideoCard youtubeId="dQw4w9WgXcQ" format="LANDSCAPE" title="Class 10 Maths — Chapter 1 explained" subtitle="Class 10 · Maths · Chapter 1" href="#" />
          <VideoCard youtubeId="jNQXAC9IVRw" format="SHORT" title="A quick science trick" subtitle="Class 8 · Science" />
          <VideoCard youtubeId="M7lc1UVf-VE" format="LANDSCAPE" title="Class 12 History — full revision" />
          <VideoCard youtubeId="ysz5S6PUM-U" format="LANDSCAPE" title="অসমীয়া ব্যাকৰণ" />
        </ScrollRow>
      </section>

      <section>
        <SectionTitle icon={NewspaperIcon}>Latest news</SectionTitle>
        <ScrollRow label="Latest news">
          <NewsCard source="India Today" title="Education & school updates" url="https://www.indiatoday.in/education-today" />
          <NewsCard source="Indian Express" title="National education news" url="https://indianexpress.com/section/education/" />
          <NewsCard source="Example" title="অসমৰ শিক্ষা বাতৰি" url="https://example.com" />
          <NewsCard source="Example" title="Exam dates and results" url="https://example.com" />
        </ScrollRow>
      </section>
    </div>
  );
}
