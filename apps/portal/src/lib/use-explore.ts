"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { portalApi } from "@/lib/portal";
import type { PortalExplore } from "@/lib/portal-types";

/**
 * The connected page's Explore feed.
 *
 * Loaded once when the page paints so every tile can show how much is behind it,
 * then reloaded each time a tile is opened: the connected page is often left
 * open long after a guest has browsed away, and a menu that answers with the
 * list from an hour ago is a menu that lies about closing times and vacancies.
 *
 * A failed refresh keeps the last good feed on screen. The menus stay usable
 * with slightly old data instead of collapsing into an error, because the guest
 * has already paid and cannot fix an API problem from that page.
 */
export function useExploreFeed(slug: string, enabled = true) {
  const [feed, setFeed] = useState<PortalExplore | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const next = await portalApi.get<PortalExplore>(`/portal/sites/${encodeURIComponent(slug)}/explore`);
        if (!alive.current) return;
        setFeed(next);
        setFailed(false);
      } catch {
        if (alive.current) setFailed(true);
      } finally {
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [slug],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load("initial");
  }, [enabled, load]);

  /** Called when a menu opens, so the guest reads the current list. */
  const refresh = useCallback(() => load("refresh"), [load]);

  return { feed, loading, refreshing, failed, refresh };
}
