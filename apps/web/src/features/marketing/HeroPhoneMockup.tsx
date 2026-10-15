"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { BatteryFull, CheckCircle2, Signal, Wifi } from "lucide-react";
import type { MessageKey } from "@advo/i18n";
import {
  PortalPackageCard,
  PortalPackageList,
  type PortalPackageView,
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

/** How long each stage holds before the loop advances, in milliseconds. */
const PHASE_DURATION: Record<Phase, number> = {
  portal: 6400,
  checkout: 5600,
  connected: 7200,
};

/**
 * The wallets on the captive-portal payment dialog, in the same order and
 * colours the guest sees. The sample number starts 0754, so M-Pesa is the one
 * that lights up.
 */
const PAYMENT_WALLETS = [
  { id: "mpesa", name: "M-Pesa", networkKey: "portal.networkVodacom" as MessageKey, tint: "#e60000", active: true },
  { id: "airtel", name: "Airtel Money", networkKey: "portal.networkAirtel" as MessageKey, tint: "#e30613", active: false },
  { id: "mixx", name: "Mixx by Yas", networkKey: "portal.networkYas" as MessageKey, tint: "#0a4ea2", active: false },
] as const;

/** The Explore rows under the connected screen, in the portal's own order. */
const CONNECTED_ROWS: Array<{ icon: string; labelKey: MessageKey }> = [
  { icon: "📍", labelKey: "portal.exploreBusinesses" },
  { icon: "🌐", labelKey: "portal.visitAdvotz" },
  { icon: "🎟️", labelKey: "portal.localEvents" },
  { icon: "🌴", labelKey: "portal.holidays" },
  { icon: "💼", labelKey: "portal.jobsOpportunities" },
  { icon: "📣", labelKey: "portal.promoteBusiness" },
];

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

/**
 * The three passes the phone shows, stacked in one column — the portal's `list`
 * layout — with the popular 3-hour pass first.
 */
const SHOWCASE = [PACKAGES[1], PACKAGES[0], PACKAGES[2]];

/**
 * Brand colours painted onto the shared portal tokens, so the phone uses the
 * same gold-to-orange combination as the rest of Advo and not the navy default.
 */
const BRAND_PORTAL_STYLE = {
  "--advo-portal-orange": "#F16304",
  "--advo-portal-orange-deep": "#c2410c",
  "--advo-portal-orange-soft": "#2a2118",
  "--advo-portal-ink": "#f6f1ea",
  "--advo-portal-ink-deep": "#1c140e",
  "--advo-portal-ink-line": "rgba(251,161,2,0.35)",
  "--advo-portal-paper": "#111213",
  "--advo-portal-line": "rgba(255,255,255,0.12)",
  "--advo-portal-muted": "#b7aea4",
  "--advo-blue": "#F16304",
  "--color-portal-orange": "#F16304",
  "--color-portal-orange-deep": "#c2410c",
  "--color-portal-orange-soft": "#2a2118",
  "--color-portal-ink": "#f6f1ea",
  "--color-portal-ink-deep": "#1c140e",
  "--color-portal-ink-line": "rgba(251,161,2,0.35)",
  "--color-portal-paper": "#111213",
  "--color-portal-line": "rgba(255,255,255,0.12)",
  "--color-portal-muted": "#b7aea4",
} as CSSProperties;

/**
 * White surfaces inside the dark phone (the connected header, explore cards)
 * keep charcoal ink. The screen itself uses the light ink above.
 */
const ON_LIGHT_INK = {
  "--advo-portal-ink": "#111213",
  "--color-portal-ink": "#111213",
  "--advo-portal-muted": "#617386",
  "--color-portal-muted": "#617386",
} as CSSProperties;

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
  const [selectedId, setSelectedId] = useState(DEFAULT_PACKAGE.id);

  const selected = PACKAGES.find((pkg) => pkg.id === selectedId) ?? DEFAULT_PACKAGE;

  /* The loop. Each stage sets its own dwell time, which also drives the progress
     bar underneath the rail, so the two can never disagree. */
  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === "portal" ? "checkout" : current === "checkout" ? "connected" : "portal"));
    }, PHASE_DURATION[phase]);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  const enterAnimation = reduced ? undefined : { animation: "advo-portal-screen 320ms ease-out both" };

  return (
    <div className={cx("relative mx-auto w-full max-w-[320px] lg:ml-auto lg:mr-0", className)}>
      {/* Brand glow behind the device */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 -z-10 rounded-full bg-[radial-gradient(circle,rgba(241,99,4,0.45),transparent_66%)] blur-3xl"
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
            className="@container relative flex aspect-[393/852] select-none flex-col overflow-hidden rounded-[2.7rem] bg-[#111213] text-portal-ink"
            style={BRAND_PORTAL_STYLE}
          >
            {/* Dynamic Island */}
            <div className="absolute left-1/2 top-2.5 z-30 flex h-[26px] w-[86px] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-2.5">
              <span className="size-2 rounded-full bg-[#101f30] ring-1 ring-white/10" />
            </div>

            {/* Status bar */}
            <div className="relative z-20 flex h-11 shrink-0 items-center justify-between px-7 pt-1 text-[11px] font-semibold text-white">
              <span className="tabular-nums">9:41</span>
              <span className="flex items-center gap-1">
                <Signal className="size-3.5" />
                <Wifi className="size-3.5" />
                <BatteryFull className="size-4" />
              </span>
            </div>

            {/* ── Portal body ─────────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {phase === "portal" || phase === "checkout" ? (
                <div key="portal" className={phase === "checkout" ? "pointer-events-none" : undefined} style={enterAnimation}>
                  {/* The same landing a guest gets: a short advert, the business
                      name, then the packages. No extra welcome screen. */}
                  <div className="px-3 pt-1">
                    <div className={`relative overflow-hidden rounded-2xl px-3.5 py-3 text-advo-charcoal ${GOLD_GRADIENT}`}>
                      <span className="absolute -right-6 -top-8 size-20 rounded-full border-[10px] border-white/25" />
                      <span className="relative mb-1 inline-flex rounded-full bg-black/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider">
                        {t("portal.sponsoredChip")}
                      </span>
                      <strong className="relative block text-[13px] leading-tight font-black">
                        {t("marketing.home.hero.portal.banner.title")}
                      </strong>
                      <p className="relative mt-0.5 text-[10px] leading-snug text-advo-charcoal/80">
                        {t("marketing.home.hero.portal.banner.body")}
                      </p>
                    </div>
                  </div>

                  <header className="px-4 pt-3 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt=""
                      className="mx-auto mb-1.5 h-10 w-auto"
                      src="/brand/advo-logo.png"
                    />
                    <h2 className="text-[20px] leading-none font-black tracking-tight text-white">
                      {t("marketing.home.hero.portal.name")}
                    </h2>
                    <p className="mt-1 text-[10px] text-white/55">{t("marketing.home.hero.portal.location")}</p>
                  </header>

                  <div className="px-3.5 pt-3 pb-5">
                    <h3 className="text-center text-[15px] font-black tracking-tight text-white">
                      {t("marketing.home.hero.portal.packages.title")}
                    </h3>
                    <p className="mt-0.5 mb-2.5 text-center text-[10px] text-white/50">
                      {t("marketing.home.hero.portal.packages.subtitle")}
                    </p>

                    <div style={ON_LIGHT_INK}>
                      <PortalPackageList className="pt-1" layout="list">
                        {SHOWCASE.map((pkg) => (
                          <PortalPackageCard
                            key={pkg.id}
                            labels={{
                              upTo: t("portal.card.upTo"),
                              deviceOne: t("portal.card.deviceOne"),
                              deviceMany: t("portal.card.deviceMany"),
                            }}
                            layout="list"
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
                            }}
                            selectLabel={t("portal.selectPackage")}
                            selected={pkg.id === selectedId}
                            style="classic"
                          />
                        ))}
                      </PortalPackageList>
                    </div>

                    <div className="mt-3.5 border-t border-white/10 pt-3">
                      <p className="mb-2 text-center text-[9px] font-bold tracking-wider text-white/45 uppercase">
                        {t("portal.voucherOr")}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/8 px-2.5 py-2 font-mono text-[10px] font-bold tracking-wider text-white/45">
                          {t("portal.voucherPlaceholder")}
                        </div>
                        <div className={`shrink-0 rounded-xl px-2.5 py-2 text-[10px] font-bold text-advo-charcoal ${GOLD_GRADIENT}`}>
                          {t("portal.voucherSubmit")}
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 text-center text-[9px] font-semibold text-portal-muted">Advo TZ</p>
                  </div>
                </div>
              ) : null}

              {phase === "checkout" ? (
                <div
                  className="absolute inset-0 z-20 grid place-items-center bg-[#010c21]/70 p-2.5 backdrop-blur-sm"
                  key="checkout"
                  style={enterAnimation}
                >
                  {/* The same dialog a guest gets after tapping a package. */}
                  <div className="relative w-full rounded-[20px] bg-white p-3 text-[#111213] shadow-2xl">
                    <span className="absolute top-1.5 right-2 grid size-6 place-items-center text-lg leading-none font-bold text-slate-500">
                      ×
                    </span>
                    <h2 className="mb-2 pe-5 text-center text-[15px] leading-tight font-black tracking-tight">
                      {t("portal.payTitle")}
                    </h2>

                    <div
                      className="rounded-2xl border p-2.5"
                      style={{
                        borderColor: "color-mix(in srgb, #F16304 28%, transparent)",
                        background: "color-mix(in srgb, #F16304 8%, white)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[8px] font-bold tracking-[0.1em] text-[#617386] uppercase">
                            {t("portal.youAreBuying")}
                          </p>
                          <p className="truncate text-[13px] leading-tight font-black">{t(selected.nameKey)}</p>
                        </div>
                        <strong className="shrink-0 text-[14px] font-black text-[#F16304] tabular-nums">
                          TZS {selected.price}
                        </strong>
                      </div>
                      <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-[#617386]">
                        <li>{t(selected.durationKey)}</li>
                        <li>{selected.speed}</li>
                        <li>{t(selected.dataKey)}</li>
                        <li>
                          {t(selected.devices === 1 ? "portal.card.deviceOne" : "portal.card.deviceMany", {
                            count: selected.devices,
                          })}
                        </li>
                      </ul>
                    </div>

                    <div className="mt-2.5">
                      <p className="mb-1 text-[10px] font-semibold">{t("mobileMoneyNumber")}</p>
                      <div className="rounded-2xl border border-[#e3e8ee] bg-[#f8f9fb] px-3 py-2 text-[13px] font-semibold tracking-wide text-[#111213]">
                        0754 382 119
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {PAYMENT_WALLETS.map((wallet) => (
                        <div
                          className="grid place-items-center gap-0.5 rounded-xl border p-1.5 text-center"
                          key={wallet.id}
                          style={{
                            borderColor: wallet.active ? wallet.tint : "transparent",
                            background: wallet.active ? `color-mix(in srgb, ${wallet.tint} 10%, white)` : "#ffffff",
                            boxShadow: wallet.active
                              ? "0 4px 12px -8px rgba(0,0,0,.4)"
                              : "0 1px 2px rgba(15,23,42,.06)",
                          }}
                        >
                          <span
                            className="grid size-5 place-items-center rounded-full text-[9px] font-black text-white"
                            style={{ background: wallet.tint }}
                          >
                            {wallet.name.charAt(0)}
                          </span>
                          <span className="text-[8px] leading-tight font-bold">{wallet.name}</span>
                          <span className="text-[8px] text-[#617386]">{t(wallet.networkKey)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[9px] text-[#617386]">
                      {t("portal.networkDetected", { network: t("portal.networkVodacom") })}
                    </p>

                    <div
                      className={`mt-2.5 flex items-center justify-center rounded-xl py-2.5 text-[12px] font-bold text-advo-charcoal ${GOLD_GRADIENT}`}
                    >
                      {t("pay")} TZS {selected.price}
                    </div>
                    <p className="mt-2 text-center text-[10px] font-bold text-[#617386] underline">
                      {t("portal.changePackage")}
                    </p>
                  </div>
                </div>
              ) : null}

              {phase === "connected" ? (
                <div className="relative px-3 pt-2 pb-6 text-white" key="connected" style={enterAnimation}>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-16 left-1/2 size-44 -translate-x-1/2 rounded-full border-[20px] border-white/5"
                  />

                  <div className="relative mb-2.5 text-center">
                    <div className="relative mx-auto mb-2 grid size-11 place-items-center rounded-2xl border border-[#FBA102]/40 bg-[#FBA102]/15 text-xl font-black text-[#FBA102]">
                      ✓
                      <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#FBA102] opacity-75" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-[#FBA102]" />
                      </span>
                    </div>
                    <h2 className="text-[20px] leading-tight font-black tracking-tight text-white">
                      {t("portal.connectedTitle")}
                    </h2>
                    <p className="mt-1 text-[10px] font-medium text-[#FBA102]">● {t("portal.wifiActiveStatus")}</p>
                  </div>

                  <div className="relative mb-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[10px]">
                      <span className="font-medium text-white/70">{t("portal.activePackage")}:</span>
                      <strong className="truncate font-bold text-white">{t(selected.nameKey)}</strong>
                    </div>
                    <div
                      className="flex w-full items-center justify-center rounded-full py-2.5 text-[12px] font-bold text-advo-charcoal"
                      style={{ background: "var(--advo-gradient-gold)" }}
                    >
                      {t("portal.browseInternet")} ›
                    </div>
                  </div>

                  <div className="relative mt-3">
                    <h3 className="mb-2 text-[16px] font-black tracking-tight text-white">{t("portal.exploreTitle")}</h3>
                    <div className="flex flex-col gap-1.5 pb-2">
                      {CONNECTED_ROWS.map((row, index) => (
                        <div
                          className={cx(
                            "flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[11px] font-bold text-advo-charcoal",
                            index === CONNECTED_ROWS.length - 1 && "pe-14",
                          )}
                          key={row.labelKey}
                          style={{ background: "var(--advo-gradient-gold)" }}
                        >
                          <span aria-hidden="true">{row.icon}</span>
                          <span className="truncate">{t(row.labelKey)}</span>
                          <span aria-hidden="true">›</span>
                        </div>
                      ))}
                    </div>
                    <span className="absolute -right-0.5 -bottom-1 grid size-12 place-items-center rounded-full bg-[var(--advo-blue-brand)] text-[9px] font-black text-white shadow-[0_8px_18px_rgba(27,94,164,0.45)]">
                      {t("portal.help")}
                    </span>
                  </div>

                  <p className="relative mt-4 text-center text-[9px] text-white/50">
                    {t("portal.poweredBy", { brand: "Advo TZ" })}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Glass reflection — a single diagonal sheen sells the screen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-40 rounded-[2.7rem] bg-[linear-gradient(128deg,rgba(255,255,255,0.14)_0%,transparent_28%)]"
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
