"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicHotspot } from "@advo/contracts";
import {
  ChevronDown,
  ExternalLink,
  MapPinned,
  Navigation,
  Search,
  Wifi,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cx } from "./ui";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

type Props = {
  hotspots: PublicHotspot[];
};

/** Opens Google Maps at the hotspot coordinates (new tab). */
function googleMapsUrl(h: PublicHotspot): string {
  const q = `${h.latitude},${h.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

function placeLine(h: PublicHotspot): string {
  return [h.city, h.region].filter(Boolean).join(" · ") || h.address || "—";
}

export function HotspotsExplorer({ hotspots }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("ALL");
  const [city, setCity] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const h of hotspots) {
      const r = h.region.trim();
      if (r) set.add(r);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [hotspots]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const h of hotspots) {
      if (region !== "ALL" && h.region.trim() !== region) continue;
      const c = h.city.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [hotspots, region]);

  // When the region changes, drop a city that is no longer in scope.
  useEffect(() => {
    if (city !== "ALL" && !cities.includes(city)) setCity("ALL");
  }, [cities, city]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hotspots.filter((h) => {
      if (region !== "ALL" && h.region.trim() !== region) return false;
      if (city !== "ALL" && h.city.trim() !== city) return false;
      if (!q) return true;
      const hay = `${h.name} ${h.city} ${h.region} ${h.address} ${h.category} ${h.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [hotspots, query, region, city]);

  useEffect(() => {
    if (expandedId && !filtered.some((h) => h.id === expandedId)) {
      setExpandedId(null);
    }
  }, [filtered, expandedId]);

  const countLabel =
    filtered.length === 1
      ? t("marketing.hotspots.countOne")
      : t("marketing.hotspots.count", { count: filtered.length });

  if (hotspots.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#FBA102]/15 text-[#FBA102]">
          <Wifi className="h-6 w-6" />
        </span>
        <p className="mt-4 text-sm text-white/70">{t("marketing.hotspots.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pr-3 pl-10 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#FBA102]/60"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("marketing.hotspots.searchPlaceholder")}
            type="search"
            value={query}
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            aria-label={t("marketing.hotspots.allRegions")}
            className="rounded-xl border border-white/15 bg-[#1a1c1f] px-3 py-2.5 text-sm text-white outline-none focus:border-[#FBA102]/60"
            onChange={(e) => setRegion(e.target.value)}
            value={region}
          >
            <option value="ALL">{t("marketing.hotspots.allRegions")}</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            aria-label={t("marketing.hotspots.allCities")}
            className="rounded-xl border border-white/15 bg-[#1a1c1f] px-3 py-2.5 text-sm text-white outline-none focus:border-[#FBA102]/60"
            onChange={(e) => setCity(e.target.value)}
            value={city}
          >
            <option value="ALL">{t("marketing.hotspots.allCities")}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="shrink-0 text-xs font-semibold tracking-wide text-white/50 uppercase sm:pl-1">
            {countLabel}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-12 text-center text-sm text-white/60">
          {t("marketing.hotspots.emptyFilter")}
        </p>
      ) : (
        <ul aria-label={t("marketing.hotspots.listLabel")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((h) => {
            const open = expandedId === h.id;
            return (
              <li key={h.id}>
                <article
                  className={cx(
                    "overflow-hidden rounded-2xl border transition",
                    open
                      ? "border-[#FBA102]/45 bg-[#FBA102]/10 shadow-[0_0_0_1px_rgba(251,161,2,0.12)]"
                      : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]",
                  )}
                >
                  <button
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left"
                    onClick={() => setExpandedId(open ? null : h.id)}
                    type="button"
                  >
                    <span
                      className={cx(
                        "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                        open ? "bg-[#FBA102] text-advo-charcoal" : "bg-white/10 text-[#FBA102]",
                      )}
                    >
                      <MapPinned className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-sm font-black tracking-tight text-white">{h.name}</h2>
                        <ChevronDown
                          className={cx(
                            "mt-0.5 h-4 w-4 shrink-0 text-white/45 transition-transform",
                            open && "rotate-180 text-[#FBA102]",
                          )}
                        />
                      </div>
                      <p className="mt-1 truncate text-xs text-white/55">{placeLine(h)}</p>
                      {h.category ? (
                        <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white/70 uppercase">
                          {h.category}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  {open ? (
                    <div className="space-y-3 border-t border-white/10 px-4 pt-3 pb-4">
                      {h.address ? (
                        <p className="text-xs leading-relaxed text-white/65">{h.address}</p>
                      ) : null}
                      {h.description ? (
                        <p className="text-sm leading-relaxed text-white/75">{h.description}</p>
                      ) : (
                        <p className="text-xs text-white/45">{t("marketing.hotspots.noDescription")}</p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#FBA102]/40 bg-[#FBA102]/15 px-3 py-2 text-xs font-bold text-[#FBA102] transition hover:bg-[#FBA102]/25"
                          href={googleMapsUrl(h)}
                          onClick={(e) => e.stopPropagation()}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          {t("marketing.hotspots.openMaps")}
                        </a>
                        {h.portalSlug ? (
                          <a
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#FBA102] px-3 py-2 text-xs font-bold text-advo-charcoal transition hover:bg-[#ffb326]"
                            href={`${PORTAL_URL.replace(/\/$/, "")}/${encodeURIComponent(h.portalSlug)}`}
                            onClick={(e) => e.stopPropagation()}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {t("marketing.hotspots.visitPortal")}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
