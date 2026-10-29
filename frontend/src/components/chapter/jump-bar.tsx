// "Jump to" chips under the header, so a long chapter is easy to move around.
export function JumpBar({ links }: { links: { id: string; label: string; count?: number }[] }) {
  if (links.length < 2) return null;
  return (
    <nav aria-label="On this page" className="sticky top-16 z-30 -mx-4 mb-6 border-b bg-background/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-3">
      <ul className="scroll-row gap-2 pb-0 sm:flex-wrap">
        {links.map((l) => (
          <li key={l.id}>
            <a href={`#${l.id}`} className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-3.5 text-sm font-semibold hover:bg-secondary">
              {l.label}
              {l.count !== undefined && <span className="tabular-nums text-muted-foreground">{l.count}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
