"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Banner } from "@/lib/server-api";
import { cn } from "@/lib/utils";

const AUTO_ADVANCE_MS = 5000;

// The whole picture, always: the image keeps its own shape (w-full + h-auto), and the
// stored sizes reserve its space before it loads. Never add object-cover or a fixed
// height here. Phones get the phone picture when there is one.
function BannerPicture({ banner, first }: { banner: Banner; first: boolean }) {
  return (
    <picture>
      {banner.mobileImageUrl && (
        <source
          media="(max-width: 639px)"
          srcSet={banner.mobileImageUrl}
          width={banner.mobileWidth ?? undefined}
          height={banner.mobileHeight ?? undefined}
        />
      )}
      {/* A plain img: admin upload on the public bucket, already resized in the admin. */}
      <img
        src={banner.imageUrl}
        srcSet={banner.imageSmallUrl === banner.imageUrl ? undefined : `${banner.imageSmallUrl} 960w, ${banner.imageUrl} ${banner.width}w`}
        sizes="(min-width: 1280px) 1216px, 100vw"
        width={banner.width}
        height={banner.height}
        // No description: a link still needs a name; a plain picture is just decoration.
        alt={banner.altText || (banner.link ? "Open banner link" : "")}
        lang="as"
        decoding="async"
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : "auto"}
        className="block h-auto w-full rounded-2xl"
      />
    </picture>
  );
}

function Slide({ banner, first }: { banner: Banner; first: boolean }) {
  const picture = <BannerPicture banner={banner} first={first} />;
  if (!banner.link) return picture;
  const linkClass = "block rounded-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-amber-text";
  if (banner.link.startsWith("/")) {
    return <Link href={banner.link} className={linkClass}>{picture}</Link>;
  }
  return (
    <a href={banner.link} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {picture}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

// Home page banners, above the coin strip. Swipe on phones, arrows for mouse users, dots
// everywhere. Slides are as tall as the tallest picture, so the page below never jumps.
export function BannerSlider({ banners }: { banners: Banner[] }) {
  const row = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const many = banners.length > 1;

  const goTo = useCallback((index: number) => {
    const el = row.current;
    // On the row, not scrollIntoView: that could also move the page itself.
    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!many || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const el = row.current;
      if (document.hidden || !el || !el.clientWidth) return;
      goTo((Math.round(el.scrollLeft / el.clientWidth) + 1) % banners.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [many, paused, banners.length, goTo]);

  if (banners.length === 0) return null;

  const onScroll = () => {
    const el = row.current;
    if (el && el.clientWidth) setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };

  const arrow = "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border bg-card/95 text-foreground shadow-[var(--depth-shadow)] backdrop-blur-sm transition hover:scale-105 [@media(pointer:fine)]:grid";

  return (
    <section
      aria-label="Announcements"
      aria-roledescription={many ? "carousel" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      className="flex flex-col gap-1"
    >
      <div className="relative">
        {/* relative: keeps the sr-only text inside the slides from widening the page */}
        <div
          ref={row}
          onScroll={many ? onScroll : undefined}
          className="relative flex snap-x snap-mandatory items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {banners.map((banner, index) => (
            <div
              key={banner.id}
              role={many ? "group" : undefined}
              aria-roledescription={many ? "slide" : undefined}
              aria-label={many ? `${index + 1} of ${banners.length}` : undefined}
              className="w-full shrink-0 snap-start snap-always"
            >
              <Slide banner={banner} first={index === 0} />
            </div>
          ))}
        </div>
        {many && (
          <>
            <button type="button" onClick={() => goTo((current - 1 + banners.length) % banners.length)} aria-label="Previous banner" className={cn(arrow, "left-2")}>
              <ChevronLeftIcon className="size-5" />
            </button>
            <button type="button" onClick={() => goTo((current + 1) % banners.length)} aria-label="Next banner" className={cn(arrow, "right-2")}>
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="-mb-4 -mt-1 flex justify-center">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show banner ${index + 1} of ${banners.length}`}
              aria-current={index === current ? "true" : undefined}
              className="grid size-11 place-items-center"
            >
              <span className={cn("block h-2 rounded-full transition-all", index === current ? "w-5 bg-brand-amber-text" : "w-2 bg-muted-foreground/40")} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
