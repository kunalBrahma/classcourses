import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

// Called by the API right after an admin changes something
// (backend src/services/siteRevalidate.service.ts), so the site shows the
// change at once instead of after its cached copy runs out. Only the API knows
// the shared INTERNAL_API_KEY. The tags are the ones in src/lib/server-api.ts.
const TAGS = new Set(["catalog", "pages", "blog", "settings"]);

const sameKey = (given: string | null, expected: string) => {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(request: Request) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key || !sameKey(request.headers.get("x-internal-key"), key)) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === "string" && TAGS.has(t)) : [];
  if (tags.length === 0) return Response.json({ error: "No known tags" }, { status: 400 });
  // "max" = stale-while-revalidate: the old copy is marked stale and rebuilt in
  // the background, so the change shows from the next visit on. NEVER use
  // { expire: 0 } here: with Cache Components it throws the cached data away,
  // the course pages' prebuilt parts become holes that client-side navigation
  // never receives, and every in-app tap crashes ("This page couldn't load",
  // React error #412). Proven 27 Nov 2026: 3/3 crashes after one refresh with
  // expire 0, 0/12 with "max". Prices stay safe: checkout refuses a price the
  // student wasn't shown (PRICE_CHANGED).
  for (const tag of tags) revalidateTag(tag, "max");
  return Response.json({ revalidated: tags });
}
