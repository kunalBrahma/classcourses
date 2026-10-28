import { NoteCard } from "@/components/kit/note-card";
import { NoteActions } from "@/components/notes/note-actions";
import type { NoteItem } from "@/lib/notes";

// Notes as cards with their buttons. `subtitle` says where each note belongs.
export function NoteList({ notes, subtitle }: { notes: NoteItem[]; subtitle?: (n: NoteItem) => React.ReactNode }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {notes.map((n) => (
        <li key={n.id}>
          <NoteCard title={n.title} subtitle={subtitle?.(n)} isFree={n.isFree} pricePaise={n.pricePaise} className="h-full">
            <NoteActions note={n} />
          </NoteCard>
          {n.description && <p className="sr-only">{n.description}</p>}
        </li>
      ))}
    </ul>
  );
}
