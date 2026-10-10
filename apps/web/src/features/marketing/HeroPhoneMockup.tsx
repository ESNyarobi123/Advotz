"use client";

import { useEffect, useState } from "react";
import { BatteryFull, CheckCircle2, Signal, Wifi } from "lucide-react";
import type { MessageKey } from "@advo/i18n";
import {
  PortalBanner,
  PortalBannerControls,
  PortalBusinessCard,
  PortalDiscoverLinks,
  PortalIcon,
  PortalJourney,
  PortalMoneyMethods,
  PortalPackageCard,
  PortalPackageGrid,
  PortalResellerHeader,
  PortalSegmented,
  PortalServiceStrip,
  PortalSessionTicket,
  PortalSuccessMark,
  type PortalPackageView,
  type PortalShortcut,
} from "@advo/ui";
import { useI18n } from "@/lib/i18n";
import { cx } from "./ui";

/**
 * The hero's device mockup: an iPhone running the guest captive portal.
 *
 * The phone is not a screenshot. It plays the approved portal design on a loop —
 * sponsored banner → choose a pass → pay with mobile money → connected session
 * with Explore beneath it — because that journey *is* the product being sold.
 *
 * How the design is kept honest:
 *
 * - The screen renders the real `@advo/ui` portal components inside an
 *   `@container`, so everything is laid out at genuine phone proportions rather
 *   than at page-viewport breakpoints. The same components run full width in the
 *   guest portal app, which is the only way the mockup cannot drift from the
 *   product it advertises.
 * - The portal chrome (status bar, reseller bar, screen contents) is
 *   `aria-hidden`. It is an illustration, and an illustration with a dozen
 *   focusable nodes is worse than useless to a screen reader. The step rail below
 *   the phone is the real control: keyboard reachable, announcing the current
 *   stage and able to jump the animation to any of the three.
 * - Nothing on the first painted screen depends on the clock, `Math.random()` or
 *   `toLocaleString()`. Prices and the expiry line are fixed demo strings, so the
 *   server HTML and the first client render agree and React does not warn about a
 *   hydration mismatch. The countdown starts from the purchased package's own
 *   duration for the same reason.
 */

type Phase = "portal" | "checkout" | "connected";
type PackageFilter = "daily" | "long";
type PayStage = "entry" | "waiting" | "connecting";

/** How long each stage holds before the loop advances, in milliseconds. */
const PHASE_DURATION: Record<Phase, number> = {
  portal: 6400,
  checkout: 5600,
  connected: 7200,
};

/** Dwell times for the three honest checkout sub-steps. */
const PAY_DURATION: Record<PayStage, number> = {
  entry: 2000,
  waiting: 2600,
  connecting: 1200,
};

const PHASES: Array<{ id: Phase; labelKey: MessageKey }> = [
  { id: "portal", labelKey: "marketing.home.hero.portal.step.pick" },
  { id: "checkout", labelKey: "marketing.home.hero.portal.step.pay" },
  { id: "connected", labelKey: "marketing.home.hero.portal.step.online" },
];

/**
 * The passes a guest sees. `price` and `speed` are fixed demo strings on purpose
 * (see the hydration note above); `seconds` drives the connected countdown and
 * `group` drives the Daily / Longer-stay filter that the design introduced.
 *
 * The allowance is a message key rather than a literal because the card prints
 * that line verbatim: a bare "Unlimited" would come out as "Data Unlimited" in
 * Swahili instead of "Data bila kikomo".
 */
const PACKAGES: Array<Omit<PortalPackageView, "data"> & { group: PackageFilter; seconds: number; dataKey: MessageKey; nameKey: MessageKey; durationKey: MessageKey }> = [
  {
    id: "1h",
    group: "daily",
    seconds: 60 * 60,
    name: "Quick Access",
    duration: "1 hour",
    price: "1,000",
    speed: "15 Mbps",
    dataKey: "unlimitedData",
    devices: 1,
    icon: "clock",
    nameKey: "marketing.home.hero.portal.pkg1.name",
    durationKey: "marketing.home.hero.portal.pkg1.duration",
  },
  {
    id: "3h",
    group: "daily",
    seconds: 3 * 60 * 60,
    name: "Flexible",
    duration: "3 hours",
    price: "2,500",
    speed: "25 Mbps",
    dataKey: "unlimitedData",
    devices: 1,
    icon: "bolt",
    featured: true,
    nameKey: "marketing.home.hero.portal.pkg2.name",
    durationKey: "marketing.home.hero.portal.pkg2.duration",
  },
  {
    id: "24h",
    group: "long",
    seconds: 24 * 60 * 60,
    name: "Day Pass",
    duration: "24 hours",
    price: "5,000",
    speed: "30 Mbps",
    dataKey: "unlimitedData",
    devices: 1,
    icon: "sun",
    nameKey: "marketing.home.hero.portal.pkg3.name",
    durationKey: "marketing.home.hero.portal.pkg3.duration",
  },
  {
    id: "30d",
    group: "long",
    seconds: 30 * 24 * 60 * 60,
    name: "Monthly",
    duration: "30 days",
    price: "35,000",
    speed: "50 Mbps",
    dataKey: "unlimitedData",
    devices: 1,
    icon: "calendar",
    featured: true,
    nameKey: "marketing.home.hero.portal.pkg4.name",
    durationKey: "marketing.home.hero.portal.pkg4.duration",
  },
];

const DEFAULT_PACKAGE = PACKAGES[1];
const GOLD_GRADIENT = "bg-[linear-gradient(135deg,#FBA102_0%,#F16304_100%)]";

/** The sponsoring business shown in the banner carousel. */
const DEMO_BANNER_AD = {
  id: "cafe",
  business: "Ubungo Fresh Café",
  title: "A small break. A very good coffee.",
  description: "Fresh brews, warm bites and a little time for yourself.",
  cta: "Take a little break",
  theme: "cafe" as const,
};

/** HH:MM:SS, tolerating hour counts above 24 (the 30-day pass is 720h). */
function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Reads the motion preference as state so the phone can stop auto-advancing for
 * readers who asked for less movement. Starts `false` so the server and the first
 * client render agree; the real value arrives in the effect.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export function HeroPhoneMockup({ className }: { className?: string }) {
  const { t } = useI18n();
  const reduced = usePrefersReducedMotion();

  const [phase, setPhase] = useState<Phase>("portal");
  const [filter, setFilter] = useState<PackageFilter>("daily");
  const [selectedId, setSelectedId] = useState(DEFAULT_PACKAGE.id);
  const [payStage, setPayStage] = useState<PayStage>("entry");
  const [countdown, setCountdown] = useState(DEFAULT_PACKAGE.seconds);

  const selected = PACKAGES.find((pkg) => pkg.id === selectedId && pkg.group === filter) ?? PACKAGES.find((pkg) => pkg.id === selectedId) ?? DEFAULT_PACKAGE;
  const visiblePackages = PACKAGES.filter((pkg) => pkg.group === filter);

  /* The loop. Each stage sets its own dwell time, which also drives the progress
     bar underneath the rail, so the two can never disagree. */
  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === "portal" ? "checkout" : current === "checkout" ? "connected" : "portal"));
    }, PHASE_DURATION[phase]);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  /* The checkout walks the same three sub-steps a real Snippe flow does: the
     operator's request going out, the guest approving on their handset, then the
     portal authorising the device. */
  useEffect(() => {
    if (phase !== "checkout") return;
    setPayStage("entry");
    const toWaiting = window.setTimeout(() => setPayStage("waiting"), PAY_DURATION.entry);
    const toConnecting = window.setTimeout(() => setPayStage("connecting"), PAY_DURATION.entry + PAY_DURATION.waiting);
    return () => {
      window.clearTimeout(toWaiting);
      window.clearTimeout(toConnecting);
    };
  }, [phase, selectedId]);

  /* Restart the countdown from the purchased package every time we land on the
     connected stage. */
  useEffect(() => {
    if (phase !== "connected") return;
    setCountdown(selected.seconds);
    const interval = window.setInterval(() => {
      setCountdown((remaining) => (remaining > 0 ? remaining - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [phase, selected]);

  const enterAnimation = reduced ? undefined : { animation: "advo-portal-screen 320ms ease-out both" };

  const shortcuts: PortalShortcut[] = [
    {
      id: "website",
      title: t("marketing.home.hero.portal.shortcut.website"),
      subtitle: t("marketing.home.hero.portal.shortcut.websiteSub"),
      icon: "globe",
      href: "https://advotz.com",
    },
    {
      id: "jobs",
      title: t("marketing.home.hero.portal.shortcut.jobs"),
      subtitle: t("marketing.home.hero.portal.shortcut.jobsSub"),
      icon: "briefcase",
    },
    {
      id: "promote",
      title: t("marketing.home.hero.portal.shortcut.promote"),
      subtitle: t("marketing.home.hero.portal.shortcut.promoteSub"),
      icon: "megaphone",
    },
  ];

  return (
    <div className={cx("relative mx-auto w-full max-w-[320px] lg:ml-auto lg:mr-0", className)}>
      {/* Brand glow behind the device */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 -z-10 rounded-full bg-[radial-gradient(circle,rgba(27,94,164,0.5),transparent_66%)] blur-3xl"
      />

      {/* Floating chip — the "this is live" cue, mirroring the reference layout */}
      <span className="absolute -left-6 top-24 z-20 hidden items-center gap-2 rounded-full border border-white/15 bg-advo-charcoal/90 px-3.5 py-2 text-[11px] font-bold tracking-wide text-white/85 shadow-xl backdrop-blur md:inline-flex lg:-left-14">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
        </span>
        {t("marketing.home.hero.portal.live")}
      </span>

      {/* Floating receipt — the owner-side outcome of the same transaction */}
      <div
        aria-hidden="true"
        className="absolute -right-6 bottom-28 z-20 hidden w-[186px] rounded-2xl border border-white/10 bg-white p-3 shadow-2xl md:block lg:-right-14"
      >
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold text-[#18212F]">
              {t("marketing.home.hero.portal.receipt")}
            </span>
            <span className="block font-mono text-[9px] text-[#526174]">
              M-Pesa · TZS {DEFAULT_PACKAGE.price}
            </span>
          </span>
        </div>
        <div className="mt-2 border-t border-[#DFE5EC] pt-2 text-[8px] font-medium text-[#526174]">
          {t("marketing.home.hero.portal.receiptDevice")}
        </div>
      </div>

      {/* ── The device ───────────────────────────────────────────────────── */}
      {/* Titanium band, lit from the top-left like brushed metal. */}
      <div className="relative rounded-[3.4rem] bg-[linear-gradient(140deg,#5d656e_0%,#252a30_20%,#14171b_52%,#2b3138_80%,#5b636c_100%)] p-[3px] shadow-[0_48px_90px_-28px_rgba(0,0,0,0.92)]">
        {/* Side buttons, sitting on the band rather than inside the screen. */}
        <span
          aria-hidden="true"
          className="absolute -left-[3px] top-[124px] h-8 w-[3px] rounded-l-full bg-[linear-gradient(180deg,#6b737c,#20242a)]"
        />
        <span
          aria-hidden="true"
          className="absolute -left-[3px] top-[168px] h-12 w-[3px] rounded-l-full bg-[linear-gradient(180deg,#6b737c,#20242a)]"
        />
        <span
          aria-hidden="true"
          className="absolute -left-[3px] top-[226px] h-12 w-[3px] rounded-l-full bg-[linear-gradient(180deg,#6b737c,#20242a)]"
        />
        <span
          aria-hidden="true"
          className="absolute -right-[3px] top-[184px] h-16 w-[3px] rounded-r-full bg-[linear-gradient(180deg,#6b737c,#20242a)]"
        />

        {/* Black bezel */}
        <div className="rounded-[3.2rem] bg-black p-[9px]">
          {/* Screen. `aspect-[393/852]` is the iPhone 16 Pro logical resolution.
              `@container` is what makes the portal components lay out at phone
              proportions instead of at the page's own breakpoints. */}
          <div
            aria-hidden="true"
            className="@container relative flex aspect-[393/852] select-none flex-col overflow-hidden rounded-[2.7rem] bg-portal-paper text-portal-ink"
          >
            {/* Dynamic Island */}
            <div className="absolute left-1/2 top-2.5 z-30 flex h-[26px] w-[86px] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-2.5">
              <span className="size-2 rounded-full bg-[#101f30] ring-1 ring-white/10" />
            </div>

            {/* Status bar */}
            <div className="relative z-20 flex h-11 shrink-0 items-center justify-between px-7 pt-1 text-[11px] font-semibold">
              <span className="tabular-nums">9:41</span>
              <span className="flex items-center gap-1">
                <Signal className="size-3.5" />
                <Wifi className="size-3.5" />
                <BatteryFull className="size-4" />
              </span>
            </div>

            {/* ── Portal body ─────────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {phase === "portal" ? (
                <div key="portal" style={enterAnimation}>
                  <PortalResellerHeader
                    active={false}
                    location={t("marketing.home.hero.portal.location")}
                    name={t("marketing.home.hero.portal.name")}
                    status={t("marketing.home.hero.portal.status.ready")}
                    supportLabel={t("marketing.home.hero.portal.help")}
                  />

                  <div className="px-4 pb-5 pt-4">
                    {/* Sponsored banner — a plan-controlled placement, collapsed
                        here because this demo site is an ad-free plan. */}
                    <div className="mb-5">
                      <PortalBanner ad={DEMO_BANNER_AD} onCta={() => undefined} sponsoredLabel={t("portal.sponsoredChip")} />
                      <PortalBannerControls
                        count={3}
                        credit={t("marketing.home.hero.portal.banner.credit")}
                        index={0}
                        labels={{
                          slideAria: t("portal.advertSlideAria"),
                          previous: t("portal.advertPrev"),
                          next: t("portal.advertNext"),
                          play: t("portal.advertPlay"),
                          pause: t("portal.advertPause"),
                        }}
                        onMove={() => undefined}
                        onSelect={() => undefined}
                      />
                    </div>

                    {/* Welcome */}
                    <div className="mb-6">
                      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-portal-orange-deep">
                        {t("marketing.home.hero.portal.welcome.eyebrow")}
                      </p>
                      <h2 className="max-w-[360px] text-[29px] leading-[1.07] tracking-[-0.04em]">
                        {t("marketing.home.hero.portal.welcome.title", { name: t("marketing.home.hero.portal.name") })}
                      </h2>
                      <p className="mt-2.5 max-w-[440px] text-xs leading-relaxed text-portal-muted">
                        {t("marketing.home.hero.portal.welcome.body")}
                      </p>
                      <PortalJourney
                        className="mt-4"
                        steps={[
                          t("marketing.home.hero.portal.journey.choose"),
                          t("marketing.home.hero.portal.journey.pay"),
                          t("marketing.home.hero.portal.journey.connect"),
                        ]}
                      />
                    </div>

                    {/* Packages */}
                    <div className="mb-4 flex flex-col items-start gap-2.5">
                      <div>
                        <h3 className="text-xl tracking-[-0.025em]">{t("marketing.home.hero.portal.packages.title")}</h3>
                        <p className="mt-1 text-[10px] text-portal-muted">{t("marketing.home.hero.portal.packages.subtitle")}</p>
                      </div>
                      <PortalSegmented
                        ariaLabel={t("marketing.home.hero.portal.packages.title")}
                        onChange={setFilter}
                        options={[
                          { id: "daily" as PackageFilter, label: t("marketing.home.hero.portal.filter.daily") },
                          { id: "long" as PackageFilter, label: t("marketing.home.hero.portal.filter.long") },
                        ]}
                        value={filter}
                      />
                    </div>

                    <PortalPackageGrid>
                      {visiblePackages.map((pkg) => (
                        <PortalPackageCard
                          key={pkg.id}
                          labels={{
                            upTo: t("portal.card.upTo"),
                            deviceOne: t("portal.card.deviceOne"),
                            deviceMany: t("portal.card.deviceMany"),
                          }}
                          onSelect={(id) => {
                            setSelectedId(id);
                            setPhase("checkout");
                          }}
                          package={{
                            id: pkg.id,
                            name: t(pkg.nameKey),
                            duration: t(pkg.durationKey),
                            price: pkg.price,
                            speed: pkg.speed,
                            data: t(pkg.dataKey),
                            devices: pkg.devices,
                            icon: pkg.icon,
                            featured: pkg.featured,
                            ribbon: t(pkg.group === "daily" ? "marketing.home.hero.portal.popular" : "marketing.home.hero.portal.bestValue"),
                          }}
                          selectLabel={t("marketing.home.hero.portal.select")}
                          selected={pkg.id === selectedId}
                        />
                      ))}
                    </PortalPackageGrid>

                    {/* Voucher + mobile money */}
                    <div className="mt-5 flex flex-col gap-2.5">
                      <button className="flex items-center gap-2 text-[11px] text-portal-muted" type="button">
                        <PortalIcon className="size-4" name="ticket" />
                        {t("marketing.home.hero.portal.voucher")}{" "}
                        <strong className="text-[11px] font-semibold text-portal-orange-deep">
                          {t("marketing.home.hero.portal.voucherCode")} →
                        </strong>
                      </button>
                      <PortalMoneyMethods ariaLabel={t("portal.payWithMobileMoney")} prefix={t("marketing.home.hero.portal.payWith")} />
                    </div>

                    <PortalServiceStrip
                      className="mt-5"
                      items={[
                        { icon: "bolt", label: t("marketing.home.hero.portal.service.instant") },
                        { icon: "shield", label: t("marketing.home.hero.portal.service.noAccount") },
                        { icon: "help", label: t("marketing.home.hero.portal.service.support") },
                      ]}
                    />
                  </div>
                </div>
              ) : null}

              {phase === "checkout" ? (
                <div className="flex min-h-full flex-col justify-center px-4 py-6" key="checkout" style={enterAnimation}>
                  {payStage === "entry" ? (
                    <>
                      <span className="mb-4 grid size-11 place-items-center rounded-[14px] bg-portal-orange-soft text-portal-orange-deep">
                        <PortalIcon className="size-6" name="wallet" />
                      </span>
                      <h2 className="pr-3 text-[26px] tracking-[-0.04em]">{t("marketing.home.hero.portal.checkout.title")}</h2>
                      <p className="mt-2 text-xs leading-relaxed text-portal-muted">
                        {t("marketing.home.hero.portal.checkout.subtitle")}
                      </p>

                      <div className="my-5 rounded-[14px] bg-[#f3f6f8] p-4">
                        <div className="flex items-center justify-between gap-3 text-[15px] font-bold">
                          <span>{t(selected.nameKey)}</span>
                          <span>{t(selected.durationKey)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-portal-muted">
                          <span>{selected.speed}</span>
                          <span>·</span>
                          <span>{t(selected.dataKey)}</span>
                          <span>·</span>
                          <span>
                            {t(selected.devices === 1 ? "portal.card.deviceOne" : "portal.card.deviceMany", {
                              count: selected.devices,
                            })}
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] text-portal-muted">
                          {t("marketing.home.hero.portal.checkout.providedBy", { name: t("marketing.home.hero.portal.name") })}
                        </p>
                      </div>

                      <span className="mb-1.5 block text-[11px] font-bold">
                        {t("marketing.home.hero.portal.checkout.phone")}
                      </span>
                      <div className="flex items-center overflow-hidden rounded-[11px] border border-[#d8e0e7] bg-white">
                        <span className="flex items-center gap-1.5 border-e border-portal-line bg-[#f8fafb] px-2.5 py-3 text-xs text-[#556a7c]">
                          <span
                            aria-hidden="true"
                            className="inline-block h-3.5 w-5 rounded-[2px] bg-[linear-gradient(145deg,#259653_0_35%,#f1d530_35%_40%,#131e25_40%_60%,#f1d530_60%_65%,#3299d4_65%)]"
                          />
                          +255
                        </span>
                        <span className="flex-1 px-3 py-3 text-[15px] text-[#9ba8b5]">712 345 678</span>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-portal-muted">
                        {t("marketing.home.hero.portal.checkout.phoneHelp")}
                      </p>

                      <PortalMoneyMethods ariaLabel={t("portal.payWithMobileMoney")} className="my-4" />

                      <div className="flex items-center justify-between border-t border-portal-line py-4 text-xs">
                        <span>{t("marketing.home.hero.portal.checkout.total")}</span>
                        <strong className="text-xl tracking-[-0.03em]">TSh {selected.price}</strong>
                      </div>

                      <div className="flex items-center justify-center gap-2 rounded-xl bg-portal-orange py-3.5 text-[13px] font-semibold text-white">
                        {t("marketing.home.hero.portal.pay", { amount: selected.price })}
                        <PortalIcon className="size-4" name="arrow" />
                      </div>
                      <p className="mt-3 text-center text-[10px] text-portal-muted">
                        {t("marketing.home.hero.portal.checkout.terms")}
                      </p>
                    </>
                  ) : null}

                  {payStage === "waiting" ? (
                    <div className="text-center">
                      <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-portal-orange-soft text-portal-orange-deep">
                        <PortalIcon className="size-6" name="phone" />
                      </span>
                      <h2 className="text-[26px]">{t("marketing.home.hero.portal.waiting.title")}</h2>
                      <p className="mt-3 text-xs leading-relaxed text-portal-muted">
                        {t("marketing.home.hero.portal.waiting.body")}
                      </p>
                      <p className="my-4 rounded-[11px] border border-portal-line bg-[#f8fafb] py-3 font-mono text-base font-semibold tracking-[0.07em]">
                        +255 712 345 678
                      </p>
                      <p className="text-xs font-semibold">
                        TSh {selected.price}
                        <br />
                        <span className="font-normal text-portal-muted">{t("marketing.home.hero.portal.name")}</span>
                      </p>
                    </div>
                  ) : null}

                  {payStage === "connecting" ? (
                    <div className="text-center">
                      <span className="mx-auto mb-5 block size-14 animate-spin rounded-full border-4 border-[#e9eff3] border-t-portal-orange" />
                      <h2 className="text-[26px]">{t("marketing.home.hero.portal.connecting.title")}</h2>
                      <p className="mt-3 text-xs leading-relaxed text-portal-muted">
                        {t("marketing.home.hero.portal.connecting.body", { name: t("marketing.home.hero.portal.name") })}
                      </p>
                      <p className="mt-4 text-[10px] text-portal-muted">{t("marketing.home.hero.portal.authorizing")}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {phase === "connected" ? (
                <div key="connected" style={enterAnimation}>
                  <PortalResellerHeader
                    active
                    location={t("marketing.home.hero.portal.location")}
                    name={t("marketing.home.hero.portal.name")}
                    status={t("marketing.home.hero.portal.status.online")}
                    supportLabel={t("marketing.home.hero.portal.help")}
                  />

                  <div className="px-4 pb-6 pt-5">
                    {/* Connected confirmation */}
                    <PortalSuccessMark />
                    <p className="mb-2 mt-3 text-[9px] font-bold uppercase tracking-[0.12em] text-portal-green">
                      {t("marketing.home.hero.portal.connected.eyebrow")}
                    </p>
                    <h2 className="text-[30px] tracking-[-0.05em]">{t("marketing.home.hero.portal.connected")}</h2>
                    <p className="mt-2 text-xs leading-relaxed text-portal-muted">
                      {t("marketing.home.hero.portal.connectedBody")}
                    </p>

                    <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-portal-orange py-3.5 text-[13px] font-semibold text-white">
                      {t("marketing.home.hero.portal.browse")}
                      <PortalIcon className="size-4" name="arrow" />
                    </div>

                    {/* Session ticket — the purchased service always comes first */}
                    <PortalSessionTicket
                      accessLabel={t("marketing.home.hero.portal.ticket.access")}
                      activePassLabel={t("marketing.home.hero.portal.ticket.activePass")}
                      connectedLabel={t("marketing.home.hero.portal.ticket.connected")}
                      dataLabel={t("marketing.home.hero.portal.ticket.data")}
                      endedLabel={t("marketing.home.hero.portal.ticket.ended")}
                      passLabel={t("marketing.home.hero.portal.ticket.activePass")}
                      session={{
                        packageName: t(selected.nameKey),
                        duration: t(selected.durationKey),
                        speed: selected.speed,
                        data: t(selected.dataKey),
                        devices: selected.devices,
                        deviceUnit: t("marketing.home.hero.portal.ticket.device"),
                        resellerName: t("marketing.home.hero.portal.name"),
                        location: t("marketing.home.hero.portal.location").split(",")[0],
                        validUntil: "Today · 14:41 EAT",
                        paidLabel: t("marketing.home.hero.portal.ticket.paid", { amount: `TSh ${selected.price}` }),
                        remaining: formatDuration(countdown),
                        method: "mobile-money",
                      }}
                      upToLabel={t("marketing.home.hero.portal.ticket.upTo")}
                      validityLabel={t("marketing.home.hero.portal.ticket.validity")}
                      validUntilLabel={t("marketing.home.hero.portal.ticket.validUntil")}
                      voucherLabel={t("marketing.home.hero.portal.ticket.voucherPass")}
                    />

                    {/* Explore — discovery sits below the service, on every plan */}
                    <div className="mt-6 border-t border-portal-line pt-5">
                      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-portal-orange-deep">
                        {t("marketing.home.hero.portal.explore.eyebrow")}
                      </p>
                      <h3 className="text-xl tracking-[-0.025em]">{t("marketing.home.hero.portal.explore.title")}</h3>
                      <p className="mt-1.5 text-[11px] text-portal-muted">{t("marketing.home.hero.portal.explore.body")}</p>

                      <div className="mb-4 mt-4 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <PortalBusinessCard
                          business={{
                            id: "tech",
                            name: t("marketing.home.hero.portal.biz1.name"),
                            category: t("marketing.home.hero.portal.biz1.category"),
                            description: t("marketing.home.hero.portal.biz1.body"),
                            location: t("marketing.home.hero.portal.biz1.location"),
                            theme: "tech",
                          }}
                          className="w-[215px] shrink-0"
                          offerLabel={t("marketing.home.hero.portal.explore.offer")}
                          sponsoredLabel={t("portal.sponsoredChip")}
                        />
                        <PortalBusinessCard
                          business={{
                            id: "style",
                            name: t("marketing.home.hero.portal.biz2.name"),
                            category: t("marketing.home.hero.portal.biz2.category"),
                            description: t("marketing.home.hero.portal.biz2.body"),
                            location: t("marketing.home.hero.portal.biz2.location"),
                            theme: "style",
                          }}
                          className="w-[215px] shrink-0"
                          offerLabel={t("marketing.home.hero.portal.explore.offer")}
                          sponsoredLabel={t("portal.sponsoredChip")}
                        />
                      </div>

                      <p className="mb-4 text-[9px] text-portal-muted">{t("marketing.home.hero.portal.explore.note")}</p>

                      <PortalDiscoverLinks ariaLabel={t("marketing.home.hero.portal.explore.title")} shortcuts={shortcuts} />
                    </div>

                    <p className="mt-6 flex items-center gap-1.5 rounded-xl border border-portal-line bg-white p-2.5 text-[9px] font-bold">
                      <PortalIcon className="size-3" name="shield" />
                      {t("marketing.home.hero.portal.recovery")}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Glass reflection — a single diagonal sheen sells the screen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-40 rounded-[2.7rem] bg-[linear-gradient(128deg,rgba(255,255,255,0.5)_0%,rgba(255,255,255,0.08)_26%,transparent_46%)]"
            />
          </div>
        </div>
      </div>

      {/* ── Step rail (the accessible control for the animation) ─────────── */}
      <div className="mt-7 flex flex-col items-center gap-3">
        <ol className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-1 backdrop-blur">
          {PHASES.map((item, index) => {
            const active = item.id === phase;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPhase(item.id)}
                  aria-current={active ? "step" : undefined}
                  className={cx(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3",
                    active ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80",
                  )}
                >
                  <span
                    className={cx(
                      "flex size-4 items-center justify-center rounded-full font-mono text-[9px] font-black",
                      active ? "bg-advo-gold text-advo-charcoal" : "bg-white/10 text-white/70",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="hidden sm:inline">{t(item.labelKey)}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Auto-advance progress. Decorative: the rail already states the stage,
            and it is hidden entirely when motion is not wanted. */}
        {reduced ? null : (
          <div aria-hidden="true" className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
            <div
              key={phase}
              className={cx("h-full origin-left rounded-full", GOLD_GRADIENT)}
              style={{ animation: `advo-portal-fill ${PHASE_DURATION[phase]}ms linear both` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
