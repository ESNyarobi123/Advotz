"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicHotspot } from "@advo/contracts";
import { MapPin, Search, Wifi, ExternalLink } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { useI18n } from "@/lib/i18n";
import { cx } from "./ui";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

/** Tanzania-ish default view when there are no pins yet. */
const DEFAULT_CENTER: [number, number] = [-6.369, 34.8888];
const DEFAULT_ZOOM = 6;

type Props = {
  hotspots: PublicHotspot[];
};

export function HotspotsExplorer({ hotspots }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(hotspots[0]?.id ?? null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const h of hotspots) {
      const c = h.city.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [hotspots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hotspots.filter((h) => {
      if (city !== "ALL" && h.city.trim() !== city) return false;
      if (!q) return true;
      const hay = `${h.name} ${h.city} ${h.region} ${h.address} ${h.category} ${h.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [hotspots, query, city]);

  const selected = filtered.find((h) => h.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (selected && !filtered.some((h) => h.id === selected.id)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selected]);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    let cancelled = false;

    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current) return;

      // Next/webpack breaks Leaflet's default icon URLs; use CDN assets.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapEl.current, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    void (async () => {
      const L = await import("leaflet");
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();

      const bounds: import("leaflet").LatLngExpression[] = [];
      for (const h of filtered) {
        const marker = L.marker([h.latitude, h.longitude], { title: h.name });
        marker.on("click", () => setSelectedId(h.id));
        marker.addTo(map);
        markersRef.current.set(h.id, marker);
        bounds.push([h.latitude, h.longitude]);
      }

      if (bounds.length === 1) {
        map.setView(bounds[0] as [number, number], 14);
      } else if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    })();
  }, [filtered, mapReady]);

  useEffect(() => {
    if (!selected || !mapRef.current || !mapReady) return;
    const marker = markersRef.current.get(selected.id);
    if (marker) {
      mapRef.current.panTo(marker.getLatLng());
      marker.openPopup?.();
    } else {
      mapRef.current.panTo([selected.latitude, selected.longitude]);
    }
  }, [selected, mapReady]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
        <select
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
        <p className="shrink-0 text-xs font-semibold tracking-wide text-white/50 uppercase">{countLabel}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
        <div
          aria-label={t("marketing.hotspots.mapLabel")}
          className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-[#0f1114] sm:min-h-[480px]"
          ref={mapEl}
        />

        <div
          aria-label={t("marketing.hotspots.listLabel")}
          className="flex max-h-[480px] flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-2"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-white/60">{t("marketing.hotspots.emptyFilter")}</p>
          ) : (
            filtered.map((h) => {
              const active = selected?.id === h.id;
              return (
                <button
                  className={cx(
                    "w-full rounded-xl border px-3.5 py-3 text-left transition",
                    active
                      ? "border-[#FBA102]/50 bg-[#FBA102]/10"
                      : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5",
                  )}
                  key={h.id}
                  onClick={() => setSelectedId(h.id)}
                  type="button"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cx(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                        active ? "bg-[#FBA102] text-advo-charcoal" : "bg-white/10 text-[#FBA102]",
                      )}
                    >
                      <MapPin className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{h.name}</p>
                      <p className="mt-0.5 truncate text-xs text-white/55">
                        {[h.city, h.region].filter(Boolean).join(" · ") || h.address || "—"}
                      </p>
                      {h.category ? (
                        <span className="mt-1.5 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white/70 uppercase">
                          {h.category}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {selected ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.14em] text-[#FBA102] uppercase">
                {selected.category || t("marketing.hotspots.selectHint")}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">{selected.name}</h2>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-white/65">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FBA102]" />
                <span>
                  {[selected.address, selected.city, selected.region].filter(Boolean).join(", ") ||
                    `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`}
                </span>
              </p>
              {selected.description ? (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">{selected.description}</p>
              ) : null}
            </div>
            {selected.portalSlug ? (
              <a
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FBA102] px-4 py-2.5 text-sm font-bold text-advo-charcoal transition hover:bg-[#ffb326]"
                href={`${PORTAL_URL.replace(/\/$/, "")}/${encodeURIComponent(selected.portalSlug)}`}
                rel="noreferrer"
                target="_blank"
              >
                {t("marketing.hotspots.visitPortal")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-white/55">{t("marketing.hotspots.selectHint")}</p>
      )}
    </div>
  );
}
