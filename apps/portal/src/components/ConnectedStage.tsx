"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { JobsModal } from "@/components/JobsModal";
import { PortalModal } from "@/components/PortalModal";
import { PromotionModal } from "@/components/PromotionModal";
import { SupportModal } from "@/components/SupportModal";
import { primaryButton } from "@/lib/theme";
import type { PortalBusiness, PortalListing, PortalTheme, PromotionPackage } from "@/lib/portal-types";
import { useLocale } from "@/lib/portal";

/**
 * Stage 3 — the connected experience: active session, a browse action, the
 * featured local businesses ("Explore…"), plus Jobs & Opportunities, Promote
 * your business and customer help.
 *
 * It is used standalone by the portal and embedded under the status card on the
 * payment/status pages, so a returning guest still lands on the full journey.
 */
export function ConnectedStage({
  slug,
  siteTitle,
  business,
  theme,
  sessionLabel,
  landingUrl,
  businesses,
  listings,
  promotionPackages,
  showHeader = true,
  experienceOnly = false,
}: {
  slug: string;
  siteTitle: string;
  business: string;
  theme?: PortalTheme;
  sessionLabel?: string | null;
  landingUrl?: string | null;
  businesses: PortalBusiness[];
  listings: PortalListing[];
  promotionPackages: PromotionPackage[];
  showHeader?: boolean;
  /** When embedded under a status card, hide the check/session/browse block. */
  experienceOnly?: boolean;
}) {
  const { t } = useLocale();
  const buy = primaryButton(theme);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [explored, setExplored] = useState<PortalBusiness | null>(null);
  const [seeAllOpen, setSeeAllOpen] = useState(false);

  return (
    <section
      className="relative overflow-hidden rounded-3xl p-4 text-white"
      aria-label={t("portal.connectedTitle")}
      style={{
        backgroundImage:
          "linear-gradient(160deg, color-mix(in srgb, var(--advo-blue) 88%, #04122c) 0%, color-mix(in srgb, var(--advo-blue) 42%, #04122c) 100%)",
      }}
    >
      <span className="pointer-events-none absolute -bottom-24 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full border-[28px] border-white/10" aria-hidden />

      {showHeader && !experienceOnly ? (
        <div className="relative">
          <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full border-4 border-white/15 bg-green-500 text-2xl font-black shadow-lg">
            ✓
          </div>
          <p className="text-center text-[11px] font-black uppercase tracking-[0.13em] text-amber-300">
            {t("portal.stageLabel", { stage: 3, total: 3 })}
          </p>
          <h2 className="mt-1 text-center text-[1.6rem] font-black leading-tight tracking-tight">{t("portal.connectedTitle")}</h2>
          <p className="mb-3 mt-1 text-center text-sm text-white/75">{t("portal.connectedLead")}</p>
        </div>
      ) : null}

      {!experienceOnly ? (
        <div className="relative mb-3 flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[11px]">
          <span className="text-white/70">{t("portal.activePackage")}</span>
          <strong className="truncate text-white">{sessionLabel ?? t("portal.connectedLead")}</strong>
        </div>
      ) : null}

      {!experienceOnly ? (
        landingUrl ? (
          <a href={landingUrl}>
            <Button fullWidth size="lg" style={{ ...buy.style, borderRadius: theme?.radius }} type="button" variant={buy.variant}>
              ◎ {t("portal.browseInternet")} ›
            </Button>
          </a>
        ) : (
          <Button fullWidth onPress={() => setExplored(null)} size="lg" style={{ ...buy.style, borderRadius: theme?.radius }} type="button" variant={buy.variant}>
            ◎ {t("portal.browseInternet")} ›
          </Button>
        )
      ) : null}

      <div className="relative mt-4 flex items-baseline justify-between">
        <h3 className="text-base font-black">{t("portal.exploreTitle")}</h3>
        {businesses.length > 3 ? (
          <button className="text-[11px] font-black text-amber-300" onClick={() => setSeeAllOpen(true)} type="button">
            {t("portal.exploreSeeAll")}
          </button>
        ) : null}
      </div>

      {businesses.length === 0 ? (
        <p className="mt-2 text-xs text-white/70">{t("portal.exploreEmpty")}</p>
      ) : (
        <div className="mt-2 flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
          {businesses.map((item) => (
            <article
              className="w-[46%] shrink-0 snap-start overflow-hidden rounded-xl border border-white/15 bg-white/10 backdrop-blur"
              key={item.id}
            >
              <div
                className="grid h-[67px] place-items-center text-3xl"
                style={{ background: `linear-gradient(135deg, ${item.color}, color-mix(in srgb, ${item.color} 45%, #000))` }}
                aria-hidden
              >
                {item.glyph}
              </div>
              <p className="mt-1.5 truncate px-2 text-[11px] font-bold">{item.name}</p>
              <p className="truncate px-2 text-[10px] text-white/70">{item.category}</p>
              <button
                className="m-2 w-[calc(100%-16px)] rounded-lg border border-white/25 py-1 text-[10px] font-black text-white transition hover:bg-white/10"
                onClick={() => setExplored(item)}
                type="button"
              >
                {t("portal.businessExplore")}
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="relative mt-2 grid grid-cols-2 gap-2">
        <button
          className="rounded-xl border border-white/25 bg-white/5 px-2 py-2.5 text-[11px] font-black text-white/90 transition hover:bg-white/10"
          onClick={() => setJobsOpen(true)}
          type="button"
        >
          ▤ {t("portal.jobsOpportunities")}
        </button>
        <button
          className="rounded-xl border border-white/25 bg-white/5 px-2 py-2.5 text-[11px] font-black text-white/90 transition hover:bg-white/10"
          onClick={() => setPromoOpen(true)}
          type="button"
        >
          ⌁ {t("portal.promoteBusiness")}
        </button>
      </div>

      <button
        className="relative mt-3 w-full rounded-xl bg-green-600 px-3 py-2 text-xs font-black text-white transition hover:bg-green-500"
        onClick={() => setSupportOpen(true)}
        type="button"
      >
        ☏ {t("portal.helpWhatsapp")}
      </button>

      <JobsModal listings={listings} onClose={() => setJobsOpen(false)} open={jobsOpen} theme={theme} />
      <PromotionModal onClose={() => setPromoOpen(false)} open={promoOpen} packages={promotionPackages} slug={slug} theme={theme} />
      <SupportModal onClose={() => setSupportOpen(false)} open={supportOpen} theme={theme} />

      <PortalModal onClose={() => setExplored(null)} open={Boolean(explored)} theme={theme} title={explored?.name ?? business}>
        <div className="space-y-2 text-center">
          <div
            className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl text-white"
            style={{ background: explored ? `linear-gradient(135deg, ${explored.color}, color-mix(in srgb, ${explored.color} 45%, #000))` : "var(--advo-blue)" }}
            aria-hidden
          >
            {explored?.glyph ?? "◆"}
          </div>
          {explored?.category ? <p className="text-xs font-bold uppercase tracking-wide text-[var(--advo-muted)]">{explored.category}</p> : null}
          <p className="text-sm text-[var(--advo-muted)]">{t("portal.exploreSoon", { business: explored?.name ?? business })}</p>
        </div>
      </PortalModal>

      <PortalModal onClose={() => setSeeAllOpen(false)} open={seeAllOpen} theme={theme} title={t("portal.exploreTitle")} size="wide">
        <ul className="space-y-2">
          {businesses.map((item) => (
            <li className="flex items-center gap-3 rounded-xl border border-black/10 p-2" key={item.id}>
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xl text-white"
                style={{ background: `linear-gradient(135deg, ${item.color}, color-mix(in srgb, ${item.color} 45%, #000))` }}
                aria-hidden
              >
                {item.glyph}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{item.name}</span>
                <span className="block truncate text-xs text-[var(--advo-muted)]">{item.category}</span>
              </span>
              <button
                className="ms-auto shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold"
                onClick={() => {
                  setSeeAllOpen(false);
                  setExplored(item);
                }}
                style={{ borderColor: "var(--advo-blue)", color: "var(--advo-blue)" }}
                type="button"
              >
                {t("portal.businessExplore")}
              </button>
            </li>
          ))}
        </ul>
      </PortalModal>

      <p className="relative mt-4 text-center text-[10px] text-white/60">
        {t("portal.poweredBy", { brand: siteTitle })}
      </p>
    </section>
  );
}
