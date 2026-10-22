import { revalidatePath, revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * On-demand cache invalidation, called by the API after a plan changes.
 *
 * The marketing pages cache the plan catalog under the `public-plans` tag. When
 * an Admin deletes, archives or reprices a plan, that cache would otherwise keep
 * advertising the old catalog until its TTL expired — a deleted plan is a
 * promise the site can no longer keep.
 *
 * Two details matter here:
 *
 * 1. **The path cannot start with `/api`.** Caddy sends `/api/*` on the web
 *    origin to the API, so a route handler there would never be reached. It
 *    lives at `/internal/revalidate` instead.
 * 2. **It is closed by default.** With no `REVALIDATE_TOKEN` configured the
 *    route refuses every request rather than allowing anonymous cache busting,
 *    and the token is compared in constant time.
 */

/** Paths whose rendered output embeds the catalog. */
const DEPENDENT_PATHS = ["/", "/pricing"] as const;

function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would leak the length as
  // an exception instead of a plain "no".
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<Response> {
  const expected = process.env.REVALIDATE_TOKEN;
  if (!expected) {
    return Response.json({ ok: false, error: "Revalidation is not configured" }, { status: 503 });
  }
  if (!tokenMatches(request.headers.get("x-advo-revalidate-token"), expected)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { tag?: string; reason?: string };
  // Only the catalog is addressable: a caller naming an arbitrary tag would turn
  // this endpoint into a way to empty the whole site's cache.
  if (body.tag !== "public-plans") {
    return Response.json({ ok: false, error: "Unknown tag" }, { status: 400 });
  }

  revalidateTag("public-plans");
  for (const path of DEPENDENT_PATHS) revalidatePath(path);

  return Response.json({ ok: true, tag: "public-plans", reason: body.reason ?? null });
}
