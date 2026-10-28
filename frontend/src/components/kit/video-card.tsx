"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type VideoFormat = "LANDSCAPE" | "SHORT";

// A YouTube video card. Shows the thumbnail first (no YouTube scripts or
// cookies until the student taps), then a youtube-nocookie player in the
// video's own shape: Shorts 9:16, long videos 16:9.
export function VideoCard({ youtubeId, format, title, subtitle, href, className }: {
  youtubeId: string;
  format: VideoFormat;
  title: string;
  subtitle?: string;
  /** Optional link to the chapter the video belongs to. */
  href?: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const short = format === "SHORT";

  return (
    <article className={cn("card-3d overflow-hidden rounded-[15px] p-0", short ? "w-36" : "w-52", className)}>
      <div className={cn("relative bg-black", short ? "aspect-[9/16]" : "aspect-video")}>
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&playsinline=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0" aria-label={`Play ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, external host */}
            <img
              src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-12 place-items-center rounded-full bg-black/60 text-white shadow-[0_4px_10px_rgb(0_0_0/0.4)] transition group-hover:scale-110">
                <PlayIcon className="ml-0.5 size-5 fill-current" />
              </span>
            </span>
            {short && (
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">Short</span>
            )}
          </button>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug" lang="as">
          {title}
        </p>
        {subtitle &&
          (href ? (
            <Link href={href} className="mt-1 block text-xs font-medium text-brand-amber-text hover:underline">
              {subtitle}
            </Link>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ))}
      </div>
    </article>
  );
}
