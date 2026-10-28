import { getSiteSettings } from "@/lib/server-api";

// schema.org BreadcrumbList, so search results show "Class Course › Class 5 › …".
// `<` is escaped so text from the database can't close the script tag.
export async function BreadcrumbJsonLd({ items }: { items: { label: string; href: string }[] }) {
  const { site } = await getSiteSettings();
  const base = site.frontendUrl.replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: `${base}${c.href}` })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />;
}
