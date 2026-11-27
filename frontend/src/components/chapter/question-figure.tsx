import { buildFigureDoc, FIGURE_DEFAULT_HEIGHT, type Figure } from "@/lib/figure";
import { cn } from "@/lib/utils";

// A question's interactive figure, in a sealed box:
//  - sandbox="allow-scripts" WITHOUT allow-same-origin: the figure runs in an
//    opaque origin and can't read the site's cookies, localStorage (the sign-in
//    tokens), DOM or parent; no pop-ups, forms or navigating the page
//  - the document's own CSP (buildFigureDoc) blocks every network request
// Lazy by default; the timed quiz passes lazy={false} so it shows at once.
// Kept away from Google Translate (it would rewrite the figure's text and code).
export function QuestionFigure({ figure, lazy = true, className }: { figure: Figure; lazy?: boolean; className?: string }) {
  const height = figure.height ?? FIGURE_DEFAULT_HEIGHT;
  return (
    <figure translate="no" className={cn("notranslate my-3 w-full", className)}>
      <iframe
        srcDoc={buildFigureDoc(figure.html)}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading={lazy ? "lazy" : "eager"}
        title={figure.alt || "Interactive figure for this question"}
        // Tall figures never take more than 70% of a phone's screen
        style={{ height: `min(${height}px, 70vh)` }}
        className="block w-full rounded-xl border bg-white dark:border-white/10"
      />
      {figure.alt && <figcaption className="sr-only">{figure.alt}</figcaption>}
    </figure>
  );
}
