"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type VideoFormat = "LANDSCAPE" | "SHORT";

// A YouTube video card. Shows the thumbnail first (no YouTube scripts or
// cookies until the student taps), then a youtube-nocookie player.
// Every card has the same 16:9 frame, so a row of mixed videos lines up: a
// Short sits upright in the middle on a blurred copy of its own picture.
// `upright` (rows of Shorts only) uses a 9:16 frame instead.
// In a sideways row it has a fixed width; pass `fluid` to fill a grid cell.
export function VideoCard({ youtubeId, format, title, tag, chapterLabel, href, fluid, upright, className }: {
  youtubeId: string;
  format: VideoFormat;
  title: string;
  /** Small label on the picture, e.g. "Class 9 · English". */
  tag?: string;
  /** e.g. "Chapter 3"; links to `href` when given. */
  chapterLabel?: string;
  href?: string;
  fluid?: boolean;
  /** 9:16 frame; only for a row where every video is a Short. */
  upright?: boolean;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const short = format === "SHORT";
  const tall = short && upright;
  // Shorts sit upright inside the 16:9 frame, over a blurred copy of the picture.
  const boxed = short && !upright;
  const thumb = `https://i.ytimg.com/vi/${youtubeId}/${short ? "oar2" : "hqdefault"}.jpg`;
  const fallback = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // Not every Short has the vertical thumbnail: fall back to the usual one.
    if (!e.currentTarget.src.endsWith("/hqdefault.jpg")) e.currentTarget.src = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  };

  return (
    <article className={cn("card-3d group/card flex flex-col overflow-hidden rounded-[15px] p-0", !fluid && (tall ? "w-44" : "w-64 sm:w-72"), className)}>
      <div className={cn("relative overflow-hidden bg-black", tall ? "aspect-[9/16]" : "aspect-video")}>
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&playsinline=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 overflow-hidden" aria-label={`Play ${title}`}>
            {boxed && (
              // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, external host
              <img src={thumb} onError={fallback} alt="" loading="lazy" decoding="async" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-xl" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, external host */}
            <img
              src={thumb}
              onError={fallback}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn(
                "relative transition duration-300 group-hover:scale-105",
                boxed ? "mx-auto aspect-[9/16] h-full object-cover shadow-[0_0_24px_rgb(0_0_0/0.5)]" : "size-full object-cover"
              )}
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden="true" />
            <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
              <span className="grid size-14 place-items-center rounded-full bg-brand-amber text-brand-ink shadow-[0_6px_16px_rgb(0_0_0/0.45)] transition group-hover:scale-110">
                <PlayIcon className="ml-1 size-6 fill-current" />
              </span>
            </span>
            <span className="absolute inset-x-2 top-2 flex flex-wrap gap-1.5" aria-hidden="true">
              {short && <span className="rounded-full bg-[#c4002b] px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-white">Short</span>}
              {tag && <span className="max-w-full truncate rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">{tag}</span>}
            </span>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {/* Always two lines tall, so cards in a row line up. */}
        <p className={cn("line-clamp-2 min-h-[2lh] font-semibold leading-snug", tall ? "text-sm" : "text-[15px]")} lang="as">
          {title}
        </p>
        {chapterLabel &&
          (href ? (
            <Link href={href} className="mt-auto -mb-2 inline-flex min-h-11 w-fit items-center gap-0.5 text-sm font-semibold text-brand-amber-text hover:underline">
              {chapterLabel} <ChevronRightIcon className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <p className="mt-auto text-sm text-muted-foreground">{chapterLabel}</p>
          ))}
      </div>
    </article>
  );
}
