import { publicPlanListSchema, type PublicPlan } from "@advo/contracts";

/**
 * Where the API listens, resolved for the server.
 *
 * Read straight from the environment rather than imported from `@/lib/api`: that
 * module builds a browser API client at import time, and a server component must
 * not pull it into the server graph just to learn a URL.
 */
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Seconds the pricing catalog may be served from cache.
 *
 * Admin changes a plan far less often than the page is viewed, so a short window
 * keeps the marketing site fast and still shows a repricing within minutes. It is
 * a marketing page, not a checkout: a stale price here is corrected the moment a
 * reseller signs in, where the plan is read live.
 */
const REVALIDATE_SECONDS = 300;

/**
 * The public plan catalog for the pricing pages.
 *
 * Returns `[]` rather than throwing when the API is unreachable. A marketing page
 * must not 500 because the API restarted, and the caller decides whether an empty
 * catalog means "show the fallback" or "hide the section" — this function never
 * makes that call on the page's behalf.
 */
export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/marketing/plans`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["public-plans"] },
    });
    if (!response.ok) return [];

    const parsed = publicPlanListSchema.safeParse(await response.json());
    // A schema drift must degrade to the fallback, not render half a price list.
    if (!parsed.success) return [];
    return parsed.data;
  } catch {
    return [];
  }
}

/**
 * Orders plans for display: cheapest first, with nothing else reordered.
 *
 * The API already sorts by price, but a cached or hand-seeded row can arrive in
 * any order, and "the entry tier leads" is a layout assumption the grid makes.
 */
export function orderPlansForDisplay(plans: PublicPlan[]): PublicPlan[] {
  return [...plans].sort((a, b) => Number(a.priceTzs) - Number(b.priceTzs));
}

/**
 * The plan a "Most Popular" badge belongs on.
 *
 * Deliberately a value judgment, kept in one place: the middle of the catalog is
 * the tier most operators land on — cheap enough to be credible, not the floor
 * tier that forces advertising. For a two-plan catalog it picks the dearer one,
 * and for a single plan nothing is highlighted so the badge cannot lie.
 */
export function popularPlanId(plans: PublicPlan[]): string | null {
  if (plans.length < 2) return null;
  const middle = plans[Math.floor(plans.length / 2)];
  return middle?.id ?? null;
}
