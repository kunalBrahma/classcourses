// The student's chosen medium (header 🌐 switcher). A cookie, so the server
// can read it too (the home page shows that medium's classes).
export const MEDIUM_COOKIE = "cc_medium";
const MEDIUM_EVENT = "cc-medium";

export const readMediumCookie = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${MEDIUM_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const setMediumCookie = (slug: string) => {
  document.cookie = `${MEDIUM_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(MEDIUM_EVENT));
};

export const subscribeMedium = (onChange: () => void) => {
  window.addEventListener(MEDIUM_EVENT, onChange);
  return () => window.removeEventListener(MEDIUM_EVENT, onChange);
};
