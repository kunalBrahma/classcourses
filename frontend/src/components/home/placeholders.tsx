import { PlayIcon } from "lucide-react";
import { NoteCard } from "@/components/kit/note-card";
import { ScrollRow } from "@/components/kit/scroll-row";

// Shown on the home page until the admin adds real content, so every section
// of the mock is there from day one. Nothing here is clickable or priced:
// students only ever see real notes and videos once they exist.

export function NotePlaceholders() {
  const soon = "inline-flex h-11 cursor-not-allowed items-center rounded-xl border-2 border-dashed px-4 text-sm font-bold text-muted-foreground";
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label="Notes coming soon">
      <li>
        <NoteCard title="Free chapter notes" subtitle="Coming soon for your class" isFree pricePaise={0} className="h-full">
          <span className={soon} aria-disabled="true">
            Coming soon
          </span>
        </NoteCard>
      </li>
      <li>
        <article className="card-3d h-full rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold leading-snug">Premium PDF notes</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Coming soon · pay less with your quiz coins</p>
            </div>
            <span className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-extrabold tracking-wide text-brand-amber-text">PREMIUM</span>
          </div>
          <div className="mt-3 flex justify-end">
            <span className={soon} aria-disabled="true">
              Coming soon
            </span>
          </div>
        </article>
      </li>
    </ul>
  );
}

export function VideoPlaceholders() {
  return (
    <ScrollRow label="Videos coming soon">
      {["Chapter explained", "Easy tricks", "Quick revision"].map((title) => (
        <div key={title} className="card-3d w-52 overflow-hidden rounded-[15px] p-0">
          <div className="grid aspect-video place-items-center bg-[image:var(--header-bg)]" aria-hidden="true">
            <span className="grid size-11 place-items-center rounded-full bg-black/45 text-white">
              <PlayIcon className="ml-0.5 size-5 fill-current" />
            </span>
          </div>
          <div className="p-3">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">Video lessons coming soon</p>
          </div>
        </div>
      ))}
    </ScrollRow>
  );
}
