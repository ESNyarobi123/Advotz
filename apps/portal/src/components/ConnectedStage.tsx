"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { PROMOTION_PACKAGES, type EffectivePortalConfig } from "@advo/contracts";
import { JobsModal } from "@/components/JobsModal";
import { PortalModal } from "@/components/PortalModal";
import { PromotionModal } from "@/components/PromotionModal";
import { SupportModal } from "@/components/SupportModal";
import { usePortalPreviewAppearance } from "@/lib/portal-preview";
import type {
  PortalBusiness,
  PortalListing,
  PortalTheme,
  PromotionPackage,
} from "@/lib/portal-types";
import { useLocale } from "@/lib/portal";

const PREVIEW_FALLBACK_LISTINGS: PortalListing[] = [
  {
    id: "preview-job-1",
    kind: "JOB",
    title: "Mhudumu wa Wateja & Mauzo",
    organization: "Kimara WiFi Hub",
    location: "Kimara, Dar es Salaam",
    employmentType: "Muda Kamili (Full-time)",
    summary: "Nafasi ya kutoa huduma kwa wateja, mauzo ya vifurushi na usajili wa huduma.",
    description: "Tunatafuta mhudumu mwenye weledi wa mawasiliano na uzoefu wa huduma kwa wateja.",
  },
  {
    id: "preview-job-2",
    kind: "OPPORTUNITY",
    title: "Mafunzo ya Ujuzi wa Kidijitali kwa Vijana",
    organization: "Vijana Tech Lab",
    location: "Mtandaoni & Dar",
    employmentType: "Mafunzo ya Vitendo (Internship)",
    summary: "Jifunze kuanzisha biashara mtandaoni, networking na digital marketing bure.",
    description: "Fursa ya wiki 4 kwa vijana wenye nia ya kujifunza ujuzi mpya wa kiteknolojia.",
  },
];

type CuratedLocalItem = {
  id: string;
  name: string;
  category: string;
  catKey: "all" | "food" | "shops" | "tech";
  glyph: string;
  color: string;
  description: string;
  status: string;
  link?: string;
  phone?: string;
};



/**
 * Curated local essentials shown whenever custom businesses are not yet populated.
 */
function getCuratedLocalSpots(locale: string): CuratedLocalItem[] {
  const isSw = locale === "sw";
  return [
    {
      id: "curated-mpesa",
      name: isSw ? "Wakala wa M-Pesa & Kibenki" : "M-Pesa & Banking Agent",
      category: isSw ? "Teknolojia & Simu" : "Tech & Finance",
      catKey: "tech",
      glyph: "💳",
      color: "#059669",
      description: isSw
        ? "Wakala wa M-Pesa, Tigo Pesa, Airtel Money na huduma za kutoa na kuweka pesa."
        : "Cash deposit, withdrawal, M-Pesa, Tigo Pesa and Airtel Money services.",
      status: isSw ? "Funguliwa Sasa" : "Open Now",
      phone: "+255700000000",
    },
    {
      id: "curated-cafe",
      name: isSw ? "Kahawa & Vyakula vya Karibu" : "Local Cafe & Fresh Bites",
      category: isSw ? "Vyakula & Mikahawa" : "Food & Dining",
      catKey: "food",
      glyph: "☕",
      color: "#d97706",
      description: isSw
        ? "Kahawa moto, chai, vitafunio vitamu, juisi asilia na vyakula vya mchana."
        : "Freshly brewed coffee, tea, pastries, chilled juices and wholesome meals.",
      status: isSw ? "Funguliwa Sasa" : "Open Now",
    },
    {
      id: "curated-phones",
      name: isSw ? "Duka la Vifaa vya Simu" : "Mobile Tech & Accessories",
      category: isSw ? "Teknolojia & Simu" : "Tech & Phones",
      catKey: "tech",
      glyph: "📱",
      color: "#2563eb",
      description: isSw
        ? "Chaja za haraka za simu, vioo vya kinga (screen protectors), earphone na kava."
        : "Fast chargers, cables, screen protectors, earphones, power banks and cases.",
      status: isSw ? "Funguliwa Sasa" : "Open Now",
    },
    {
      id: "curated-pharmacy",
      name: isSw ? "Duka la Dawa & Afya" : "Pharmacy & Wellness",
      category: isSw ? "Maduka & Huduma" : "Shops & Services",
      catKey: "shops",
      glyph: "💊",
      color: "#e11d48",
      description: isSw
        ? "Dawa muhimu, huduma ya kwanza, vitamini na ushauri wa afya kwa wateja."
        : "Prescription refills, first aid supplies, wellness vitamins and consultation.",
      status: isSw ? "Funguliwa Sasa" : "Open Now",
    },
  ];
}

/**
 * Stage 3 — The Connected Experience.
 *
 * Provides a rich, engaging post-login portal with:
 * 1. Live status indicator & Primary "Start Browsing" CTA.
 * 2. "Gundua Huduma & Eneo Lako / Explore Local Services" (governed by ads.explore).
 * 3. Opportunities (discovery.jobs) and business promotion (discovery.promote_business).
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
  config,
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
  experienceOnly?: boolean;
  config?: EffectivePortalConfig | null;
}) {
  const { locale, t } = useLocale();
  const previewAppearance = usePortalPreviewAppearance();
  const isPreview = previewAppearance !== null;

  // Visibility flags: priority to designer's live preview draft, falling back to plan config.
  const exploreVisible = previewAppearance?.visibility?.explore !== undefined
    ? previewAppearance.visibility.explore
    : (config?.visibility?.["ads.explore"]?.visible ?? true);

  const jobsVisible = previewAppearance?.visibility?.jobs !== undefined
    ? previewAppearance.visibility.jobs
    : (config?.visibility?.["discovery.jobs"]?.visible ?? true);

  const promoVisible = previewAppearance?.visibility?.promote_business !== undefined
    ? previewAppearance.visibility.promote_business
    : (config?.visibility?.["discovery.promote_business"]?.visible ?? true);

  const effectiveListings = listings.length > 0
    ? listings
    : isPreview
      ? PREVIEW_FALLBACK_LISTINGS
      : [];

  const effectivePromotionPackages = promotionPackages.length > 0
    ? promotionPackages
    : isPreview
      ? (PROMOTION_PACKAGES as unknown as PromotionPackage[])
      : [];

  const [jobsOpen, setJobsOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [explored, setExplored] = useState<PortalBusiness | CuratedLocalItem | null>(null);
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"all" | "food" | "shops" | "tech">("all");

  const curatedSpots = useMemo(() => getCuratedLocalSpots(locale), [locale]);

  // Combine custom businesses and curated spots
  const displayedBusinesses = useMemo(() => {
    if (businesses.length > 0) {
      if (selectedCategory === "all") return businesses;
      return businesses.filter((b) => {
        const cat = (b.category || "").toLowerCase();
        if (selectedCategory === "food") return cat.includes("food") || cat.includes("chakula") || cat.includes("cafe") || cat.includes("kahawa");
        if (selectedCategory === "shops") return cat.includes("shop") || cat.includes("duka") || cat.includes("store") || cat.includes("huduma");
        if (selectedCategory === "tech") return cat.includes("tech") || cat.includes("simu") || cat.includes("phone") || cat.includes("pesa");
        return true;
      });
    }

    if (selectedCategory === "all") return curatedSpots;
    return curatedSpots.filter((c) => c.catKey === selectedCategory);
  }, [businesses, curatedSpots, selectedCategory]);

  const targetBrowseUrl = landingUrl || "https://www.google.com";

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-advo-charcoal p-4 text-white shadow-2xl sm:p-5"
      aria-label={t("portal.connectedTitle")}
    >
      {/* Decorative ambient background orb */}
      <span
        className="pointer-events-none absolute -bottom-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full border-[32px] border-white/5 opacity-60"
        aria-hidden
      />

      {/* Header & Status Confirmation */}
      {showHeader ? (
        <div className="relative mb-3 text-center">
          <div className="relative mx-auto mb-2.5 grid h-14 w-14 place-items-center rounded-2xl border border-advo-gold/40 bg-advo-gold/15 text-advo-gold">
            <span className="text-2xl font-black">✓</span>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-advo-gold opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-advo-gold"></span>
            </span>
          </div>
          <h2 className="text-2xl font-black leading-tight tracking-tight text-white">
            {t("portal.connectedTitle")}
          </h2>
          <p className="mt-1 text-xs font-medium text-advo-gold">
            ● {t("portal.wifiActiveStatus")}
          </p>
        </div>
      ) : null}

      {/* Active Package Banner & Instant Start Browsing CTA */}
      {!experienceOnly ? (
        <div className="relative mb-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs">
            <span className="text-white/70 font-medium">{t("portal.activePackage")}:</span>
            <strong className="truncate text-white font-bold">
              {sessionLabel ?? t("portal.connectedLead")}
            </strong>
          </div>

          <a
            href={targetBrowseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-full py-3.5 text-sm font-bold text-advo-charcoal transition hover:brightness-105 active:scale-[0.98]"
            style={{ background: "var(--advo-gradient-gold)" }}
          >
            {t("portal.browseInternet")} ›
          </a>
        </div>
      ) : null}

      {/* Explore menu. Businesses, jobs, promotion and help already open their
          own screens. Advotz, events and holidays stay as rows until their flow
          is specified. */}
      <div className="relative mt-5">
        <h3 className="mb-3 text-xl font-black tracking-tight text-white">{t("portal.exploreTitle")}</h3>
        <div className="flex flex-col gap-2.5 pb-3 [&_button:last-of-type]:pe-16">
          {exploreVisible ? (
            <ExploreRow icon="📍" label={t("portal.exploreBusinesses")} onClick={() => { setSelectedCategory("all"); setSeeAllOpen(true); }} />
          ) : null}
          <ExploreRow icon="🌐" label={t("portal.visitAdvotz")} onClick={() => undefined} />
          <ExploreRow icon="🎟️" label={t("portal.localEvents")} onClick={() => undefined} />
          <ExploreRow icon="🌴" label={t("portal.holidays")} onClick={() => undefined} />
          {jobsVisible ? (
            <ExploreRow icon="💼" label={t("portal.jobsOpportunities")} onClick={() => setJobsOpen(true)} />
          ) : null}
          {promoVisible ? (
            <ExploreRow icon="📣" label={t("portal.promoteBusiness")} onClick={() => setPromoOpen(true)} />
          ) : null}
        </div>
        <button
          className="absolute -bottom-1 -right-1 z-10 grid size-16 place-items-center rounded-full bg-advo-blue text-sm font-black text-white shadow-[0_8px_18px_color-mix(in_srgb,var(--advo-blue)_45%,transparent)] transition hover:brightness-110 active:scale-95"
          onClick={() => setSupportOpen(true)}
          type="button"
        >
          {t("portal.help")}
        </button>
      </div>

      {/* Modals */}
      <JobsModal
        listings={effectiveListings}
        onClose={() => setJobsOpen(false)}
        open={jobsOpen}
        theme={theme}
      />
      <PromotionModal
        onClose={() => setPromoOpen(false)}
        open={promoOpen}
        packages={effectivePromotionPackages}
        slug={slug}
        theme={theme}
      />
      <SupportModal
        onClose={() => setSupportOpen(false)}
        open={supportOpen}
        theme={theme}
      />

      {/* Individual Business Exploration Modal */}
      <PortalModal
        onClose={() => setExplored(null)}
        open={Boolean(explored)}
        theme={theme}
        title={explored?.name ?? business}
      >
        <div className="space-y-3 text-center">
          <div
            className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl text-white shadow-md"
            style={{
              background: explored
                ? `linear-gradient(135deg, ${explored.color}, color-mix(in srgb, ${explored.color} 45%, #000))`
                : "var(--advo-blue)",
            }}
            aria-hidden
          >
            {explored?.glyph ?? "◆"}
          </div>
          {explored?.category ? (
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--advo-muted)]">
              {explored.category}
            </p>
          ) : null}

          {"description" in (explored || {}) && (explored as CuratedLocalItem)?.description ? (
            <p className="text-xs text-[var(--advo-muted)] leading-relaxed">
              {(explored as CuratedLocalItem).description}
            </p>
          ) : (
            <p className="text-sm text-[var(--advo-muted)]">
              {t("portal.exploreSoon", { business: explored?.name ?? business })}
            </p>
          )}

          <div className="pt-2">
            <Button
              fullWidth
              size="sm"
              onPress={() => setExplored(null)}
              variant="outline"
            >
              {t("portal.startOver")}
            </Button>
          </div>
        </div>
      </PortalModal>

      {/* See All Local Businesses Modal */}
      <PortalModal
        onClose={() => setSeeAllOpen(false)}
        open={seeAllOpen}
        theme={theme}
        title={t("portal.exploreLocal")}
        size="wide"
      >
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {displayedBusinesses.map((item) => (
            <li
              className="flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 p-2.5 transition hover:bg-black/5 dark:hover:bg-white/5"
              key={item.id}
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl text-white shadow-sm"
                style={{
                  background: `linear-gradient(135deg, ${item.color}, color-mix(in srgb, ${item.color} 45%, #000))`,
                }}
                aria-hidden
              >
                {item.glyph}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {item.name}
                </span>
                <span className="block truncate text-xs text-[var(--advo-muted)]">
                  {item.category}
                </span>
              </span>
              <button
                className="ms-auto shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:bg-[var(--advo-blue)] hover:text-white"
                onClick={() => {
                  setSeeAllOpen(false);
                  setExplored(item);
                }}
                style={{
                  borderColor: "var(--advo-blue)",
                  color: "var(--advo-blue)",
                }}
                type="button"
              >
                {t("portal.businessExplore")}
              </button>
            </li>
          ))}
        </ul>
      </PortalModal>

      {/* Footer Powered By */}
      <p className="relative mt-4 text-center text-[10px] text-white/50">
        {t("portal.poweredBy", { brand: siteTitle })}
      </p>
    </section>
  );
}

/** One full-width Explore row: the system gold gradient on the charcoal panel. */
function ExploreRow({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-[15px] font-bold text-advo-charcoal transition hover:brightness-105 active:scale-[0.99]"
      onClick={onClick}
      style={{ background: "var(--advo-gradient-gold)" }}
      type="button"
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span aria-hidden="true">›</span>
    </button>
  );
}
