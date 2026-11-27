import * as Sentry from "@sentry/node";
import { env } from "./config/env";

// Sentry error monitoring for the API (Sitemaker Lab → classcourse-server).
// Imported FIRST in src/server.ts, before Express, so Sentry can instrument it.
// Off when SENTRY_DSN is unset (tests, local checkouts without it).
//
// Privacy: most students are children, so nothing that identifies one is sent —
// no IP or user fields, cookies, headers, request/response bodies, query values,
// database query values or local variables. Errors, stack traces, timings and
// logs only. Expected 4xx (wrong password, validation…) are not reported.
if (env.SENTRY_DSN && env.NODE_ENV !== "test") {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    // Every request locally; 10% in production (raise or lower with traffic)
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
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
}
