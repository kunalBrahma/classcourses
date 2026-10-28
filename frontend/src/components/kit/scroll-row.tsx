"use client";

import { useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

// A sideways-scrolling row of cards (videos, news). Swipe on phones; on wide
// screens arrow buttons sit outside the cards (narrower mouse screens keep the
// native scrollbar); the row itself is focusable for arrow-key scrolling.
export function ScrollRow({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollBy = (direction: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={ref} role="region" aria-label={label} tabIndex={0} className="scroll-row -mx-4 px-4 pt-1 sm:mx-0 sm:px-0">
        {children}
      </div>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => scrollBy(side === "left" ? -1 : 1)}
          aria-label={side === "left" ? `Scroll ${label} left` : `Scroll ${label} right`}
          className={`absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border bg-card text-foreground shadow-[var(--depth-shadow)] transition hover:scale-105 xl:[@media(pointer:fine)]:grid ${
            side === "left" ? "-left-14" : "-right-14"
          }`}
        >
          {side === "left" ? <ChevronLeftIcon className="size-5" /> : <ChevronRightIcon className="size-5" />}
        </button>
      ))}
    </div>
  );
}
