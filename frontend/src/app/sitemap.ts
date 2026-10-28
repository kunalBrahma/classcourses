import type { MetadataRoute } from "next";
import { classParams, subjectParams } from "@/lib/catalog-params";
import { catalogHref } from "@/lib/catalog";
import { getFaq, getMediums, getPublishedPages, getSiteSettings, getSubject } from "@/lib/server-api";

// Every public catalog page plus the published static pages. All reads are
// cached (tag "catalog"/"pages"), so the sitemap refreshes with the catalog.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ site }, mediums, pages, classes, subjects, faq] = await Promise.all([
    getSiteSettings(),
    getMediums(),
    getPublishedPages(),
    classParams(),
    subjectParams(),
    getFaq(),
  ]);
  const base = site.frontendUrl.replace(/\/$/, "");
  const url = (path: string) => `${base}${path}`;

  const chapters = (
    await Promise.all(
      subjects.map(async (p) => {
        const s = await getSubject(p.medium, p.classSlug, p.subject);
        return (s?.groups ?? []).flatMap((g) => g.chapters.map((c) => catalogHref(p.medium, p.classSlug, p.subject, c.slug)));
      })
    )
  ).flat();

  return [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/notes"), changeFrequency: "daily", priority: 0.8 },
    ...(faq.length ? [{ url: url("/faq"), changeFrequency: "monthly" as const, priority: 0.4 }] : []),
    ...mediums.map((m) => ({ url: url(catalogHref(m.slug)), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...classes.map((c) => ({ url: url(catalogHref(c.medium, c.classSlug)), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...subjects.map((s) => ({ url: url(catalogHref(s.medium, s.classSlug, s.subject)), changeFrequency: "weekly" as const, priority: 0.7 })),
    ...chapters.map((href) => ({ url: url(href), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...pages.map((p) => ({ url: url(`/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
