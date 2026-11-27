import * as Sentry from "@sentry/nextjs";

// Sentry on the admin panel's server (server runtime). Loaded by src/instrumentation.ts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Off when no DSN was set at build time (local checkouts without it)
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  // Every trace locally; 10% in production (raise or lower with traffic)
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Privacy: most students are children, so nothing that identifies one is sent:
  // no IP or user fields, cookies, headers, bodies, query values, database
  // values or local variables. Errors, stack traces, timings and logs only.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
});
