"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface BarPoint {
  day: string; // "YYYY-MM-DD" (IST)
  value: number;
}

const dayLabel = (day: string, long = false) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(long ? { weekday: "short" } : {}), timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

// Rounds the top of the scale to a friendly number so the gridline label reads well.
const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
};

// One series of daily bars (one hue, so no legend: the card title names it).
// Hover or focus a bar for its value; screen readers get a table instead.
export function BarChart({ points, format, label, className }: { points: BarPoint[]; format: (v: number) => string; label: string; className?: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const shown = active === null ? null : points[active];
  const gap = points.length > 45 ? "gap-px" : "gap-0.5";

  return (
    <figure className={cn("grid gap-2", className)} aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="sr-only">
        {label}, daily
      </figcaption>
      {/* Readout: the hovered day, or nothing (keeps the height steady). */}
      <p className="h-5 text-xs text-muted-foreground tabular-nums" aria-hidden="true">
        {shown ? (
          <>
            <span className="font-semibold text-foreground">{format(shown.value)}</span> · {dayLabel(shown.day, true)}
          </>
        ) : (
          "Hover a bar for the day's figure"
        )}
      </p>
      <div className="relative h-40 sm:h-48" aria-hidden="true">
        {/* Recessive grid: top value and the midpoint. */}
        {[1, 0.5].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2.5 right-0 bg-card pl-1 text-xs leading-none text-muted-foreground tabular-nums">{format(top * f)}</span>
          </div>
        ))}
        <div className={cn("absolute inset-0 flex items-end border-b border-border pr-12", gap)} onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => (
            <div
              key={p.day}
              className="group flex h-full min-w-0 flex-1 items-end"
              onMouseEnter={() => setActive(i)}
              onTouchStart={() => setActive(i)}
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-colors",
                  p.value > 0 ? "min-h-[3px]" : "min-h-px opacity-40",
                  active === i ? "bg-[var(--chart-bar-active)]" : "bg-[var(--chart-bar)]"
                )}
                style={{ height: `${(p.value / top) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between pr-12 text-xs text-muted-foreground" aria-hidden="true">
        <span>{dayLabel(points[0]?.day ?? "")}</span>
        {points.length > 2 && <span>{dayLabel(points[Math.floor(points.length / 2)].day)}</span>}
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{label}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td>{dayLabel(p.day, true)}</td>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
