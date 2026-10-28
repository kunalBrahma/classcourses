import { DifficultyBadge } from "@/components/chapter/difficulty-badge";
import type { QaItem } from "@/lib/server-api";

// Question-answers: question, then the answer in a tinted box. The HTML was
// sanitised by the backend on save (the XSS boundary), so it renders as-is.
export function QaList({ items }: { items: QaItem[] }) {
  return (
    <ol className="grid gap-4">
      {items.map((q, i) => (
        <li key={q.id} className="card-3d rounded-xl p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded-lg bg-accent px-2 py-0.5 font-heading text-sm font-extrabold tabular-nums text-brand-amber-text">
              Q{i + 1}
            </span>
            <div className="rich min-w-0 flex-1 font-semibold" lang="as" dangerouslySetInnerHTML={{ __html: q.question }} />
            <DifficultyBadge value={q.difficulty} />
          </div>
          <div className="mt-3 rounded-xl border-l-4 border-brand-amber bg-secondary/70 px-4 py-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-amber-text">Answer</p>
            <div className="rich" lang="as" dangerouslySetInnerHTML={{ __html: q.answer }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
