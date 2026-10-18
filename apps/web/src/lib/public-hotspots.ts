import { publicHotspotListSchema, type PublicHotspot } from "@advo/contracts";

/**
 * Where the API listens, resolved for the server.
 * Same sourcing rule as `public-plans.ts` — do not import the browser API client.
 */
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const REVALIDATE_SECONDS = 120;

/**
 * Active curated hotspots for the public marketing map.
 * Returns `[]` when the API is unreachable so the page can show an empty state.
 */
export async function fetchPublicHotspots(): Promise<PublicHotspot[]> {
  try {
    const response = await fetch(`${API_URL}/api/v1/marketing/hotspots`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["public-hotspots"] },
    });
    if (!response.ok) return [];

    const parsed = publicHotspotListSchema.safeParse(await response.json());
    if (!parsed.success) return [];
    return parsed.data;
  } catch {
    return [];
  }
}
