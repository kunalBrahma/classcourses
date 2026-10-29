import { getMediumClasses, getMediums } from "@/lib/server-api";

// The first and last class any medium lists ("Class 1", "Class 12"). Each
// medium's list is already in class order; merging keeps that order.
export async function classBounds(): Promise<{ first: string; last: string } | null> {
  const lists = (await Promise.all((await getMediums()).map((m) => getMediumClasses(m.slug).catch(() => null))))
    .map((m) => m?.classes.map((c) => c.name) ?? [])
    .filter((l) => l.length);
  const merged: string[] = [];
  for (const list of lists) {
    let at = -1;
    for (const name of list) {
      const found = merged.indexOf(name);
      if (found >= 0) at = found;
      else merged.splice(++at, 0, name);
    }
  }
  return merged.length ? { first: merged[0], last: merged[merged.length - 1] } : null;
}

// "from Class 2 to Class 12" (home page about box).
export async function classRange() {
  const b = await classBounds();
  return !b ? "" : b.first === b.last ? `in ${b.first}` : `from ${b.first} to ${b.last}`;
}
