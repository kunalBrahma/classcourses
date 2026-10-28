import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/server-api";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { site } = await getSiteSettings();
  const base = site.frontendUrl.replace(/\/$/, "");
  return {
    // Account, profile and quiz pages have nothing to index.
    rules: { userAgent: "*", allow: "/", disallow: ["/login", "/register", "/forgot-password", "/reset-password", "/profile", "/quiz/", "/kit"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
