import type { NextConfig } from "next";
import path from "path";

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

export default nextConfig;
