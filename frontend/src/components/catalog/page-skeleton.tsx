// Fallback while a catalog page streams in (pages not prerendered at build).
export function CatalogSkeleton({ tiles = false }: { tiles?: boolean }) {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="mb-4 h-5 w-40 rounded bg-accent" />
      <div className="mb-2 h-4 w-28 rounded bg-accent" />
      <div className="mb-6 h-9 w-64 max-w-full rounded-lg bg-accent" />
      {tiles ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-accent" />
          ))}
        </div>
      ) : (
        <div className="grid max-w-3xl gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-accent" />
          ))}
        </div>
      )}
    </div>
  );
}
