import { PortalHome, type PortalBootstrap, type PortalLoadFailure } from "./PortalHome";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Loads the guest bootstrap.
 *
 * The failure *kind* matters, so it is carried through instead of collapsed into
 * `null`: "this slug does not exist" is a permanent answer, while a 5xx or a
 * timeout is temporary and must offer a retry — never a made-up price list or an
 * invented permission.
 */
async function loadBootstrap(
  slug: string,
): Promise<{ bootstrap: PortalBootstrap | null; failure: PortalLoadFailure }> {
  try {
    const res = await fetch(`${API}/api/v1/portal/sites/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (res.status === 404) return { bootstrap: null, failure: "NOT_FOUND" };
    if (!res.ok) return { bootstrap: null, failure: "UNAVAILABLE" };
    return { bootstrap: (await res.json()) as PortalBootstrap, failure: "NONE" };
  } catch {
    // Network error or the API is down: retryable, not "not found".
    return { bootstrap: null, failure: "UNAVAILABLE" };
  }
}

export default async function PortalBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandSlug }, query] = await Promise.all([params, searchParams]);
  const { bootstrap, failure } = await loadBootstrap(brandSlug);
  const redirectParams = Object.fromEntries(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"));
  return <PortalHome slug={brandSlug} bootstrap={bootstrap} failure={failure} redirectParams={redirectParams} />;
}
