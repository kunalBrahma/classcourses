import Link from "next/link";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { ChapterList } from "@/components/catalog/chapter-list";
import { catalogHref, plural } from "@/lib/catalog";
import type { ClassSubjects } from "@/lib/server-api";

// Class page rule (requirements): each subject opens a dropdown of its
// chapters. Native <details> — works without JavaScript, keyboard and screen
// readers included; `name` keeps one open at a time where browsers support it.
export function SubjectAccordion({ data }: { data: ClassSubjects }) {
  const base = [data.medium.slug, data.classLevel.slug];
  return (
    <ul className="grid gap-3">
      {data.subjects.map((s) => (
        <li key={s.id}>
          <details name="subjects" className="card-3d group rounded-2xl">
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-snug">{s.name}</span>
                {s.nativeName && (
                  <span lang="as" className="as-text block leading-snug text-muted-foreground">
                    {s.nativeName}
                  </span>
                )}
                <span className="block text-sm text-muted-foreground">{plural(s.chapterCount, "chapter")}</span>
              </span>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-brand-amber-text transition group-open:rotate-180" aria-hidden="true">
                <ChevronDownIcon className="size-5" />
              </span>
            </summary>
            <div className="border-t px-2 pb-3 pt-3 sm:px-3">
              {s.chapterCount === 0 ? (
                <p className="px-2 py-3 text-muted-foreground">Chapters are being added. Please check back soon.</p>
              ) : (
                <ChapterList groups={s.groups} base={[...base, s.slug]} compact />
              )}
              <Link
                href={catalogHref(...base, s.slug)}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-amber-text hover:underline"
              >
                Open the {s.name} page <ArrowRightIcon className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
