import { SITE_URL } from "@/lib/site";

// Home page banner (/api/admin/banners).
export interface Banner {
  id: string;
  altText: string;
  imageUrl: string;
  imageSmallUrl: string;
  width: number;
  height: number;
  mobileImageUrl: string | null;
  mobileWidth: number | null;
  mobileHeight: number | null;
  // A page on this site ("/notes"), a full http(s) link, or null
  link: string | null;
  order: number;
  isActive: boolean;
}

// The name to show for a banner in the admin; the description is optional.
export const bannerName = (banner: Banner, index: number) => banner.altText || `Banner ${index + 1}`;

export type LinkKind = "none" | "site" | "web";

// What the link picker edits. `web` keeps the admin's typing as it is until saving.
export interface LinkForm {
  kind: LinkKind;
  site: string;
  web: string;
}

export const linkFormFrom = (link: string | null | undefined): LinkForm => {
  if (!link) return { kind: "none", site: "", web: "" };
  if (link.startsWith("/")) return { kind: "site", site: link, web: "" };
  return { kind: "web", site: "", web: link };
};

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

// Turns the picker's state into the value to save. Throws a message for the form.
export const linkFromForm = (form: LinkForm): string | null => {
  if (form.kind === "none") return null;
  if (form.kind === "site") {
    if (!form.site) throw new Error("Choose the page it opens, or pick “No link”.");
    return form.site;
  }
  const typed = form.web.trim();
  if (!typed) throw new Error("Paste the website link, or pick “No link”.");
  if (typed.startsWith("/")) return typed;
  // A link pasted without https:// still works.
  const full = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
  // A pasted link to our own site stays in the same tab.
  try {
    const url = new URL(full);
    if (bareHost(url.host) === bareHost(new URL(SITE_URL).host)) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // Not a real link: the server's check gives the message.
  }
  return full;
};

// Short text for the banner list.
export const describeLink = (link: string | null) => {
  if (!link) return "No link";
  if (link.startsWith("/")) return "Opens a page on this site";
  try {
    return `Opens ${new URL(link).hostname.replace(/^www\./, "")}`;
  } catch {
    return link;
  }
};
