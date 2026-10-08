// Shapes returned by the backend's /api/admin catalog routes.

export interface Medium {
  id: string;
  name: string;
  nativeName: string | null;
  slug: string;
  order: number;
  isActive: boolean;
  subjectCount: number;
}

// A class / grade ("Class 5", "LKG", …), shared by every medium.
export interface ClassRef {
  id: string;
  name: string;
  nativeName?: string | null;
  slug: string;
}

export interface ClassLevel extends ClassRef {
  nativeName: string | null;
  order: number;
  isActive: boolean;
  subjectCount: number;
  quizCount: number;
  // subjects per medium id
  subjectsByMedium: Record<string, number>;
}

export interface SubjectRow {
  id: string;
  mediumId: string;
  name: string;
  nativeName: string | null;
  slug: string;
  order: number;
  isActive: boolean;
  classLevel: ClassRef;
  partCount: number;
  chapterCount: number;
  medium: { id: string; name: string; slug: string };
}

export interface Part {
  id: string;
  subjectId: string;
  title: string;
  order: number;
}

export interface Chapter {
  id: string;
  subjectId: string;
  partId: string | null;
  number: number;
  title: string;
  slug: string;
  order: number;
  isPublished: boolean;
  aboutHtml: string | null;
}

export interface SubjectTree {
  id: string;
  mediumId: string;
  name: string;
  nativeName: string | null;
  slug: string;
  isActive: boolean;
  classLevel: ClassRef;
  medium: { id: string; name: string; slug: string };
  parts: Part[];
  // In reading order: no-part chapters first, then each part.
  chapters: Chapter[];
}

// Same rule as the backend's slugify (ASCII, hyphenated).
export const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// Returns the list with item `index` moved one step up (-1) or down (+1).
export const move = <T,>(list: T[], index: number, direction: -1 | 1): T[] => {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
