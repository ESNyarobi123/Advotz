"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AdvoSelect } from "@advo/ui";
import { MapPin, Wifi } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useResource } from "@/lib/hooks";

const STORAGE_KEY = "advo.reseller.siteScope";
const URL_PARAM = "site";

export type ScopedSite = {
  id: string;
  name: string;
  state: string;
  slug: string;
};

type SiteScopeValue = {
  siteId: string | null;
  site: ScopedSite | null;
  sites: ScopedSite[];
  setSiteId: (next: string | null) => void;
  loading: boolean;
  /** Appends `?siteId=` for API calls when a site is selected. */
  scoped: (path: string) => string;
  /** True on Wallet / Subscription / Support — money and tickets are reseller-wide. */
  isResellerWideRoute: boolean;
};

const SiteScopeContext = createContext<SiteScopeValue | null>(null);

const RESELLER_WIDE_PREFIXES = [
  "/reseller/wallet",
  "/reseller/subscription",
  "/reseller/support",
];

function readUrlSite(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(URL_PARAM);
}

function readStoredSite(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeUrlSite(siteId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (siteId) url.searchParams.set(URL_PARAM, siteId);
  else url.searchParams.delete(URL_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

function writeStoredSite(siteId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (siteId) localStorage.setItem(STORAGE_KEY, siteId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode / quota — ignore.
  }
}

function appendSiteId(path: string, siteId: string | null): string {
  if (!siteId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}siteId=${encodeURIComponent(siteId)}`;
}

function isResellerWide(pathname: string): boolean {
  return RESELLER_WIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function ResellerSiteScopeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sitesResource = useResource<ScopedSite[]>("/reseller/sites");
  const sites = sitesResource.data ?? [];
  const [siteId, setSiteIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Seed from URL, then localStorage, then fall back to All sites.
  useEffect(() => {
    const fromUrl = readUrlSite();
    const fromStore = readStoredSite();
    setSiteIdState(fromUrl ?? fromStore);
    setHydrated(true);
  }, []);

  // Drop a stale id once the site list arrives (archived / deleted / foreign).
  useEffect(() => {
    if (!hydrated || sitesResource.loading || !sitesResource.data) return;
    if (siteId && !sites.some((s) => s.id === siteId)) {
      setSiteIdState(null);
      writeUrlSite(null);
      writeStoredSite(null);
    }
  }, [hydrated, siteId, sites, sitesResource.data, sitesResource.loading]);

  const setSiteId = useCallback((next: string | null) => {
    setSiteIdState(next);
    writeUrlSite(next);
    writeStoredSite(next);
  }, []);

  // Keep the URL in sync when navigating between reseller routes.
  useEffect(() => {
    if (!hydrated) return;
    writeUrlSite(siteId);
  }, [hydrated, pathname, siteId]);

  const site = useMemo(
    () => (siteId ? sites.find((s) => s.id === siteId) ?? null : null),
    [siteId, sites],
  );

  const scoped = useCallback((path: string) => appendSiteId(path, siteId), [siteId]);

  const value = useMemo<SiteScopeValue>(
    () => ({
      siteId,
      site,
      sites,
      setSiteId,
      loading: !hydrated || sitesResource.loading,
      scoped,
      isResellerWideRoute: isResellerWide(pathname),
    }),
    [siteId, site, sites, setSiteId, hydrated, sitesResource.loading, scoped, pathname],
  );

  const showStickyBar = pathname !== "/reseller" && pathname.startsWith("/reseller");

  return (
    <SiteScopeContext.Provider value={value}>
      {showStickyBar ? <SiteScopeBar /> : null}
      {children}
    </SiteScopeContext.Provider>
  );
}

export function useSiteScope(): SiteScopeValue {
  const ctx = useContext(SiteScopeContext);
  if (!ctx) throw new Error("useSiteScope must be used inside ResellerSiteScopeProvider");
  return ctx;
}

/** Safe for screens that may render outside the provider during tests. */
export function useOptionalSiteScope(): SiteScopeValue | null {
  return useContext(SiteScopeContext);
}

export function SiteScopeSwitcher({
  variant = "compact",
}: {
  variant?: "hero" | "compact";
}) {
  const { t } = useI18n();
  const { siteId, sites, setSiteId, loading } = useSiteScope();
  const hero = variant === "hero";

  return (
    <label
      className={`flex min-w-0 items-center gap-2 ${hero ? "flex-col items-stretch sm:flex-row sm:items-center" : ""}`}
    >
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-wide text-advo-muted uppercase ${
          hero ? "sm:mr-1" : ""
        }`}
      >
        <MapPin className="size-3.5 text-advo-blue" />
        {t("reseller.scope.label")}
      </span>
      <AdvoSelect
        aria-label={t("reseller.scope.label")}
        className={hero ? "min-w-[220px] sm:w-72" : "min-w-[180px] max-w-[240px]"}
        disabled={loading || sites.length === 0}
        onChange={(e) => setSiteId(e.target.value || null)}
        value={siteId ?? ""}
      >
        <option value="">
          {sites.length > 0
            ? t("reseller.scope.allWithCount", { count: sites.length })
            : t("reseller.scope.all")}
        </option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </AdvoSelect>
      {sites.length === 0 && !loading ? (
        <span className="text-[11px] text-advo-muted">{t("reseller.scope.noSites")}</span>
      ) : null}
    </label>
  );
}

function SiteScopeBar() {
  const { t } = useI18n();
  const { isResellerWideRoute, site } = useSiteScope();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-advo-border/70 bg-advo-page/80 px-3.5 py-2.5 shadow-advo-card backdrop-blur-sm">
      {isResellerWideRoute ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-advo-gold/30 bg-advo-gold/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-advo-gold uppercase">
          <Wifi className="size-3" />
          {t("reseller.scope.resellerWide")}
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SiteScopeSwitcher variant="compact" />
          {site ? (
            <span className="truncate text-[11px] font-semibold text-advo-muted">
              {t("reseller.scope.siteCount", { name: site.name })}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
