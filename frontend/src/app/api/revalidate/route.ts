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
  // expire 0: the next visit gets fresh data, never the old copy.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
