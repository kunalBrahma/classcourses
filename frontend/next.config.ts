import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Production runs the self-contained server from .next/standalone (see Dockerfile).
  output: "standalone",
  // Cache Components: cached data via "use cache" + cacheLife/cacheTag (see src/lib/server-api.ts).
  cacheComponents: true,
  // Pins the project root so Next doesn't walk up to an unrelated lockfile
  // (e.g. a stray bun.lock in the home directory) and misdetect a monorepo.
  turbopack: {
    root: path.join(__dirname),
  },
};

// Sentry (Sitemaker Lab → classcourse-frontend). Source maps are uploaded only when
// SENTRY_AUTH_TOKEN is set at build time (CI secret), for readable stack traces.
export default withSentryConfig(nextConfig, {
  org: "sitemaker-lab-pr",
  project: "classcourse-frontend",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
});
