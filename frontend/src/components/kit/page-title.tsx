// Page heading for catalog pages: English name, Assamese name, a short line.
export function PageTitle({ title, nativeTitle, kicker, children }: {
  title: string;
  nativeTitle?: string | null;
  kicker?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {kicker && <p className="text-sm font-bold uppercase tracking-wider text-brand-amber-text">{kicker}</p>}
      <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {nativeTitle && (
        <p lang="as" className="mt-1 text-xl text-muted-foreground">
          {nativeTitle}
        </p>
      )}
      {children && <div className="mt-2 text-muted-foreground">{children}</div>}
    </header>
  );
}
