"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A sideways-scrolling row of cards (videos, news). No scrollbar anywhere:
// phones swipe; mouse users get arrow buttons (outside the cards on wide
// screens, over the card edges on narrower ones), shown only when there is
// more to see that way. The row is focusable for arrow-key scrolling.
export function ScrollRow({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((cur) => (cur.left === left && cur.right === right ? cur : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const scrollBy = (direction: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={ref} role="region" aria-label={label} tabIndex={0} onScroll={measure} className="scroll-row -mx-4 px-4 pt-1 sm:mx-0 sm:px-0">
        {children}
      </div>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          tabIndex={-1}
          onClick={() => scrollBy(side === "left" ? -1 : 1)}
          aria-label={side === "left" ? `Scroll ${label} left` : `Scroll ${label} right`}
          className={cn(
            "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border bg-card/95 text-foreground shadow-[var(--depth-shadow)] backdrop-blur-sm transition hover:scale-105",
            edges[side] && "[@media(pointer:fine)]:grid",
            side === "left" ? "left-2 min-[1400px]:-left-14" : "right-2 min-[1400px]:-right-14"
          )}
        >
          {side === "left" ? <ChevronLeftIcon className="size-5" /> : <ChevronRightIcon className="size-5" />}
        </button>
      ))}
    </div>
  );
}
