// Interactive question figures (27 Nov 2026): HTML/CSS/JS pasted by the admin.
// SAFETY: this is raw, unsanitised code. It must only ever be shown through
// <QuestionFigure> (a sandboxed iframe, never dangerouslySetInnerHTML), and only
// through buildFigureDoc(), which puts a no-network Content-Security-Policy
// first, before any of the author's code. The admin has an identical copy in
// admin/src/lib/figure.ts: keep the two in step.

export interface Figure {
  html: string;
  height: number | null;
  alt: string | null;
}

export const FIGURE_DEFAULT_HEIGHT = 320;

// Only what's inside the pasted file runs: inline scripts and styles, data:
// images, fonts and media. No CDNs, no fetch, no tracking, no forms.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/**
 * The iframe document. The CSP <meta> comes first of all: the browser puts it
 * in <head> before the author's own <html>/<head>/<script>, so it covers every
 * line of their code, whether they pasted a whole document or just a fragment.
 */
export const buildFigureDoc = (html: string) =>
  "<!DOCTYPE html>" +
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
  // So "100vh" / window.innerWidth mean the figure box, with no scrollbars from the default margin.
  "<style>html,body{margin:0}</style>" +
  html.replace(/^\s*<!doctype[^>]*>/i, "");
