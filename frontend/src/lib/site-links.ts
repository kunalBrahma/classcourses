import type { PageLink } from "@/lib/server-api";

// The site's own pages, always linked from the footer and menu (as in the
// client's mock). A page the owner hasn't published yet shows "Coming soon".
export const STATIC_LINKS: { slug: string; title: string }[] = [
  { slug: "about", title: "About Us" },
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "terms", title: "Terms & Conditions" },
  { slug: "refund-policy", title: "Refund Policy" },
  { slug: "contact", title: "Contact Us" },
];

// Published titles win (the owner may rename a page).
export const siteLinks = (published: PageLink[], hasFaq: boolean) => [
  ...STATIC_LINKS.map((l) => ({ ...l, title: published.find((p) => p.slug === l.slug)?.title ?? l.title })),
  ...(hasFaq ? [{ slug: "faq", title: "Questions & Answers" }] : []),
];

// Shown in the "Latest news" row until the admin adds links (Admin → News
// links). These are the sources from the client's home-page mock (#35).
export const DEFAULT_NEWS = [
  { id: "default-1", source: "India Today", title: "Education & school updates", url: "https://www.indiatoday.in/education-today" },
  { id: "default-2", source: "Indian Express", title: "National education news", url: "https://indianexpress.com/section/education/" },
  { id: "default-3", source: "Just Rangaloo Things", title: "Assam & NE India local news", url: "https://justrangaloothings.in" },
  { id: "default-4", source: "Al Jazeera", title: "International news", url: "https://www.aljazeera.com" },
];
