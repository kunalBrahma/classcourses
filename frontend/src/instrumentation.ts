import * as Sentry from "@sentry/nextjs";

// Starts Sentry on the server (Node.js or edge runtime).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors from Server Components, route handlers and proxies
export const onRequestError = Sentry.captureRequestError;
