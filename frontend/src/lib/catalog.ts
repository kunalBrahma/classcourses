// Site links and labels for the catalog: /medium/class/subject/chapter.
export const catalogHref = (...slugs: string[]) => `/${slugs.join("/")}`;

// Placeholder chapters are titled "Chapter 7"; don't show "Chapter 7: Chapter 7".
export const isPlaceholderTitle = (number: number, title: string) => title.trim().toLowerCase() === `chapter ${number}`;

export const chapterName = (c: { number: number; title: string }) =>
  isPlaceholderTitle(c.number, c.title) ? `Chapter ${c.number}` : `Chapter ${c.number}: ${c.title}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
