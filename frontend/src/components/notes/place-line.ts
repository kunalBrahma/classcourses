import type { NoteItem } from "@/lib/notes";

// "Class 10 · Mathematics · Chapter 3": where a note belongs. Plain module so
// both server and client components can call it.
export const placeLine = (n: NoteItem) =>
  n.place ? `${n.place.classLevel.name} · ${n.place.subject.name}${n.place.chapter ? ` · Chapter ${n.place.chapter.number}` : ""}` : null;
