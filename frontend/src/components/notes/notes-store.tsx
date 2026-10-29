"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { NoteList } from "@/components/notes/note-list";
import { placeLine } from "@/components/notes/place-line";
import { readMediumCookie, subscribeMedium } from "@/lib/medium";
import type { NoteItem } from "@/lib/notes";
import { cn } from "@/lib/utils";

type Kind = "all" | "free" | "premium";

// The notes store: pick a medium and class, free or premium. Starts on the
// student's remembered medium (cc_medium cookie) when it has notes.
export function NotesStore({ notes }: { notes: NoteItem[] }) {
  const remembered = useSyncExternalStore(subscribeMedium, readMediumCookie, () => null);
  const mediums = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of notes) if (n.place) seen.set(n.place.medium.slug, n.place.medium.name);
    return [...seen].map(([slug, name]) => ({ slug, name }));
  }, [notes]);

  const [pickedMedium, setPickedMedium] = useState<string | null>(null);
  const medium = pickedMedium ?? (mediums.some((m) => m.slug === remembered) ? remembered : (mediums[0]?.slug ?? null));
  const [classSlug, setClassSlug] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("all");

  const inMedium = notes.filter((n) => !medium || n.place?.medium.slug === medium);
  const classes = [...new Map(inMedium.filter((n) => n.place).map((n) => [n.place!.classLevel.slug, n.place!.classLevel.name]))];
  const shown = inMedium.filter(
    (n) => (!classSlug || n.place?.classLevel.slug === classSlug) && (kind === "all" || (kind === "free") === n.isFree)
  );

  const chip = (active: boolean) =>
    cn("inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-semibold transition", active ? "press-3d border-transparent" : "bg-card hover:bg-accent");

  return (
    <div className="grid gap-5">
      {mediums.length > 1 && (
        <div role="radiogroup" aria-label="Medium" className="flex flex-wrap gap-2">
          {mediums.map((m) => (
            <button key={m.slug} type="button" role="radio" aria-checked={m.slug === medium} onClick={() => { setPickedMedium(m.slug); setClassSlug(null); }} className={chip(m.slug === medium)}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-2">
        <div role="radiogroup" aria-label="Class" className="scroll-row gap-2 pb-1 sm:flex-wrap">
          <button type="button" role="radio" aria-checked={!classSlug} onClick={() => setClassSlug(null)} className={chip(!classSlug)}>
            All classes
          </button>
          {classes.map(([slug, name]) => (
            <button key={slug} type="button" role="radio" aria-checked={classSlug === slug} onClick={() => setClassSlug(slug)} className={chip(classSlug === slug)}>
              {name}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Price" className="flex flex-wrap gap-2">
          {(["all", "free", "premium"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
              {k === "all" ? "All" : k === "free" ? "Free" : "Premium"}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="card-3d rounded-2xl p-6 text-center text-muted-foreground">No notes here yet. Try another class.</p>
      ) : (
        <NoteList notes={shown} subtitle={placeLine} />
      )}
    </div>
  );
}
