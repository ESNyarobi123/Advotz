/**
 * Public portal cache.
 *
 * The guest portal is the one surface we serve to unauthenticated strangers at
 * scale, so the policy-resolved payload is cached — but a cache that can outlive
 * a plan change is worse than no cache at all, because it keeps serving a
 * previous plan's permissions.
 *
 * Two rules make that impossible:
 *
 * 1. **Every entry is stamped with the revision it was built from.** A read
 *    compares the caller's *live* revision against the stamped one and treats a
 *    mismatch as a miss, even when the TTL has not elapsed. Plan migration,
 *    renewal, or a portal-preference change all change the revision, so a stale
 *    entry can never be served.
 * 2. **Campaign writes bump a generation counter** that is part of every ads
 *    key, because authoring a campaign does not touch a site's revision.
 *
 * Keys are always scoped by site (or slug) and placement — never global — so one
 * plan's banner can never be handed to another plan's portal.
 */

type CacheEntry = {
  /** The revision this payload was resolved from. */
  revision: string;
  /** Absolute epoch ms after which the entry is unusable regardless of revision. */
  expiresAt: number;
  payload: unknown;
};

/**
 * Bounded LRU-ish store. `Map` preserves insertion order, so the oldest key is
 * the first one out when we hit the cap.
 */
const MAX_ENTRIES = 500;
const entries = new Map<string, CacheEntry>();

/**
 * Bumped whenever campaign data changes. Included in ads cache keys so a
 * newly authored or paused campaign takes effect on the next request instead of
 * at the end of a TTL.
 */
let campaignGeneration = 0;

/** Builds a namespaced key; every segment is required to keep keys site-scoped. */
export function portalCacheKey(...parts: Array<string | number>): string {
  return parts.join(":");
}

/** Reads a cache entry only when it is both unexpired and revision-current. */
export function readPortalCache<T>(key: string, revision: string): T | null {
  const hit = entries.get(key);
  if (!hit) return null;
  const stale = hit.revision !== revision || hit.expiresAt <= Date.now();
  if (stale) {
    entries.delete(key);
    return null;
  }
  // Refresh recency without changing the stamped revision.
  entries.delete(key);
  entries.set(key, hit);
  return hit.payload as T;
}

/** Stores a payload under the revision it was resolved from. */
export function writePortalCache<T>(key: string, revision: string, ttlMs: number, payload: T): void {
  if (ttlMs <= 0) return;
  if (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }
  entries.set(key, { revision, expiresAt: Date.now() + ttlMs, payload });
}

/**
 * Drops cache entries. Used for invalidation that a revision cannot express —
 * campaign authoring, plan publishing and migrations.
 *
 * With no prefix every public portal entry is dropped; pass a slug or site id to
 * limit the blast radius.
 */
export function invalidatePortalCache(prefix?: string): number {
  if (!prefix) {
    const size = entries.size;
    entries.clear();
    return size;
  }
  let removed = 0;
  for (const key of entries.keys()) {
    if (key.includes(prefix)) {
      entries.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * A plan change can alter every site's permissions, so it clears everything.
 * Kept as its own name because the call sites read as intent, not mechanism.
 */
export function invalidatePortalCacheForPlanChange(): void {
  invalidatePortalCache();
}

/** Raised by any campaign write so ads caches miss immediately. */
export function bumpCampaignGeneration(): void {
  campaignGeneration += 1;
  invalidatePortalCache("ads:");
}

/** Current campaign generation; folded into ads cache keys. */
export function currentCampaignGeneration(): number {
  return campaignGeneration;
}

/** Test/inspection helper: how many entries are currently held. */
export function portalCacheSize(): number {
  return entries.size;
}
