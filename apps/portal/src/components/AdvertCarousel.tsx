"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PortalAdvert } from "@/lib/portal-types";
import { useLocale } from "@/lib/portal";

const SWIPE_THRESHOLD = 40;

/**
 * Sliding advert banner for the guest welcome screen.
 *
 * Mirrors the simulator's carousel: auto-rotation (unless the visitor prefers
 * reduced motion), prev/next/pause controls and touch swiping. Content comes
 * from the reseller's portal content, so it is per-site.
 */
export function AdvertCarousel({ adverts, intervalMs }: { adverts: PortalAdvert[]; intervalMs: number }) {
  const { t } = useLocale();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchStart = useRef<number | null>(null);
  const count = adverts.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Keep the index valid if the reseller trims the list.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const move = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((prev) => (prev + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (paused || reduced || count < 2) return;
    const id = setInterval(() => move(1), Math.max(2000, intervalMs));
    return () => clearInterval(id);
  }, [paused, reduced, count, intervalMs, move]);

  const slides = useMemo(() => adverts.filter((ad) => ad.title.trim().length > 0), [adverts]);
  if (slides.length === 0) return null;

  const active = Math.min(index, slides.length - 1);
  const playing = !paused && !reduced && slides.length > 1;

  return (
    <div
      aria-label={t("portal.advertBadge")}
      aria-roledescription="carousel"
      className="relative mb-4 overflow-hidden rounded-[22px] shadow-inner"
      style={{ height: 190, touchAction: "pan-y", background: "var(--advo-blue)" }}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const end = event.changedTouches[0]?.clientX ?? touchStart.current;
        const difference = end - touchStart.current;
        touchStart.current = null;
        if (Math.abs(difference) > SWIPE_THRESHOLD) {
          setPaused(false);
          move(difference < 0 ? 1 : -1);
        }
      }}
    >
      <div className="flex h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${active * 100}%)` }}>
        {slides.map((ad, i) => (
          <div
            aria-hidden={i !== active}
            className="relative h-full min-w-0 flex-[0_0_100%] overflow-hidden px-5 pb-12 pt-10 text-white"
            key={`${ad.title}-${i}`}
            style={{
              backgroundImage: ad.imageUrl
                ? `linear-gradient(120deg, ${ad.color}dd, #061d48cc), url(${ad.imageUrl})`
                : `linear-gradient(120deg, ${ad.color}, #061d48)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <span className="absolute -right-16 -top-16 h-44 w-44 rounded-full border-[25px] border-white/10" aria-hidden />
            <strong className="relative block text-lg font-black leading-tight drop-shadow-sm">{ad.title}</strong>
            {ad.copy ? <p className="relative mt-1 max-w-[85%] text-sm text-white/85">{ad.copy}</p> : null}
          </div>
        ))}
      </div>

      <span className="absolute left-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
        {t("portal.advertBadge")}
      </span>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 pb-2">
        <div className="flex items-center gap-1">
          <CarouselButton label={t("portal.advertPrev")} onClick={() => { setPaused(false); move(-1); }}>
            ‹
          </CarouselButton>
          <span className="min-w-8 text-center text-[11px] font-bold text-white/90">
            {t("portal.advertPosition", { current: active + 1, total: slides.length })}
          </span>
          <CarouselButton label={t("portal.advertNext")} onClick={() => { setPaused(false); move(1); }}>
            ›
          </CarouselButton>
        </div>
        {slides.length > 1 ? (
          <CarouselButton
            label={playing ? t("portal.advertPause") : t("portal.advertPlay")}
            onClick={() => setPaused((prev) => !prev)}
          >
            {playing ? "❚❚" : "▶"}
          </CarouselButton>
        ) : null}
      </div>
    </div>
  );
}

function CarouselButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-full bg-black/30 text-sm font-bold text-white transition hover:bg-black/45 disabled:cursor-default disabled:opacity-50"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
