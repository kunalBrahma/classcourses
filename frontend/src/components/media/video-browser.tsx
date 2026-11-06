"use client";

import { useRef, useState } from "react";
import { Loader2Icon, PlayIcon, SmartphoneIcon, VideoIcon } from "lucide-react";
import { ScrollRow } from "@/components/kit/scroll-row";
import { SectionTitle } from "@/components/kit/section-title";
import { VideoCard } from "@/components/kit/video-card";
import { publicJson } from "@/lib/api";
import { chapterName } from "@/lib/catalog";
import type { FeaturedVideo, Medium, VideoPage } from "@/lib/server-api";
import { cn } from "@/lib/utils";

type Format = "LANDSCAPE" | "SHORT";

interface Filters {
  medium: string;
  classSlug: string;
  subject: string;
}

const query = (format: Format, f: Filters, page = 1) => {
  const p = new URLSearchParams({ format, page: String(page) });
  if (f.medium) p.set("medium", f.medium);
  if (f.classSlug) p.set("classSlug", f.classSlug);
  if (f.subject) p.set("subject", f.subject);
  return `/api/catalog/videos?${p}`;
};

// Every card says which class, subject and chapter it belongs to.
const cardProps = (v: FeaturedVideo) => ({
  youtubeId: v.youtubeId,
  format: v.format,
  title: v.title,
  tag: `${v.classLevel.name} · ${v.subject.name}`,
  chapterLabel: chapterName(v.chapter),
  href: v.chapter.href,
});

function Chips<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string; native?: string | null }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="scroll-row -mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold transition",
            value === o.value ? "press-3d border-transparent" : "bg-card hover:bg-accent"
          )}
        >
          {o.label}
          {o.native && (
            <span lang="as" className="font-normal opacity-80">
              {o.native}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// The /videos page body: filters (medium, class, subject), a sideways row of Shorts and
// a grid of lessons with "Load more". The first page comes from the server;
// filters and more pages are fetched in the browser.
export function VideoBrowser({ mediums, initialShorts, initialLessons }: { mediums: Medium[]; initialShorts: VideoPage; initialLessons: VideoPage }) {
  const [medium, setMedium] = useState("");
  const [classSlug, setClassSlug] = useState("");
  const [subject, setSubject] = useState("");
  const [shorts, setShorts] = useState(initialShorts);
  const [lessons, setLessons] = useState(initialLessons);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against an older filter's answer arriving after a newer one.
  const latest = useRef(0);

  // Subjects belong to one medium and class. With a single medium its chips are
  // hidden, so that medium is used for the subject filter.
  const filters = (m: string, c: string, s: string): Filters => ({ medium: m || (mediums.length === 1 ? mediums[0].slug : ""), classSlug: c, subject: c ? s : "" });

  const applyFilters = async (nextMedium: string, nextClass: string, nextSubject = "") => {
    setMedium(nextMedium);
    setClassSlug(nextClass);
    setSubject(nextClass ? nextSubject : "");
    const f = filters(nextMedium, nextClass, nextSubject);
    const ticket = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([publicJson<VideoPage>(query("SHORT", f)), publicJson<VideoPage>(query("LANDSCAPE", f))]);
      if (ticket !== latest.current) return;
      setShorts(s);
      setLessons(l);
    } catch (err) {
      if (ticket === latest.current) setError((err as Error).message);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await publicJson<VideoPage>(query("LANDSCAPE", filters(medium, classSlug, subject), lessons.page + 1));
      setLessons((cur) => ({ ...next, videos: [...cur.videos, ...next.videos] }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Classes that have videos (for the chosen medium); keep the chosen one listed.
  const classes = lessons.classes.length ? lessons.classes : shorts.classes;
  // A subject may have only Shorts or only lessons: list both.
  const subjects = [...(lessons.subjects ?? []), ...(shorts.subjects ?? [])].filter((x, i, all) => all.findIndex((y) => y.slug === x.slug) === i);
  const nothing = shorts.total === 0 && lessons.total === 0;
  const filtered = Boolean(medium || classSlug || subject);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3">
        {mediums.length > 1 && (
          <Chips
            label="Medium"
            value={medium}
            onChange={(v) => void applyFilters(v, "")}
            options={[{ value: "", label: "All mediums" }, ...mediums.map((m) => ({ value: m.slug, label: m.name, native: m.nativeName }))]}
          />
        )}
        {classes.length > 0 && (
          <Chips
            label="Class"
            value={classSlug}
            onChange={(v) => void applyFilters(medium, v)}
            options={[{ value: "", label: "All classes" }, ...classes.map((c) => ({ value: c.slug, label: c.name }))]}
          />
        )}
        {classSlug && subjects.length > 0 && (
          <Chips
            label="Subject"
            value={subject}
            onChange={(v) => void applyFilters(medium, classSlug, v)}
            options={[{ value: "", label: "All subjects" }, ...subjects.map((x) => ({ value: x.slug, label: x.name, native: x.nativeName }))]}
          />
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-destructive">
          {error}
        </p>
      )}

      <div className={cn("flex flex-col gap-8 transition-opacity", loading && "pointer-events-none opacity-50")} aria-busy={loading}>
        {nothing ? (
          <div className="card-3d grid place-items-center gap-3 rounded-2xl px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-accent text-brand-amber-text">
              <PlayIcon className="ml-0.5 size-6 fill-current" />
            </span>
            <p className="font-heading text-lg font-bold">{filtered ? "No videos here yet" : "Videos are on the way"}</p>
            <p className="max-w-sm text-muted-foreground">
              {filtered ? "Try another subject, class or medium." : "Chapter video lessons will appear here soon."}
            </p>
          </div>
        ) : (
          <>
            {shorts.videos.length > 0 && (
              <section aria-labelledby="shorts-title">
                <SectionTitle icon={SmartphoneIcon}>
                  <span id="shorts-title">Shorts</span>
                </SectionTitle>
                <ScrollRow label="Shorts">
                  {shorts.videos.map((v) => (
                    <VideoCard key={v.id} {...cardProps(v)} upright />
                  ))}
                </ScrollRow>
              </section>
            )}
            {lessons.videos.length > 0 && (
              <section aria-labelledby="lessons-title">
                <SectionTitle icon={VideoIcon}>
                  <span id="lessons-title">Video lessons</span>
                </SectionTitle>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {lessons.videos.map((v) => (
                    <li key={v.id} className="flex">
                      <VideoCard {...cardProps(v)} fluid className="w-full" />
                    </li>
                  ))}
                </ul>
                {lessons.page < lessons.totalPages && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="inline-flex min-h-12 items-center gap-2 rounded-xl border bg-card px-6 font-semibold transition hover:bg-accent disabled:opacity-60"
                    >
                      {loadingMore && <Loader2Icon className="size-4 animate-spin" />} Load more videos
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
