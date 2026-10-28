import "server-only";
import { getClassSubjects, getMediumClasses, getMediums, getSubject } from "@/lib/server-api";

// Full param lists for generateStaticParams. Each catalog level lives in a
// page (not a layout), so a child route doesn't receive its parent's params:
// every level lists its whole path from the top. All reads are cached.
// If the API is unreachable at build time, a placeholder keeps the build
// going (Cache Components needs ≥ 1 param); it renders the not-found page.
export const NONE = "__none__";

export async function classParams() {
  const mediums = await getMediums();
  const lists = await Promise.all(mediums.map(async (m) => ({ m, data: await getMediumClasses(m.slug) })));
  return lists.flatMap(({ m, data }) => (data?.classes ?? []).map((c) => ({ medium: m.slug, classSlug: c.slug })));
}

export async function subjectParams() {
  const classes = await classParams();
  const lists = await Promise.all(classes.map(async (p) => ({ p, data: await getClassSubjects(p.medium, p.classSlug) })));
  return lists.flatMap(({ p, data }) => (data?.subjects ?? []).map((s) => ({ ...p, subject: s.slug })));
}

// The first chapter of every subject; the rest render on first visit.
export async function chapterParams() {
  const subjects = await subjectParams();
  const firsts = await Promise.all(
    subjects.map(async (p) => {
      const s = await getSubject(p.medium, p.classSlug, p.subject);
      const first = s?.groups[0]?.chapters[0];
      return first ? { ...p, chapter: first.slug } : null;
    })
  );
  return firsts.filter((x) => x !== null);
}

export const orPlaceholder = <T extends Record<string, string>>(list: T[], placeholder: T) => (list.length ? list : [placeholder]);
