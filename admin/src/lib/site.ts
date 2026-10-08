// The student website (frontend app), for "View on site" links.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/+$/, "");
export const siteHost = SITE_URL.replace(/^https?:\/\//, "");
export const siteLink = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
