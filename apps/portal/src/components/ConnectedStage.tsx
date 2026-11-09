"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { PROMOTION_PACKAGES, type EffectivePortalConfig, type PortalBusiness } from "@advo/contracts";
import { JobsModal } from "@/components/JobsModal";
import { ExploreListingsModal } from "@/components/ExploreListingsModal";
import { PortalModal } from "@/components/PortalModal";
import { PromotionModal } from "@/components/PromotionModal";
import { SupportModal } from "@/components/SupportModal";
import { usePortalPreviewAppearance } from "@/lib/portal-preview";
import { remainingText, useLocale } from "@/lib/portal";
import { useExploreFeed } from "@/lib/use-explore";
import type {
  PortalListing,
  PortalSession,
  PortalTheme,
  PromotionPackage,
} from "@/lib/portal-types";

/**
 * Where "Visit Advotz" goes. The platform site, not the portal — a guest who
 * taps it wants to know who runs this WiFi and what else Advo does.
 */
const PLATFORM_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? "https://advowifi.com").replace(/\/$/, "");

/**
 * Stage 3 — the connected experience.
 *
 * A guest reaches this screen with a live session and, on a phone, very little
 * time: the operating system tears the captive window down as soon as its
 * connectivity probe succeeds. So the screen is ordered by what a guest can act
 * on in one tap — the package and its remaining time, the internet button, then
 * the Explore menus — and every menu loads its own list when opened instead of
 * trusting a page that may have been sitting open for an hour.
 */
export function ConnectedStage({
  slug,
  siteTitle,
  business,
  theme,
  sessionLabel,
  session,
  connection,
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
  /** Live session facts; absent on the designer's preview. */
  session?: PortalSession | null;
  /**
   * The paid session is held so this page can be read before the device goes
   * online. Absent when there is nothing to hold (preview, or already online).
   */
  connection?: {
    state: "held" | "connecting" | "live";
    /** Seconds until the session opens itself; null once it is opening. */
    secondsLeft: number | null;
    onStart: () => void;
    error?: string | null;
  } | null;
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

  // Visibility: the designer's live draft wins, then the plan, and once the
  // feed has loaded its own answer wins over both — the server applied the same
  // policy when it built the payload, so a hidden surface comes back empty.
  const exploreVisible = previewAppearance?.visibility?.explore ?? (config?.visibility?.["ads.explore"]?.visible ?? true);
  const jobsVisible = previewAppearance?.visibility?.jobs ?? (config?.visibility?.["discovery.jobs"]?.visible ?? true);
  const promoVisible =
    previewAppearance?.visibility?.promote_business ??
    (config?.visibility?.["discovery.promote_business"]?.visible ?? true);

  // The design board renders this stage with sample content and no session; a
  // real connected page always fetches. Preview still fetches so the menus are
  // checked against real data, but never blocks on it.
  const { feed, loading, refreshing, refresh } = useExploreFeed(slug, !experienceOnly);
  const effectiveListings = useMemo(() => {
    if (feed) return [...feed.jobs, ...feed.opportunities, ...feed.events, ...feed.holidays];
    return listings.length > 0 ? listings : isPreview ? PREVIEW_FALLBACK_LISTINGS : [];
  }, [feed, listings, isPreview]);

  const effectiveBusinesses = feed ? feed.businesses : businesses;
  const effectivePromotionPackages = feed
    ? feed.promotionPackages
    : promotionPackages.length > 0
      ? promotionPackages
      : isPreview
        ? (PROMOTION_PACKAGES as unknown as PromotionPackage[])
        : [];

  const jobs = effectiveListings.filter((l) => l.kind === "JOB" || l.kind === "OPPORTUNITY");
  const events = effectiveListings.filter((l) => l.kind === "LOCAL_EVENT" || l.kind === "HOLIDAY");

  const [jobsOpen, setJobsOpen] = useState(false);
  const [exploreListing, setExploreListing] = useState<"LOCAL_EVENT" | "HOLIDAY" | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [explored, setExplored] = useState<PortalBusiness | null>(null);
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"all" | "food" | "shops" | "tech">("all");
  const [now, setNow] = useState(() => Date.now());

  // A minute is enough for a countdown in minutes, and cheap enough for a phone
  // that is holding this page open in the background.
  useEffect(() => {
    if (!session?.expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [session?.expiresAt]);

  /** Every menu refreshes before it renders, so the list is current. */
  const openWith = useCallback(
    (open: () => void) => {
      void refresh();
      open();
    },
    [refresh],
  );

  const filteredBusinesses = useMemo(() => {
    if (selectedCategory === "all") return effectiveBusinesses;
    const match = (category: string) => {
      const value = category.toLowerCase();
      if (selectedCategory === "food") return value.includes("food") || value.includes("chakula") || value.includes("cafe") || value.includes("kahawa");
      if (selectedCategory === "shops") return value.includes("shop") || value.includes("duka") || value.includes("store") || value.includes("huduma");
      return value.includes("tech") || value.includes("simu") || value.includes("phone") || value.includes("pesa");
    };
    return effectiveBusinesses.filter((b) => match(b.category || ""));
  }, [effectiveBusinesses, selectedCategory]);

  const targetBrowseUrl = landingUrl || "https://www.google.com";
  const liveSession = session && session.expiresAt ? session : null;

  /**
   * How much of the bought window is left, for the bar under the countdown.
   * Null when the caller did not pass a duration — the preview and any older
   * caller then simply omit the bar instead of drawing a fake one.
   */
  const sessionLeftPercent = useMemo(() => {
    const total = (liveSession?.durationSeconds ?? 0) * 1000;
    if (!liveSession?.expiresAt || total <= 0) return null;
    const left = new Date(liveSession.expiresAt).getTime() - now;
    return Math.max(0, Math.min(100, (left / total) * 100));
  }, [liveSession?.durationSeconds, liveSession?.expiresAt, now]);

  return (
    <section
      aria-label={t("portal.connectedTitle")}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-advo-charcoal text-white shadow-2xl"
    >
      {/* Ambient light: two soft discs, never intercepting a tap. */}
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-advo-gold/10 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full border-[28px] border-white/[0.04]" />

      <div className="relative px-4 pb-5 pt-5 sm:px-5">
        {showHeader ? (
          <div className="mb-4 text-center">
            <div className="relative mx-auto mb-2.5 grid h-14 w-14 place-items-center rounded-2xl border border-advo-gold/40 bg-advo-gold/15 text-advo-gold">
              <span className="text-2xl font-black">✓</span>
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-advo-gold opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-advo-gold" />
              </span>
            </div>
            <h2 className="text-2xl font-black leading-tight tracking-tight">{t("portal.connectedTitle")}</h2>
            <p className="mt-1 text-xs font-medium text-advo-gold">
              ● {connection && connection.state !== "live" ? t("portal.holdStatus") : t("portal.wifiActiveStatus")}
            </p>
          </div>
        ) : null}

        {/* The package and the clock, first: a guest checking "did my money
            work, and how long do I have?" reads this before anything else. */}
        {liveSession ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07]">
            <div className="flex items-center justify-between gap-2 bg-white/[0.06] px-3.5 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                {t("portal.activePackage")}
              </span>
              <strong className="min-w-0 truncate text-sm font-black leading-tight">
                {liveSession.packageName ?? sessionLabel ?? t("portal.connectedLead")}
              </strong>
            </div>
            <div className="px-3.5 pb-3.5 pt-3">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                    {t("portal.sessionTimeLeft")}
                  </p>
                  <p className="font-mono text-[28px] font-black leading-none text-advo-gold">
                    {remainingText(liveSession.expiresAt, now)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                    {t("portal.sessionDevices")}
                  </p>
                  <p className="text-sm font-black leading-tight">
                    {liveSession.devices} / {liveSession.maxDevices}
                  </p>
                </div>
              </div>

              {sessionLeftPercent !== null ? (
                <div
                  aria-hidden
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ background: "var(--advo-gradient-gold)", width: `${sessionLeftPercent}%` }}
                  />
                </div>
              ) : null}

              <p className="mt-2 text-[10px] font-semibold text-white/40">
                {t("portal.sessionEndsAt")} ·{" "}
                {new Date(liveSession.expiresAt as string).toLocaleString(locale === "sw" ? "sw-TZ" : "en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ) : sessionLabel ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5 text-xs">
            <span className="font-medium text-white/60">{t("portal.activePackage")}:</span>
            <strong className="truncate font-bold">{sessionLabel}</strong>
          </div>
        ) : null}

        {!experienceOnly ? (
          connection && connection.state !== "live" ? (
            <ConnectHold connection={connection} />
          ) : (
            <a
              href={targetBrowseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-black tracking-tight text-white shadow-[0_14px_28px_-12px_rgba(198,73,32,0.9)] transition hover:brightness-105 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #f97316 0%, #dc4e08 100%)" }}
            >
              {t("portal.browseInternet")} ›
            </a>
          )
        ) : null}

        {/* Explore menus. Each tile carries what is behind it, and refreshes the
            list as it opens so a menu is never a stale page. */}
        <div className="mt-5">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-black tracking-tight">{t("portal.exploreTitle")}</h3>
            <span className="text-[10px] font-semibold text-white/40">
              {refreshing || loading ? t("portal.sessionUpdating") : t("portal.exploreLiveHint")}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {exploreVisible ? (
              <ExploreTile
                badge={countLabel(effectiveBusinesses.length, t("portal.tilePlaces"), t("portal.tilePlacesPlural"))}
                icon="📍"
                label={t("portal.exploreBusinesses")}
                onPress={() => openWith(() => { setSelectedCategory("all"); setSeeAllOpen(true); })}
              />
            ) : null}
            {jobsVisible ? (
              <ExploreTile
                badge={countLabel(jobs.length, t("portal.tileListings"), t("portal.tileListingsPlural"))}
                icon="💼"
                label={t("portal.jobsOpportunities")}
                onPress={() => openWith(() => setJobsOpen(true))}
              />
            ) : null}
            {exploreVisible ? (
              <ExploreTile
                badge={countLabel(
                  effectiveListings.filter((l) => l.kind === "LOCAL_EVENT").length,
                  t("portal.tileListings"),
                  t("portal.tileListingsPlural"),
                )}
                icon="🎟️"
                label={t("portal.localEvents")}
                onPress={() => openWith(() => setExploreListing("LOCAL_EVENT"))}
              />
            ) : null}
            {exploreVisible ? (
              <ExploreTile
                badge={countLabel(
                  effectiveListings.filter((l) => l.kind === "HOLIDAY").length,
                  t("portal.tileListings"),
                  t("portal.tileListingsPlural"),
                )}
                icon="🌴"
                label={t("portal.holidays")}
                onPress={() => openWith(() => setExploreListing("HOLIDAY"))}
              />
            ) : null}
            {promoVisible ? (
              <ExploreTile
                badge={t("portal.tileAdvertise")}
                icon="📣"
                label={t("portal.promoteBusiness")}
                onPress={() => openWith(() => setPromoOpen(true))}
              />
            ) : null}
            <ExploreTile
              badge={t("portal.tilePlatform")}
              external
              icon="🌐"
              label={t("portal.visitAdvotz")}
              href={PLATFORM_URL}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="text-[11px] font-medium text-white/55">{t("portal.helpHint")}</span>
          <button
            className="rounded-full bg-advo-blue px-3.5 py-1.5 text-[11px] font-black text-white transition hover:brightness-110 active:scale-95"
            onClick={() => setSupportOpen(true)}
            type="button"
          >
            {t("portal.help")}
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] text-white/40">
          {t("portal.poweredBy", { brand: siteTitle })}
        </p>
      </div>

      {/* Modals */}
      <JobsModal
        listings={jobs}
        onClose={() => setJobsOpen(false)}
        open={jobsOpen}
        refreshing={refreshing}
        theme={theme}
      />
      <ExploreListingsModal
        kind={exploreListing ?? "LOCAL_EVENT"}
        listings={events}
        onClose={() => setExploreListing(null)}
        open={exploreListing !== null}
        refreshing={refreshing}
        theme={theme}
      />
      <PromotionModal
        onClose={() => setPromoOpen(false)}
        open={promoOpen}
        packages={effectivePromotionPackages}
        refreshing={refreshing}
        slug={slug}
        theme={theme}
      />
      <SupportModal onClose={() => setSupportOpen(false)} open={supportOpen} theme={theme} />

      {/* Local business directory. Businesses carry a name, a category and a
          glyph — no phone or menu — so this is a directory, not a storefront,
          and it says so instead of promising an offer it cannot show. */}
      <PortalModal
        onClose={() => setSeeAllOpen(false)}
        open={seeAllOpen}
        size="wide"
        theme={theme}
        title={t("portal.exploreLocal")}
      >
        <p className="mb-3 text-center text-xs text-[var(--advo-muted)]">{t("portal.exploreLocalSubtitle")}</p>
        <CategoryTabs selected={selectedCategory} onSelect={setSelectedCategory} />
        {filteredBusinesses.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--advo-muted)]">{t("portal.businessesEmpty")}</p>
        ) : (
          <ul className="max-h-[52vh] space-y-2 overflow-y-auto pe-1">
            {filteredBusinesses.map((item) => (
              <li key={item.id}>
                <button
                  className="flex w-full items-center gap-3 rounded-xl border border-black/10 p-2.5 text-start transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                  onClick={() => {
                    setSeeAllOpen(false);
                    setExplored(item);
                  }}
                  type="button"
                >
                  <span
                    aria-hidden
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl text-white shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${item.color}, color-mix(in srgb, ${item.color} 45%, #000))` }}
                  >
                    {item.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.name}</span>
                    <span className="block truncate text-xs text-[var(--advo-muted)]">{item.category}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-[var(--advo-muted)]">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PortalModal>

      <PortalModal
        onClose={() => setExplored(null)}
        open={Boolean(explored)}
        theme={theme}
        title={explored?.name ?? business}
      >
        <div className="space-y-3 text-center">
          <div
            aria-hidden
            className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl text-white shadow-md"
            style={{
              background: explored
                ? `linear-gradient(135deg, ${explored.color}, color-mix(in srgb, ${explored.color} 45%, #000))`
                : "var(--advo-blue)",
            }}
          >
            {explored?.glyph ?? "◆"}
          </div>
          {explored?.category ? (
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--advo-muted)]">{explored.category}</p>
          ) : null}
          <p className="text-xs leading-relaxed text-[var(--advo-muted)]">
            {t("portal.businessNearby", { business: explored?.name ?? business })}
          </p>
          <div className="pt-1">
            <Button fullWidth onPress={() => setExplored(null)} size="sm" type="button" variant="outline">
              {t("portal.close")}
            </Button>
          </div>
        </div>
      </PortalModal>
    </section>
  );
}

/** "No listings yet" reads better than "0 listings", and "1 listing" beats "1 listings". */
function countLabel(count: number, one: string, many: string): string {
  return count > 0 ? `${count} ${count === 1 ? one : many}` : "—";
}

/**
 * The paid-but-not-yet-online state.
 *
 * The device is only authorized on the Controller when the guest asks for it
 * (or when the hold runs out), so this page is the last thing on screen before
 * the phone's captive window gives up — which is the point: it stays readable
 * long enough to use the menus below.
 */
function ConnectHold({
  connection,
}: {
  connection: {
    state: "held" | "connecting" | "live";
    secondsLeft: number | null;
    onStart: () => void;
    error?: string | null;
  };
}) {
  const { t } = useLocale();
  const busy = connection.state === "connecting";
  const countdown =
    connection.secondsLeft !== null && connection.secondsLeft > 0
      ? t("portal.holdAuto", { seconds: connection.secondsLeft })
      : t("portal.holdOpening");

  return (
    <div className="mt-3 rounded-2xl border border-advo-gold/30 bg-advo-gold/[0.08] p-3.5">
      <p className="text-sm font-black leading-tight text-advo-gold">{t("portal.holdTitle")}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-white/60">
        {t("portal.holdBody", { seconds: connection.secondsLeft ?? 0 })}
      </p>
      <button
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold text-advo-charcoal transition hover:brightness-105 active:scale-[0.98] disabled:opacity-70"
        disabled={busy}
        onClick={connection.onStart}
        style={{ background: "var(--advo-gradient-gold)" }}
        type="button"
      >
        {busy ? t("portal.connecting") : t("portal.startBrowsing")} ›
      </button>
      <p className="mt-2 text-center text-[10px] font-semibold text-white/45">{countdown}</p>
      {connection.error ? (
        <p className="mt-2 rounded-lg bg-red-500/15 px-2 py-1.5 text-center text-[10px] font-medium text-red-200">
          {connection.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One Explore menu: a full-width orange row, one thumb-tap tall.
 */
function ExploreTile({
  icon,
  label,
  badge,
  onPress,
  href,
  external,
}: {
  icon: string;
  label: string;
  badge: string;
  onPress?: () => void;
  href?: string;
  external?: boolean;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20 text-lg shadow-inner"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-tight tracking-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">
          {label}
        </span>
        {badge ? (
          <span className="mt-0.5 block truncate text-[11px] font-semibold text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">
            {badge}
          </span>
        ) : null}
      </span>
      <span aria-hidden className="shrink-0 text-xl font-black leading-none text-white/85">
        {external ? "↗" : "›"}
      </span>
    </>
  );
  // Orange is the portal's default action colour, matching the primary
  // "browse" button so every tappable row reads as one family.
  const className =
    "flex min-h-[68px] w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-start shadow-[0_10px_22px_-12px_rgba(198,73,32,0.85)] transition hover:brightness-105 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  const style = { background: "linear-gradient(135deg, #f97316 0%, #dc4e08 100%)" } as const;

  if (href) {
    return (
      <a className={className} href={href} rel="noopener noreferrer" style={style} target="_blank">
        {body}
      </a>
    );
  }
  return (
    <button className={className} onClick={onPress} style={style} type="button">
      {body}
    </button>
  );
}

/** Category filter for the local-business directory. */
function CategoryTabs({
  selected,
  onSelect,
}: {
  selected: "all" | "food" | "shops" | "tech";
  onSelect: (next: "all" | "food" | "shops" | "tech") => void;
}) {
  const { t } = useLocale();
  const tabs = [
    { id: "all" as const, label: t("portal.allCategories") },
    { id: "food" as const, label: t("portal.foodDrinks") },
    { id: "shops" as const, label: t("portal.shopsServices") },
    { id: "tech" as const, label: t("portal.techGadgets") },
  ];
  return (
    <div className="mb-3 flex flex-wrap gap-1.5" role="group">
      {tabs.map((tab) => {
        const active = tab.id === selected;
        return (
          <button
            aria-pressed={active}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
              active ? "text-white" : "bg-black/5 text-[var(--advo-muted)]"
            }`}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={active ? { background: "var(--advo-blue)" } : undefined}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

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
  {
    id: "preview-event-1",
    kind: "LOCAL_EVENT",
    title: "Sauti za Busara — Weekend Showcase",
    organization: "Busara Promotions",
    location: "Old Fort, Zanzibar",
    venue: "Old Fort",
    region: "Zanzibar",
    employmentType: "",
    summary: "Live music from East African artists, food stalls and a night market.",
    description: "",
    priceLabel: "TZS 20,000",
    startsAt: "2026-11-14T19:00:00.000Z",
  },
  {
    id: "preview-holiday-1",
    kind: "HOLIDAY",
    title: "Zanzibar Beach Getaway",
    organization: "Coastline Tours",
    location: "Nungwi, Zanzibar",
    region: "Zanzibar",
    employmentType: "",
    summary: "Two nights by the beach with breakfast and a sunset dhow cruise.",
    description: "",
    priceLabel: "From TZS 250,000",
    startsAt: "2026-12-05T00:00:00.000Z",
  },
];
