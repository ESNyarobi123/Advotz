/**
 * On-demand revalidation of the public plan catalog.
 *
 * The marketing pages render the plan catalog with a cached `fetch` (tag
 * `public-plans`). That cache lives in the Next.js web process, which is a
 * different process — often a different container — from this API, so the only
 * way to make an Admin's change visible immediately is to tell that process to
 * drop the entry.
 *
 * Two rules keep this from becoming a liability:
 *
 * 1. **A failure never fails the mutation.** The plan is already committed by the
 *    time this runs; throwing here would show the operator an error for a change
 *    that succeeded. Every path returns normally and the page's own TTL is the
 *    backstop.
 * 2. **It is bounded.** A short timeout means a wedged web container cannot hold
 *    an Admin's request open.
 *
 * When `WEB_INTERNAL_URL` is unset (a deployment without the web app, or a test)
 * this is a no-op rather than an error.
 */

const REVALIDATE_TIMEOUT_MS = 2_000;

/** The web app's own origin, reachable server-to-server. */
function webOrigin(): string | null {
  const url = process.env.WEB_INTERNAL_URL ?? process.env.WEB_PUBLIC_URL;
  return url ? url.replace(/\/+$/, "") : null;
}

let warnedMissingToken = false;

/**
 * Drops the cached public catalog so the next visitor sees the current plans.
 *
 * Fire-and-forget by design: callers use `void revalidatePublicPlans(…)` and a
 * slow or unreachable web process costs the operator nothing.
 */
export async function revalidatePublicPlans(reason: string): Promise<void> {
  const origin = webOrigin();
  const token = process.env.REVALIDATE_TOKEN;
  if (!origin) return;

  // Without a token the endpoint refuses, so calling would only produce noise.
  // Warn once per process: repeating it on every plan edit teaches nobody.
  if (!token) {
    if (!warnedMissingToken) {
      warnedMissingToken = true;
      console.warn(
        "[revalidate] REVALIDATE_TOKEN is not set — public plan changes will appear only after the page's cache window.",
      );
    }
    return;
  }

  try {
    const response = await fetch(`${origin}/internal/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-advo-revalidate-token": token },
      body: JSON.stringify({ tag: "public-plans", reason }),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[revalidate] web refused the request (${response.status}) for ${reason}`);
    }
  } catch (error) {
    // A deployed API with no reachable web process is a misconfiguration worth
    // seeing in the logs, but never a reason to fail the operator's action.
    console.warn(`[revalidate] could not reach ${origin} for ${reason}:`, (error as Error).message);
  }
}
