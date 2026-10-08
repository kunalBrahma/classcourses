import "server-only";
import { cacheLife, cacheTag } from "next/cache";

// Server-side reads of public backend data, cached with Cache Components.
// Tags let a future revalidate hook refresh exactly what an admin changed.
// On API errors we fall back to safe defaults rather than failing the page
// (and the fallback is only cached briefly).

// Inside Docker/production the frontend can reach the API on a private URL.
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface SocialLinks {
  youtube: string | null;
  facebook: string | null;
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
}

export interface PublicSettings {
  site: { name: string; frontendUrl: string };
  contact: { email: string };
  social: SocialLinks;
  quiz: { questionsPerQuiz: number; secondsPerQuestion: number; passMark: number; dailyLimit: number };
  coins: { perPass: number; coinValuePaise: number; maxDiscountPercent: number };
}

const FALLBACK_SETTINGS: PublicSettings = {
  site: { name: "Class Course", frontendUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100" },
  contact: { email: "about.classcourse@gmail.com" },
  social: { youtube: null, facebook: null, instagram: null, twitter: null, linkedin: null },
  quiz: { questionsPerQuiz: 10, secondsPerQuestion: 10, passMark: 7, dailyLimit: 10 },
  coins: { perPass: 10, coinValuePaise: 10, maxDiscountPercent: 50 },
};

export async function getSiteSettings(): Promise<PublicSettings> {
  "use cache";
  cacheTag("settings");
  try {
    const { settings } = await getJson<{ settings: PublicSettings }>("/api/settings/public");
    cacheLife("minutes");
    return settings;
  } catch {
    cacheLife("seconds");
    return FALLBACK_SETTINGS;
  }
}

export interface PageLink {
  slug: string;
  title: string;
  updatedAt: string;
}

// Published static pages, in footer order (About, Contact, Privacy, Terms, Refund).
export async function getPublishedPages(): Promise<PageLink[]> {
  "use cache";
  cacheTag("pages");
  try {
    const { pages } = await getJson<{ pages: PageLink[] }>("/api/content/pages");
    cacheLife("minutes");
    return pages;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

export interface Medium {
  id: string;
  name: string;
  nativeName: string | null;
  slug: string;
}

export async function getMediums(): Promise<Medium[]> {
  "use cache";
  cacheTag("catalog");
  try {
    const { mediums } = await getJson<{ mediums: Medium[] }>("/api/catalog/mediums");
    cacheLife("minutes");
    return mediums;
  } catch {
    cacheLife("seconds");
    return [];
  }
}

// Reading the clock during prerender must be cached under Cache Components.
export async function getCurrentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
