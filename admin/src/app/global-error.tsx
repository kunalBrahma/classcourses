"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Last-resort error page: shown when the whole app crashes in the browser (the
// root layout itself failed). It replaces Next.js's bare "This page couldn't
// load" screen, and reports the crash to Sentry. Plain inline styles, because
// the site's stylesheet may be what failed to load.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff7e8", color: "#3a2a00", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 24px", lineHeight: 1.5 }}>Class Course Admin couldn&apos;t load this page. Please reload it. If it keeps happening, try again in a few minutes.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ minHeight: 48, padding: "0 24px", border: 0, borderRadius: 14, background: "#f5a623", color: "#3a2a00", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
