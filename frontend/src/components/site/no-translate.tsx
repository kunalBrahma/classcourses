// Keeps a name that stands alone as written when the page is translated (lib/language.ts).
// Not for a name inside a sentence: Google reorders the words around it, which breaks the grammar.
export function NoTranslate({ children }: { children: React.ReactNode }) {
  return (
    <span translate="no" className="notranslate">
      {children}
    </span>
  );
}
