"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@advo/contracts";
import { ApiError, api } from "@/lib/api";
import { HOME, type Role } from "@/features/shell/navigation";

/** Role home path for a session user (Admin / Reseller / Agent). */
export function dashboardHomeFor(user: Pick<SessionUser, "role">): string {
  return HOME[user.role as Role];
}

/**
 * Soft session probe for public/marketing surfaces.
 *
 * Uses the existing HttpOnly session cookie via `GET /auth/me`. A 401 means
 * logged out — never throws into the page. Dashboard routes still enforce
 * auth inside `DashboardShell`.
 */
export function useOptionalSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { user: me } = await api.me();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (!cancelled) {
          if (!(err instanceof ApiError && err.status === 401)) {
            // Network / 5xx — treat as logged out for the marketing chrome only.
          }
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading, dashboardHref: user ? dashboardHomeFor(user) : null };
}
