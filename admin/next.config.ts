import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pins the project root so Next doesn't walk up to an unrelated lockfile
  // (e.g. a stray bun.lock in the home directory) and misdetect a monorepo.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
