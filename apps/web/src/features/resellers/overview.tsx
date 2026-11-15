"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BUSINESS_TIMEZONE, formatDateTime, formatTzs } from "@advo/api-client";
import { LOCALE_META, type MessageKey } from "@advo/i18n";
import {
  AdvoKpi,
  DeltaBadge,
  SoftIcon,
  StatusChip,
  statusTone,
} from "@advo/ui";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Clock,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  MapPin,
  Plus,
  RefreshCw,
  Router,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  Wallet,
  Wifi,
} from "lucide-react";
import {
  CHART_COLORS,
  ChartCard,
  MixDonut,
  TrendChart,
} from "@/features/common/charts";
import {
  PageHero,
  ResourceView,
  SectionHeader,
} from "@/features/common/components";
import {
  paymentStateLabel,
  subscriptionStateLabel,
} from "@/features/common/labels";
import {
  SiteScopeSwitcher,
  useSiteScope,
  type ScopedSite,
} from "@/features/resellers/site-scope";
import { ResellerUsageCard } from "@/features/resellers/usage-card";
import { useSessionUser } from "@/features/shell/DashboardShell";
import { useResource } from "@/lib/hooks";
import { useI18n, type I18n } from "@/lib/i18n";
import { RecentTransactions } from "./overview-transactions";

/* ─────────────────────────────────────────────────────────────────────────
 * Types — the shape `/reseller/overview` returns
 * ───────────────────────────────────────────────────────────────────────── */

type Sales = { count: number; amountTzs: string };

type Subscription = {
  state: string;
  plan: string | null;
  planCode: string | null;
  tierKey: string | null;
  planType: "PARTNER" | "INDEPENDENT" | null;
  priceTzs: string | null;
  priceFrom: boolean;
  periodDays: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** Negative once the period has ended, `null` when there is no plan. */
  daysRemaining: number | null;
  trialUsed: boolean;
  /** Absent until the API serves capacity limits (older backend builds). */
  limits?: {
    sites: number | null;
    devices: number | null;
    packagesPerSite: number | null;
    packagesTotal: number | null;
  } | null;
  usage?: {
    sites: number;
    devices: number;
    packagesPerSite: number;
    packagesTotal: number;
  };
  lastInvoice?: {
    id: string;
    amountTzs: string;
    status: string;
    paidAt: string | null;
    periodEnd: string | null;
  } | null;
};

type ResellerOverview = {
  reseller: { businessName: string; status: string };
  subscription: Subscription;
  wallet: { availableTzs: string; pendingTzs: string };
  salesToday: Sales;
  salesAllTime: Sales;
  salesDaily: Array<Sales & { day: string }>;
  salesBySite: Array<Sales & { id: string | null; site: string }>;
  salesByPackage: Array<Sales & { id: string | null; package: string }>;
  paymentMix: Array<Sales & { state: string }>;
  activeGrants: number;
  sites: ScopedSite[];
  deviceCount: number;
  pendingClaims: number;
  packageCount: number;
  ordersNeedingReview: number;
  scope: { siteId: string | null; siteName: string | null };
  totals: { sites: number; devices: number; packages: number };
};

/* ─────────────────────────────────────────────────────────────────────────
 * Shared styles
 * ───────────────────────────────────────────────────────────────────────── */

const card =
  "min-w-0 rounded-card border border-advo-border bg-advo-card shadow-advo-card";
const goldAction =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#f8ba56] px-3.5 text-sm font-bold text-[#261804] transition hover:bg-[#ffd18b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f8ba56] disabled:opacity-50";
const quietAction =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-advo-border bg-advo-card px-3.5 text-sm font-semibold text-advo-text transition hover:bg-advo-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f8ba56]";
const linkAction =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-advo-blue hover:underline";
const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

/* ─────────────────────────────────────────────────────────────────────────
 * Derivation helpers
 * ───────────────────────────────────────────────────────────────────────── */

function percentChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function periodSum(rows: Sales[]) {
  return rows.reduce((total, row) => total + BigInt(row.amountTzs), 0n);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function darHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

/** "1 day left" and "3 days left" are different strings, not a plural rule. */
function remainingDaysLabel(t: I18n["t"], days: number) {
  if (days <= 0) return t("reseller.subscription.endsToday");
  return days === 1
    ? t("reseller.subscription.remainingDay")
    : t("reseller.subscription.remainingDays", { count: days });
}

/** Days are the unit a reseller thinks in, so a limit reads "3 / 5". */
function meteredValue(used: number, limit: number | null, t: I18n["t"]) {
  if (limit === null)
    return `${used} / ${t("reseller.overview.plan.unlimited")}`;
  return `${used} / ${limit}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────────────────────── */

export function ResellerOverviewScreen() {
  const { siteId, scoped } = useSiteScope();
  return (
    <ScopedOverview key={siteId ?? "all"} path={scoped("/reseller/overview")} />
  );
}

function ScopedOverview({ path }: { path: string }) {
  const { t } = useI18n();
  const overview = useResource<ResellerOverview>(path);
  const [refresh, setRefresh] = useState(0);
  const data = overview.data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-10 text-advo-text sm:space-y-6">
      <OverviewHero
        data={data ?? null}
        loading={overview.loading}
        onRefresh={() => {
          setRefresh((version) => version + 1);
          void overview.reload();
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-advo-border bg-advo-card px-3 py-2.5 shadow-advo-card print:hidden">
        <SiteScopeSwitcher variant="hero" />
        <nav
          aria-label={t("reseller.overview.sections")}
          className="flex min-w-0 flex-wrap gap-1"
        >
          {[
            ["#sales", t("reseller.overview.sales")],
            ["#transactions", t("nav.payments")],
            ["#network", t("reseller.overview.network")],
          ].map(([href, label]) => (
            <a
              className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-advo-muted transition hover:bg-advo-surface-soft hover:text-advo-text"
              href={href}
              key={href}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <ResourceView resource={overview}>
        {(o) => <OverviewBody data={o} refresh={refresh} />}
      </ResourceView>
    </div>
  );
}

function OverviewHero({
  data,
  loading,
  onRefresh,
}: {
  data: ResellerOverview | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const me = useSessionUser();
  const dateLocale = LOCALE_META[locale].intlLocale;
  const now = new Date();
  const hour = darHour(now);
  const greeting =
    hour < 12
      ? t("reseller.overview.greeting.morning")
      : hour < 17
        ? t("reseller.overview.greeting.afternoon")
        : t("reseller.overview.greeting.evening");
  const firstName = (me.name ?? "").trim().split(/\s+/)[0];
  const title = firstName
    ? `${greeting}, ${firstName}`
    : (data?.reseller.businessName ?? t("reseller.overview.dashboard"));
  const today = new Intl.DateTimeFormat(dateLocale, {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const subscription = data?.subscription;
  const scopedSite = data?.scope.siteName;

  return (
    <PageHero
      actions={
        <>
          <button
            aria-label={t("common.refresh")}
            className={quietAction}
            disabled={loading}
            onClick={onRefresh}
            title={t("common.refresh")}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${loading ? "motion-safe:animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">{t("common.refresh")}</span>
          </button>
          <Link className={quietAction} href="/reseller/sites">
            <Plus aria-hidden="true" className="size-4" />
            {t("reseller.overview.action.addSite")}
          </Link>
          <Link className={goldAction} href="/reseller/vouchers">
            <Ticket aria-hidden="true" className="size-4" />
            {t("nav.vouchers")}
          </Link>
        </>
      }
      description={t("reseller.overview.hero.subtitle")}
      eyebrow={today}
      icon={<LayoutDashboard />}
      iconTone="accent"
      meta={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
            <ShieldCheck aria-hidden="true" className="size-3" />
            {data?.reseller.businessName ?? t("reseller.overview.dashboard")}
          </span>
          {subscription ? (
            <StatusChip tone={subscriptionTone(subscription.state)}>
              {subscriptionStateLabel(t, subscription.state)}
            </StatusChip>
          ) : null}
          {scopedSite ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
              <MapPin aria-hidden="true" className="size-3" />
              {scopedSite}
            </span>
          ) : null}
        </>
      }
      title={title}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Body
 * ───────────────────────────────────────────────────────────────────────── */

function OverviewBody({
  data: o,
  refresh,
}: {
  data: ResellerOverview;
  refresh: number;
}) {
  const { t, locale } = useI18n();
  const dateLocale = LOCALE_META[locale].intlLocale;
  const [focusReview, setFocusReview] = useState(0);
  const scopedSite = Boolean(o.scope.siteId);
  const sites = scopedSite
    ? o.sites.filter((site) => site.id === o.scope.siteId)
    : o.sites;
  const readySites = sites.filter((site) => site.state === "READY").length;
  const hasPlan =
    o.subscription.state === "ACTIVE" || o.subscription.state === "TRIALING";
  const yesterday = o.salesDaily.at(-2);
  const revenueChange = percentChange(
    Number(o.salesToday.amountTzs),
    Number(yesterday?.amountTzs ?? 0),
  );
  const spark = o.salesDaily.map((row) => Number(row.amountTzs));
  const alerts = buildAlerts(o, t, sites);
  const checklistVisible =
    !hasPlan ||
    o.totals.sites === 0 ||
    o.totals.devices === 0 ||
    o.totals.packages === 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {alerts.length > 0 ? (
        <AttentionCard
          alerts={alerts}
          onReviewOrders={() => setFocusReview((count) => count + 1)}
        />
      ) : null}

      {checklistVisible ? <SetupChecklist data={o} hasPlan={hasPlan} /> : null}

      <section
        aria-label={t("reseller.overview.dashboard")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <AdvoKpi
          delta={
            <DeltaBadge
              label={` ${t("reseller.vsYesterday")}`}
              value={revenueChange}
            />
          }
          hint={t("reseller.overview.kpi.revenueHint", {
            count: o.salesToday.count,
          })}
          icon={<Activity />}
          iconTone="accent"
          label={t("reseller.overview.revenueToday")}
          spark={spark}
          sparkColor={CHART_COLORS.gold}
          value={formatTzs(o.salesToday.amountTzs)}
        />
        <AdvoKpi
          action={
            <Link
              aria-label={t("nav.wallet")}
              className="text-advo-muted transition hover:text-advo-blue"
              href="/reseller/wallet"
            >
              <ArrowUpRight className="size-4" />
            </Link>
          }
          hint={t("reseller.overview.kpi.walletHint", {
            amount: formatTzs(o.wallet.pendingTzs),
          })}
          icon={<Wallet />}
          iconTone="gold"
          label={t("reseller.overview.kpi.wallet")}
          value={formatTzs(o.wallet.availableTzs)}
        />
        <AdvoKpi
          hint={t(
            o.totals.sites === 1
              ? "reseller.overview.sessionsHintOne"
              : "reseller.overview.sessionsHint",
            {
              sites: o.totals.sites,
              devices: o.deviceCount,
            },
          )}
          icon={<Wifi />}
          iconTone="success"
          label={t("reseller.overview.activeSessions")}
          value={o.activeGrants.toLocaleString(dateLocale)}
        />
        <AdvoKpi
          action={
            <Link
              aria-label={t("reseller.overview.manageSites")}
              className="text-advo-muted transition hover:text-advo-blue"
              href="/reseller/sites"
            >
              <ArrowUpRight className="size-4" />
            </Link>
          }
          hint={t("reseller.overview.sitesReadyHint", {
            devices: o.totals.devices,
            packages: o.totals.packages,
          })}
          icon={<Router />}
          iconTone="violet"
          label={t("reseller.overview.readySites")}
          value={`${readySites} / ${sites.length}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <PlanCard className="xl:col-span-5" subscription={o.subscription} />
        <SalesTrendCard className="xl:col-span-7" data={o} />
      </div>

      <section
        id="sales"
        aria-labelledby="sales-title"
        className="scroll-mt-20 space-y-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight" id="sales-title">
              {t("reseller.overview.sales")}
            </h2>
            <p className="mt-0.5 text-sm text-advo-muted">
              {t("reseller.overview.salesSubtitle")}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-advo-border bg-advo-card px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
            <CalendarDays aria-hidden="true" className="size-3" />
            {t("reseller.overview.allTime")} ·{" "}
            {formatTzs(o.salesAllTime.amountTzs)}
          </span>
        </div>
        <div
          className={`grid grid-cols-1 gap-4 ${scopedSite ? "xl:grid-cols-2" : "lg:grid-cols-2 xl:grid-cols-3"}`}
        >
          <MixCard data={o} />
          <RankingCard
            rows={o.salesByPackage.map((row) => ({
              ...row,
              label: row.package,
            }))}
            title={t("reseller.overview.top.packages")}
            hint={t("reseller.overview.byPackage.description")}
          />
          {!scopedSite ? (
            <RankingCard
              className="lg:col-span-2 xl:col-span-1"
              rows={o.salesBySite.map((row) => ({ ...row, label: row.site }))}
              title={t("reseller.overview.top.sites")}
              hint={t("reseller.overview.bySite.description")}
            />
          ) : null}
        </div>
      </section>

      <RecentTransactions
        attentionCount={o.ordersNeedingReview}
        focusReview={focusReview}
        refresh={refresh}
      />

      <section
        id="network"
        aria-labelledby="network-title"
        className="scroll-mt-20 space-y-4"
      >
        <h2 className="text-xl font-bold tracking-tight" id="network-title">
          {t("reseller.overview.network")}
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <NetworkSites
            className="xl:col-span-7"
            devices={o.deviceCount}
            packages={o.packageCount}
            pendingClaims={o.pendingClaims}
            sites={sites}
          />
          <div className="xl:col-span-5">
            <ResellerUsageCard />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Attention
 * ───────────────────────────────────────────────────────────────────────── */

type Alert = {
  id: string;
  title: string;
  hint: string;
  href: string;
  count?: number;
  tone: "warning" | "danger" | "accent";
  icon: ReactNode;
  onOpen?: () => void;
};

function buildAlerts(
  o: ResellerOverview,
  t: I18n["t"],
  sites: ScopedSite[],
): Alert[] {
  const alerts: Alert[] = [];
  const sub = o.subscription;

  if (sub.state === "EXPIRED" || sub.state === "PAST_DUE") {
    alerts.push({
      id: "expired",
      title: t("reseller.overview.attention.expired"),
      hint: t("reseller.overview.attention.expiredHint"),
      href: "/reseller/subscription",
      tone: "danger",
      icon: <TriangleAlert />,
    });
  } else if (
    sub.daysRemaining !== null &&
    sub.daysRemaining <= 7 &&
    sub.state !== "NONE"
  ) {
    const days = Math.max(sub.daysRemaining, 0);
    alerts.push({
      id: "expiring",
      title:
        days === 1
          ? t("reseller.overview.attention.expiringOne")
          : t("reseller.overview.attention.expiring", { days }),
      hint: t("reseller.overview.attention.expiringHint"),
      href: "/reseller/subscription",
      tone: "warning",
      icon: <Clock />,
    });
  }

  if (o.ordersNeedingReview > 0) {
    alerts.push({
      id: "orders",
      title: t("reseller.overview.attention.orders"),
      hint: t("reseller.overview.attention.ordersHint"),
      href: "#transactions",
      count: o.ordersNeedingReview,
      tone: "warning",
      icon: <CircleAlert />,
    });
  }

  if (o.pendingClaims > 0) {
    alerts.push({
      id: "claims",
      title: t("reseller.overview.attention.claims"),
      hint: t("reseller.overview.attention.claimsHint"),
      href: "/reseller/devices",
      count: o.pendingClaims,
      tone: "accent",
      icon: <Router />,
    });
  }

  const brokenSites = sites.filter(
    (site) => site.state === "FAILED" || site.state === "NEEDS_REVIEW",
  ).length;
  if (brokenSites > 0) {
    alerts.push({
      id: "sites",
      title: t("reseller.overview.attention.sites", { count: brokenSites }),
      hint: t("reseller.overview.attention.sitesHint"),
      href: "/reseller/sites",
      tone: "danger",
      icon: <Wifi />,
    });
  }

  if (o.reseller.status !== "ACTIVE") {
    alerts.push({
      id: "account",
      title: t("reseller.overview.attention.account"),
      hint: t("reseller.overview.attention.accountHint"),
      href:
        o.reseller.status === "PENDING_VERIFICATION"
          ? "/verify"
          : "/reseller/support",
      tone: "warning",
      icon: <ShieldCheck />,
    });
  }

  return alerts;
}

function AttentionCard({
  alerts,
  onReviewOrders,
}: {
  alerts: Alert[];
  onReviewOrders: () => void;
}) {
  const { t } = useI18n();
  const tones: Record<Alert["tone"], string> = {
    danger: "bg-advo-danger-soft text-[#b91c1c]",
    warning: "bg-advo-warning-soft text-[#b45309]",
    accent: "bg-advo-blue-soft text-advo-blue",
  };

  return (
    <section className={`${card} p-4 sm:p-5`} aria-labelledby="attention-title">
      <SectionHeader
        action={
          <span className="rounded-full bg-advo-warning-soft px-2.5 py-1 text-[11px] font-bold text-[#b45309] tabular-nums">
            {alerts.length}
          </span>
        }
        description={t("reseller.overview.attention.subtitle")}
        icon={<CircleAlert />}
        iconTone="warning"
        title={
          <span id="attention-title">
            {t("reseller.overview.attention.title")}
          </span>
        }
      />
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {alerts.map((alert) => (
          <a
            className="group flex min-w-0 items-start gap-3 rounded-xl border border-advo-border bg-advo-page/60 p-3 transition hover:border-advo-gold/60 hover:bg-advo-card"
            href={alert.href}
            key={alert.id}
            onClick={alert.id === "orders" ? onReviewOrders : undefined}
          >
            <span
              aria-hidden="true"
              className={`grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4 ${tones[alert.tone]}`}
            >
              {alert.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="min-w-0 text-sm font-bold break-words">
                  {alert.title}
                </span>
                {alert.count ? (
                  <span className="shrink-0 rounded bg-advo-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-[#b45309] tabular-nums">
                    {alert.count}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-advo-muted">
                {alert.hint}
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="mt-2 size-4 shrink-0 text-advo-muted transition group-hover:translate-x-0.5 group-hover:text-advo-gold"
            />
          </a>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Plan card
 * ───────────────────────────────────────────────────────────────────────── */

function subscriptionTone(
  state: string,
): "success" | "warning" | "danger" | "default" {
  if (state === "ACTIVE" || state === "TRIALING") return "success";
  if (state === "PAST_DUE" || state === "EXPIRED") return "danger";
  if (state === "SUSPENDED" || state === "CANCELLED") return "warning";
  return "default";
}

function PlanCard({
  subscription: sub,
  className = "",
}: {
  subscription: Subscription;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const dateLocale = LOCALE_META[locale].intlLocale;
  const hasPlan = sub.state !== "NONE" && sub.plan !== null;
  const days = sub.daysRemaining ?? 0;
  const ended =
    sub.state === "PAST_DUE" ||
    sub.state === "EXPIRED" ||
    (hasPlan && days <= 0);
  const expiringSoon = hasPlan && !ended && days <= 7;
  const ringColor = ended ? "#fb7185" : expiringSoon ? "#fbbf24" : "#f8ba56";
  const typeLabel =
    sub.planType === "PARTNER"
      ? t("reseller.overview.plan.partner")
      : sub.planType === "INDEPENDENT"
        ? t("reseller.overview.plan.independent")
        : null;

  const periodLine = (() => {
    if (!sub.currentPeriodEnd) return t("reseller.subscription.notScheduled");
    const date = formatDateTime(sub.currentPeriodEnd, dateLocale);
    if (ended) return t("reseller.overview.plan.endedOn", { date });
    if (sub.state === "TRIALING")
      return t("reseller.overview.plan.trialEnds", { date });
    return t("reseller.overview.plan.renews", { date });
  })();

  return (
    <article
      className={`relative isolate flex h-full flex-col overflow-hidden rounded-card border border-[#24384f] bg-[#111c29] p-5 text-white shadow-advo-card ${className}`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#2d4a68_0%,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,#ffffff14_1px,transparent_1.5px)] bg-size-[22px_22px] [mask-image:linear-gradient(to_left,black,transparent_58%)]"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.14em] text-white/55 uppercase">
            {t("reseller.overview.plan.title")}
          </p>
          <h2 className="mt-1 truncate text-lg font-black tracking-tight sm:text-xl">
            {hasPlan ? sub.plan : t("reseller.subscription.noPlan")}
          </h2>
          <p className="mt-1 text-xs text-white/60">
            {hasPlan && sub.priceTzs
              ? `${sub.priceFrom ? `${t("reseller.subscription.catalog.from")} ` : ""}${formatTzs(sub.priceTzs)} ${t("reseller.subscription.catalog.perMonth")}`
              : t("reseller.subscription.noPlanHint")}
          </p>
        </div>
        <StatusChip tone={subscriptionTone(sub.state)}>
          {subscriptionStateLabel(t, sub.state)}
        </StatusChip>
      </div>

      <div className="mt-4 flex items-center gap-4">
        {hasPlan ? (
          <DaysRing
            color={ringColor}
            days={Math.max(days, 0)}
            label={
              ended
                ? t("reseller.overview.plan.expiredLabel")
                : t("reseller.overview.plan.daysLabel")
            }
            total={sub.periodDays ?? 30}
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-[92px] shrink-0 place-items-center rounded-full border border-white/12 bg-white/5 text-[#f8ba56]"
          >
            <CreditCard className="size-8" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {hasPlan
              ? ended
                ? t("reseller.overview.attention.expired")
                : remainingDaysLabel(t, Math.max(days, 0))
              : t("reseller.overview.plan.choose")}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{periodLine}</span>
          </p>
          {typeLabel ? (
            <span className="mt-1.5 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">
              {typeLabel}
            </span>
          ) : null}
          {expiringSoon ? (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#fbbf24]/15 px-2 py-0.5 text-[10px] font-bold text-[#fbbf24]">
              <Clock aria-hidden="true" className="size-3" />
              {t("reseller.overview.plan.expiringSoon")}
            </span>
          ) : null}
        </div>
      </div>

      {hasPlan && sub.limits && sub.usage ? (
        <div className="mt-5">
          <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">
            {t("reseller.overview.plan.capacity")}
          </p>
          <div className="grid grid-cols-1 gap-2.5 min-[430px]:grid-cols-3">
            <Capacity
              label={t("reseller.subscription.plans.sites")}
              limit={sub.limits.sites}
              used={sub.usage.sites}
            />
            <Capacity
              label={t("reseller.subscription.plans.devices")}
              limit={sub.limits.devices}
              used={sub.usage.devices}
            />
            {sub.limits.packagesTotal !== null ? (
              <Capacity
                label={t("reseller.subscription.plans.packages")}
                limit={sub.limits.packagesTotal}
                used={sub.usage.packagesTotal}
              />
            ) : (
              <Capacity
                label={t("reseller.overview.plan.packagesPerSite")}
                limit={sub.limits.packagesPerSite}
                used={sub.usage.packagesPerSite}
              />
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-auto pt-4">
        <p className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-white/55">
          <span>{t("reseller.overview.plan.lastPayment")}</span>
          <span className="font-semibold text-white/85">
            {sub.lastInvoice
              ? `${formatTzs(sub.lastInvoice.amountTzs)} · ${formatDateTime(sub.lastInvoice.paidAt ?? sub.lastInvoice.periodEnd, dateLocale)}`
              : t("reseller.overview.plan.noPayment")}
          </span>
        </p>
        <Link
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#f8ba56] px-4 text-sm font-bold text-[#261804] transition hover:bg-[#ffd18b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f8ba56]"
          href="/reseller/subscription"
        >
          {hasPlan
            ? ended
              ? t("reseller.subscription.notice.renew")
              : t("reseller.overview.plan.manage")
            : t("reseller.overview.plan.choose")}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}

function DaysRing({
  days,
  total,
  color,
  label,
}: {
  days: number;
  total: number;
  color: string;
  label: string;
}) {
  const size = 92;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = clamp(total > 0 ? days / total : 0, 0, 1);

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ height: size, width: size }}
    >
      <svg aria-hidden="true" className="-rotate-90" height={size} width={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="rgba(255,255,255,0.13)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={stroke}
        />
      </svg>
      <div className="absolute text-center">
        <span className="block text-2xl leading-none font-black tabular-nums">
          {days}
        </span>
        <span className="mt-1 block text-[9px] font-bold tracking-wider text-white/55 uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}

function Capacity({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const { t } = useI18n();
  const unlimited = limit === null;
  const over = !unlimited && used > limit;
  const percent = unlimited
    ? 100
    : clamp((used / Math.max(limit, 1)) * 100, 0, 100);

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-medium text-white/55">
          {label}
        </span>
        <span
          className={`shrink-0 text-[11px] font-bold tabular-nums ${over ? "text-rose-300" : "text-white"}`}
        >
          {meteredValue(used, limit, t)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${over ? "bg-rose-400" : "bg-[#f8ba56]"}`}
          style={{ opacity: unlimited ? 0.3 : 1, width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Sales trend
 * ───────────────────────────────────────────────────────────────────────── */

function SalesTrendCard({
  data,
  className = "",
}: {
  data: ResellerOverview;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<7 | 14>(14);
  const rows = data.salesDaily.slice(-days);
  const total = periodSum(rows);
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  const previous = periodSum(data.salesDaily.slice(-14, -7));
  const delta =
    days === 7 ? percentChange(Number(total), Number(previous)) : null;
  const trend = rows.map((row) => ({
    day: row.day,
    amount: Number(row.amountTzs),
    count: row.count,
  }));
  const dayFormat = new Intl.DateTimeFormat(LOCALE_META[locale].intlLocale, {
    day: "numeric",
    month: "short",
    timeZone: BUSINESS_TIMEZONE,
  });
  const first = rows[0];
  const last = rows.at(-1);
  const day = (key: string) =>
    dayFormat.format(new Date(`${key}T12:00:00+03:00`));

  return (
    <ChartCard
      action={
        <div
          aria-label={t("reseller.overview.salesPeriod")}
          className="inline-flex rounded-xl border border-advo-border bg-advo-page p-1"
          role="group"
        >
          {([7, 14] as const).map((period) => (
            <button
              aria-pressed={days === period}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-advo-muted transition hover:text-advo-text aria-pressed:bg-advo-card aria-pressed:text-advo-text aria-pressed:shadow-advo-field"
              key={period}
              onClick={() => setDays(period)}
              type="button"
            >
              {t("reseller.overview.shortDays", { count: period })}
            </button>
          ))}
        </div>
      }
      className={className}
      description={t("reseller.overview.paidRevenue")}
      title={t("reseller.overview.trend.title")}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div>
          <p className="text-2xl font-black tracking-tight tabular-nums sm:text-3xl">
            {formatTzs(total)}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-advo-muted">
            <span>{t("reseller.overview.paidTransactions", { count })}</span>
            {delta !== null ? (
              <DeltaBadge value={delta} label={t("reseller.vsLastWeek")} />
            ) : null}
          </div>
        </div>
        {first && last ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-advo-muted">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {day(first.day)} – {day(last.day)}
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        <TrendChart color={CHART_COLORS.gold} data={trend} height={200} />
      </div>
    </ChartCard>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Mix + rankings
 * ───────────────────────────────────────────────────────────────────────── */

const paymentColors: Record<string, string> = {
  PAID: "#10b981",
  OVERPAID: "#0ea5e9",
  UNPAID: "#94a3b8",
  NEEDS_REVIEW: "#f59e0b",
  REFUND_PENDING: "#8b5cf6",
  REFUNDED: "#f43f5e",
  CANCELLED: "#94a3b8",
};

function MixCard({ data }: { data: ResellerOverview }) {
  const { t } = useI18n();
  const total = data.paymentMix.reduce((sum, group) => sum + group.count, 0);
  const slices = data.paymentMix.map((group) => ({
    label: paymentStateLabel(t, group.state),
    value: group.count,
    color: paymentColors[group.state] ?? "#94a3b8",
  }));

  return (
    <ChartCard
      action={
        <span className="rounded-full bg-advo-surface-soft px-2.5 py-1 text-[11px] font-bold text-advo-muted tabular-nums">
          {total.toLocaleString()}
        </span>
      }
      className="h-full"
      description={t("reseller.overview.mix.description")}
      title={t("reseller.overview.mix.title")}
    >
      <MixDonut
        centerLabel={t("reseller.overview.mix.centerLabel")}
        centerValue={String(total)}
        data={slices}
        height={172}
      />
      <p className="mt-3 flex items-baseline justify-between gap-2 border-t border-advo-border pt-3 text-xs text-advo-muted">
        {t("reseller.overview.mix.collected")}
        <strong className="text-sm whitespace-nowrap text-advo-text tabular-nums">
          {formatTzs(data.salesAllTime.amountTzs)}
        </strong>
      </p>
    </ChartCard>
  );
}

function RankingCard({
  title,
  hint,
  rows,
  className = "",
}: {
  title: string;
  hint: string;
  rows: Array<Sales & { id: string | null; label: string }>;
  className?: string;
}) {
  const { t } = useI18n();
  const max = rows[0]?.amountTzs ?? "0";

  return (
    <section className={`${card} flex h-full flex-col p-4 sm:p-5 ${className}`}>
      <SectionHeader
        action={
          <span className="shrink-0 text-[11px] font-semibold text-advo-muted">
            {t("reseller.overview.allTime")}
          </span>
        }
        description={hint}
        icon={<ArrowUpRight />}
        iconTone="gold"
        title={title}
      />
      {rows.length ? (
        <ul className="mt-4 space-y-3.5">
          {rows.map((row, index) => (
            <li key={row.id ?? `row-${index}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 text-sm font-semibold break-words">
                  {row.label}
                </span>
                <span className="text-xs whitespace-nowrap text-advo-muted tabular-nums">
                  {formatTzs(row.amountTzs)}
                  <span className="ml-1.5 opacity-70">
                    ·{" "}
                    {t("reseller.overview.paidTransactions", {
                      count: row.count,
                    })}
                  </span>
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-advo-track"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#fba102] to-[#f16304]"
                  style={{
                    width: `${Number(max) > 0 ? (Number(row.amountTzs) / Number(max)) * 100 : 0}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-advo-page px-3 py-6 text-center text-sm text-advo-muted">
          {t("reseller.overview.rankings.empty")}
        </p>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Setup checklist
 * ───────────────────────────────────────────────────────────────────────── */

function SetupChecklist({
  data,
  hasPlan,
}: {
  data: ResellerOverview;
  hasPlan: boolean;
}) {
  const { t } = useI18n();
  const steps = [
    {
      done: hasPlan,
      label: t("reseller.overview.step.plan"),
      href: "/reseller/subscription",
    },
    {
      done: data.totals.sites > 0,
      label: t("reseller.overview.step.site"),
      href: "/reseller/sites",
    },
    {
      done: data.totals.devices > 0,
      label: t("reseller.overview.step.device"),
      href: "/reseller/devices",
    },
    {
      done: data.totals.packages > 0,
      label: t("reseller.overview.step.package"),
      href: "/reseller/packages",
    },
  ];
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  if (!next) return null;

  return (
    <section
      aria-labelledby="setup-title"
      className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <SoftIcon tone="gold">
          <Ticket />
        </SoftIcon>
        <div className="min-w-0">
          <h2 className="text-sm font-bold" id="setup-title">
            {t("reseller.overview.checklist.title")}
          </h2>
          <p className="mt-0.5 text-xs text-advo-muted">
            {t("reseller.overview.checklist.progress", {
              done,
              total: steps.length,
            })}
          </p>
        </div>
      </div>
      <div className="hidden flex-1 px-4 sm:block">
        <div className="flex items-center gap-1.5">
          {steps.map((step) => (
            <span
              aria-hidden="true"
              className={`h-1.5 flex-1 rounded-full ${step.done ? "bg-[#f8ba56]" : "bg-advo-track"}`}
              key={step.href}
            />
          ))}
        </div>
      </div>
      <Link className={goldAction} href={next.href}>
        {t("reseller.overview.continueSetup")}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Network
 * ───────────────────────────────────────────────────────────────────────── */

function NetworkSites({
  sites,
  devices,
  packages,
  pendingClaims,
  className = "",
}: {
  sites: ScopedSite[];
  devices: number;
  packages: number;
  pendingClaims: number;
  className?: string;
}) {
  const { t } = useI18n();
  const ready = sites.filter((site) => site.state === "READY").length;
  const sorted = [...sites].sort(
    (a, b) =>
      Number(["FAILED", "NEEDS_REVIEW"].includes(b.state)) -
        Number(["FAILED", "NEEDS_REVIEW"].includes(a.state)) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className={`${card} p-4 sm:p-5 ${className}`}>
      <SectionHeader
        action={
          <Link className={linkAction} href="/reseller/sites">
            {t("reseller.overview.manageSites")}
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        }
        description={t("reseller.overview.sites.description")}
        icon={<Wifi />}
        iconTone="accent"
        title={t("reseller.overview.sites.title")}
      />
      <dl className="mt-4 grid grid-cols-3 divide-x divide-advo-border rounded-xl border border-advo-border bg-advo-page">
        {(
          [
            [
              Wifi,
              "reseller.overview.readySites",
              `${ready} / ${sites.length}`,
            ],
            [Router, "nav.devices", devices],
            [Ticket, "reseller.overview.activePackages", packages],
          ] as const
        ).map(([Icon, label, value]) => (
          <div className="min-w-0 px-2.5 py-3 sm:px-4" key={label}>
            <dt className="flex flex-wrap items-center gap-1.5 text-xs text-advo-muted">
              <Icon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-[#b15f00]"
              />
              {t(label)}
            </dt>
            <dd className="mt-1.5 text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {pendingClaims ? (
        <Link className={`mt-3 ${linkAction}`} href="/reseller/devices">
          <CircleAlert aria-hidden="true" className="size-4" />
          {t("reseller.overview.pendingClaims", { count: pendingClaims })}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
      {sites.length > 0 ? (
        <ul className="mt-3 divide-y divide-advo-border">
          {sorted.slice(0, 4).map((site) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-3 last:pb-0"
              key={site.id}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <MapPin
                  aria-hidden="true"
                  className="size-4 shrink-0 text-advo-muted"
                />
                <span className="text-sm font-semibold break-words">
                  {site.name}
                </span>
                <StatusChip tone={statusTone(site.state)}>
                  {siteStateLabel(t, site.state)}
                </StatusChip>
              </div>
              {site.state === "READY" ? (
                <a
                  className={linkAction}
                  href={`${portalUrl}/${encodeURIComponent(site.slug)}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("reseller.overview.sites.portal")}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 border-t border-advo-border pt-4">
          <p className="text-sm text-advo-muted">
            {t("reseller.overview.sites.empty.title")}
          </p>
          <Link className={`mt-2 ${linkAction}`} href="/reseller/sites">
            {t("reseller.overview.sites.empty.cta")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function siteStateLabel(t: I18n["t"], state: string) {
  const key = `site.state.${state}` as MessageKey;
  const label = t(key);
  return label === key ? state.replace(/_/g, " ").toLowerCase() : label;
}
