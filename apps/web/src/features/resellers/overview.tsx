"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card, EmptyState, SearchField, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { AdvoKpi, AdvoTable, DeltaBadge, Notice, StatusChip, statusTone } from "@advo/ui";
import {
  CHART_COLORS,
  ChartCard,
  MixDonut,
  TrendChart,
  type MixSlice,
  type TrendPoint,
} from "@/features/common/charts";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { accountStatusLabel, paymentStateLabel, subscriptionStateLabel } from "@/features/common/labels";
import { useI18n } from "@/lib/i18n";
import { useResource } from "@/lib/hooks";
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  LayoutDashboard,
  Printer,
  Radio,
  RefreshCw,
  Sparkles,
  Ticket,
  TrendingUp,
  Wallet,
  Wifi,
} from "lucide-react";

type ResellerOverview = {
  reseller: { businessName: string; status: string; onboardingStep: string; slug: string };
  subscription: { state: string; plan: string | null; currentPeriodEnd: string | null };
  wallet: { availableTzs: string; pendingTzs: string; reservedTzs: string };
  salesToday: { count: number; amountTzs: string };
  salesAllTime: { count: number; amountTzs: string };
  /** Paid sales per Dar day, oldest first. Powers the trend chart and the KPI deltas. */
  salesDaily: Array<{ day: string; count: number; amountTzs: string }>;
  /** Paid sales per site over all orders, biggest first. */
  salesBySite: Array<{ site: string; count: number; amountTzs: string }>;
  /** Paid sales per package over all orders, biggest first. */
  salesByPackage: Array<{ package: string; count: number; amountTzs: string }>;
  /** Order counts per payment state over all orders. */
  paymentMix: Array<{ state: string; count: number; amountTzs: string }>;
  activeGrants: number;
  sites: Array<{ id: string; name: string; state: string; slug: string }>;
  deviceCount: number;
  pendingClaims: number;
  packageCount: number;
  ordersNeedingReview: number;
};

type OrderItem = {
  id: string;
  orderNumber?: string;
  amountTzs: string;
  currency: string;
  paymentState: string;
  fulfillmentState: string;
  paymentMethod?: string;
  createdAt: string;
  priceSnapshot?: { name?: string; durationSeconds?: number } | null;
  customer?: { phone: string; firstName?: string; lastName?: string } | null;
  site?: { name: string } | null;
  grant?: { id: string; state: string; expiresAt: string } | null;
};

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3001";

/** Colour per payment state, used by the mix donut and the state legend. */
const PAYMENT_STATE_COLORS: Record<string, string> = {
  PAID: CHART_COLORS.blue,
  OVERPAID: CHART_COLORS.blueSoft,
  NEEDS_REVIEW: CHART_COLORS.warning,
  REFUND_PENDING: CHART_COLORS.orange,
  UNPAID: CHART_COLORS.neutral,
  CANCELLED: CHART_COLORS.danger,
  REFUNDED: CHART_COLORS.danger,
};

/**
 * Percentage change between two values, or `null` when there is no usable
 * baseline. A jump from zero is shown as "no baseline" rather than as an
 * infinite percentage.
 */
function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** A ranked set of bars: `label`, `count`, formatted `amount`. */
function RankedBars({
  rows,
  emptyText,
  barClassName = "bg-advo-blue",
}: {
  rows: Array<{ key: string; label: string; count: number; amount: string }>;
  emptyText: string;
  barClassName?: string;
}) {
  const max = rows.reduce((highest, row) => Math.max(highest, row.count), 0);
  if (rows.length === 0) {
    return <p className="py-8 text-center text-xs text-advo-muted">{emptyText}</p>;
  }
  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li className="space-y-1.5" key={row.key}>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="truncate font-bold text-advo-text">{row.label}</span>
            <span className="shrink-0 tabular-nums text-advo-muted">
              <span className="font-bold text-advo-text">{row.amount}</span> · {row.count}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-advo-track">
            <div
              className={`h-full rounded-full ${barClassName}`}
              style={{ width: `${max > 0 ? Math.max((row.count / max) * 100, 3) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ResellerOverviewScreen() {
  const overview = useResource<ResellerOverview>("/reseller/overview");
  const orders = useResource<OrderItem[]>("/reseller/orders");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  function handleRefresh() {
    setIsRefreshing(true);
    Promise.all([overview.reload(), orders.reload()]).finally(() => {
      setTimeout(() => setIsRefreshing(false), 600);
    });
  }

  return (
    <ResourceView resource={overview}>
      {(o) => <OverviewBody o={o} orders={orders} searchQuery={searchQuery} setSearchQuery={setSearchQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} isRefreshing={isRefreshing} onRefresh={handleRefresh} />}
    </ResourceView>
  );
}

function OverviewBody({
  o,
  orders,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  isRefreshing,
  onRefresh,
}: {
  o: ResellerOverview;
  orders: ReturnType<typeof useResource<OrderItem[]>>;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const steps = [
    { done: ["ACTIVE", "TRIALING"].includes(o.subscription.state), label: t("reseller.overview.step.plan"), href: "/reseller/subscription" },
    { done: o.sites.length > 0, label: t("reseller.overview.step.site"), href: "/reseller/sites" },
    { done: o.deviceCount > 0, label: t("reseller.overview.step.device"), href: "/reseller/devices" },
    { done: o.packageCount > 0, label: t("reseller.overview.step.package"), href: "/reseller/packages" },
  ];
  const pendingStepsCount = steps.filter((s) => !s.done).length;

  /* ── Derived series ──────────────────────────────────────────────────── */
  const trend: TrendPoint[] = useMemo(
    () => o.salesDaily.map((d) => ({ day: d.day, amount: Number(d.amountTzs), count: d.count })),
    [o.salesDaily],
  );
  const today = trend.at(-1);
  const yesterday = trend.at(-2);
  // The prior 7 days, used for the "this week vs last week" KPI deltas.
  const last7 = trend.slice(-7).reduce((sum, d) => sum + d.amount, 0);
  const prior7 = trend.slice(-14, -7).reduce((sum, d) => sum + d.amount, 0);
  const weekDelta = percentChange(last7, prior7);
  const revenueDelta = today && yesterday ? percentChange(today.amount, yesterday.amount) : null;
  const salesDelta = today && yesterday ? percentChange(today.count, yesterday.count) : null;
  const windowTotal = trend.reduce((sum, d) => sum + d.amount, 0);

  const siteSales = o.salesBySite;
  const packageSales = o.salesByPackage;
  const paymentGroups = o.paymentMix;

  const mixSlices: MixSlice[] = paymentGroups.map((g) => ({
    label: paymentStateLabel(t, g.state),
    value: g.count,
    color: PAYMENT_STATE_COLORS[g.state] ?? CHART_COLORS.neutral,
  }));

  const displayOrders = useMemo(
    () =>
      (orders.data ?? []).slice(0, 12).map((ord) => ({
        key: ord.id,
        id: ord.id.slice(0, 8).toUpperCase(),
        phone: ord.customer?.phone ?? t("reseller.walkIn"),
        name: [ord.customer?.firstName, ord.customer?.lastName].filter(Boolean).join(" ") || null,
        plan: ord.priceSnapshot?.name ?? null,
        site: ord.site?.name ?? "—",
        amountTzs: ord.amountTzs,
        status: ord.paymentState,
        time: formatDateTime(ord.createdAt),
      })),
    [orders.data, t],
  );

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return displayOrders.filter((t) => {
      const matchesQuery =
        query.length === 0 ||
        t.phone.toLowerCase().includes(query) ||
        (t.name ?? "").toLowerCase().includes(query) ||
        t.id.toLowerCase().includes(query) ||
        (t.plan ?? "").toLowerCase().includes(query) ||
        t.site.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "paid" && (t.status === "PAID" || t.status === "OVERPAID")) ||
        (statusFilter === "attention" && !["PAID", "OVERPAID"].includes(t.status));
      return matchesQuery && matchesStatus;
    });
  }, [displayOrders, searchQuery, statusFilter]);

  const sparkRevenue = trend.map((d) => d.amount);
  const sparkSales = trend.map((d) => d.count);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* ── Header ── */}
      <PageHero
        actions={
          <>
            <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/reseller/sites">
              <Wifi className="size-3.5" />
              {t("nav.sites")}
            </Link>
            <Link className={buttonVariants({ size: "sm", variant: "primary" })} href="/reseller/vouchers">
              <Ticket className="size-3.5" />
              {t("nav.vouchers")}
            </Link>
            <Button isIconOnly aria-label={t("common.refresh")} onPress={onRefresh} size="sm" variant="outline">
              <RefreshCw className={isRefreshing ? "size-3.5 animate-spin text-advo-blue" : "size-3.5"} />
            </Button>
            <Button isIconOnly aria-label={t("common.print")} onPress={() => window.print()} size="sm" variant="outline">
              <Printer className="size-3.5" />
            </Button>
          </>
        }
        description={t("reseller.overview.subtitle")}
        eyebrow={t("nav.overview")}
        icon={<LayoutDashboard />}
        iconTone="accent"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-emerald-700 uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              {o.reseller.status === "ACTIVE" ? t("reseller.overview.activePortal") : accountStatusLabel(t, o.reseller.status)}
            </span>
            <StatusChip>{subscriptionStateLabel(t, o.subscription.state)}</StatusChip>
          </>
        }
        title={o.reseller.businessName}
      />

      {/* ── Status alerts ── */}
      {o.reseller.status !== "ACTIVE" ? (
        <Notice tone="warning">
          {t("reseller.overview.accountStatus", { status: accountStatusLabel(t, o.reseller.status) })}{" "}
          {t("reseller.overview.accountStatusNote")}{" "}
          <Link className="font-bold underline" href="/verify">
            {t("reseller.overview.verifyNow")}
          </Link>
        </Notice>
      ) : null}
      {o.subscription.state === "PAST_DUE" ? (
        <Notice tone="warning">
          {t("reseller.overview.pastDue")}{" "}
          <Link className="font-bold underline" href="/reseller/subscription">
            {t("reseller.overview.payNow")}
          </Link>
        </Notice>
      ) : null}
      {o.subscription.state === "EXPIRED" ? (
        <Notice tone="danger">
          {t("reseller.overview.expired")}{" "}
          <Link className="font-bold underline" href="/reseller/subscription">
            {t("reseller.overview.restart")}
          </Link>
        </Notice>
      ) : null}

      {/* ── Setup checklist ── */}
      {pendingStepsCount > 0 ? (
        <Card className="p-5 shadow-advo-card ring-1 ring-advo-border/70">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-advo-text">
                <Sparkles className="size-4 text-advo-gold" />
                {t("reseller.overview.checklist.title")}
              </h2>
              <p className="mt-0.5 text-xs text-advo-muted">{t("reseller.overview.checklist.body")}</p>
            </div>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
              {t("reseller.overview.checklist.progress", {
                done: steps.length - pendingStepsCount,
                total: steps.length,
              })}
            </span>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, i) => (
              <li
                className={`rounded-xl border p-3 transition-colors ${
                  step.done ? "border-advo-border bg-advo-page" : "border-advo-blue/30 bg-white hover:border-advo-blue"
                }`}
                key={step.label}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      step.done ? "bg-emerald-500 text-white" : "bg-advo-track text-advo-muted"
                    }`}
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0">
                    {step.done ? (
                      <span className="block truncate text-xs font-medium text-advo-muted line-through">{step.label}</span>
                    ) : (
                      <Link className="block truncate text-xs font-bold text-advo-blue hover:underline" href={step.href}>
                        {step.label}
                      </Link>
                    )}
                    <span className="text-[10px] text-advo-muted">
                      {step.done ? t("reseller.overview.step.done") : t("reseller.overview.step.configure")}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi
          delta={<DeltaBadge label={` ${t("reseller.vsYesterday")}`} value={revenueDelta} />}
          hint={t("reseller.overview.kpi.revenueHint", { count: o.salesToday.count })}
          icon={<TrendingUp />}
          iconTone="accent"
          label={t("reseller.overview.kpi.revenueToday")}
          spark={sparkRevenue}
          value={formatTzs(o.salesToday.amountTzs)}
        />
        <AdvoKpi
          action={
            <Link
              className="inline-flex items-center gap-0.5 rounded-full border border-advo-blue/20 bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent transition hover:border-advo-blue/40"
              href="/reseller/wallet"
            >
              {t("reseller.withdraw")}
              <ArrowUpRight className="size-3" />
            </Link>
          }
          hint={t("reseller.overview.kpi.walletHint", { amount: formatTzs(o.wallet.pendingTzs) })}
          icon={<Wallet />}
          iconTone="gold"
          label={t("reseller.overview.kpi.wallet")}
          value={formatTzs(o.wallet.availableTzs)}
        />
        <AdvoKpi
          delta={<DeltaBadge label={` ${t("reseller.vsYesterday")}`} value={salesDelta} />}
          hint={t("reseller.overview.kpi.salesHint", { amount: formatTzs(o.salesAllTime.amountTzs) })}
          icon={<Ticket />}
          iconTone="violet"
          label={t("reseller.overview.kpi.salesToday")}
          spark={sparkSales}
          sparkColor={CHART_COLORS.gold}
          value={o.salesToday.count}
        />
        <AdvoKpi
          hint={t("reseller.overview.kpi.activeUsersHint", { sites: o.sites.length, devices: o.deviceCount })}
          icon={<Radio />}
          iconTone="teal"
          label={t("reseller.overview.kpi.activeUsers")}
          value={o.activeGrants}
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ChartCard
          action={
            <span className="rounded-full bg-advo-page px-2.5 py-1 text-[11px] font-bold text-advo-muted">
              {t("reseller.overview.trend.window", { amount: formatTzs(windowTotal), days: trend.length })}
            </span>
          }
          className="xl:col-span-8"
          description={t("reseller.overview.trend.description")}
          legend={
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-advo-border pt-3 text-[11px] text-advo-muted">
              <span>{t("reseller.overview.trend.last7")}</span>
              <span className="flex items-center gap-2">
                <span className="font-bold text-advo-text">{formatTzs(last7)}</span>
                <DeltaBadge label={` ${t("reseller.vsLastWeek")}`} value={weekDelta} />
              </span>
            </div>
          }
          title={t("reseller.overview.trend.title")}
        >
          <TrendChart data={trend} />
        </ChartCard>

        <ChartCard
          className="xl:col-span-4"
          description={t("reseller.overview.mix.description")}
          title={t("reseller.overview.mix.title")}
        >
          <MixDonut
            centerLabel={t("reseller.overview.mix.centerLabel")}
            centerValue={String(paymentGroups.reduce((n, g) => n + g.count, 0))}
            data={mixSlices}
          />
          {o.ordersNeedingReview > 0 ? (
            <p className="mt-4 flex items-center justify-between border-t border-advo-border pt-3 text-[11px] text-advo-muted">
              <span>{t("reseller.overview.mix.needsReview")}</span>
              <Link className="font-bold text-advo-blue hover:underline" href="/reseller/orders">
                {o.ordersNeedingReview} →
              </Link>
            </p>
          ) : null}
        </ChartCard>
      </div>

      {/* ── Rankings ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          description={t("reseller.overview.bySite.description")}
          title={t("reseller.overview.bySite.title")}
        >
          <RankedBars
            emptyText={t("reseller.overview.rankings.empty")}
            rows={siteSales.map((s) => ({
              key: s.site,
              label: s.site,
              count: s.count,
              amount: formatTzs(s.amountTzs),
            }))}
          />
        </ChartCard>

        <ChartCard
          description={t("reseller.overview.byPackage.description")}
          title={t("reseller.overview.byPackage.title")}
        >
          <RankedBars
            barClassName="bg-gradient-to-r from-advo-blue to-advo-gold"
            emptyText={t("reseller.overview.rankings.empty")}
            rows={packageSales.map((s) => ({
              key: s.package,
              label: s.package,
              count: s.count,
              amount: formatTzs(s.amountTzs),
            }))}
          />
        </ChartCard>
      </div>

      {/* ── Recent transactions ── */}
      <ResourceView resource={orders}>
        {() => (
          <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-advo-text">{t("reseller.overview.recent.title")}</h2>
                <span className="rounded-full bg-advo-page px-2 py-0.5 text-xs font-bold text-advo-muted">
                  {filteredOrders.length}
                </span>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <ToggleButtonGroup
                  isDetached
                  onSelectionChange={(keys) => {
                    const next = [...keys][0];
                    if (typeof next === "string") setStatusFilter(next);
                  }}
                  selectedKeys={[statusFilter]}
                  selectionMode="single"
                  size="sm"
                >
                  <ToggleButton id="all">{t("reseller.filter.all")}</ToggleButton>
                  <ToggleButton id="paid">{t("reseller.filter.paid")}</ToggleButton>
                  <ToggleButton id="attention">{t("reseller.filter.attention")}</ToggleButton>
                </ToggleButtonGroup>

                <SearchField
                  aria-label={t("reseller.search.label")}
                  className="w-full sm:w-72"
                  onChange={setSearchQuery}
                  value={searchQuery}
                >
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder={t("reseller.search.placeholder")} />
                    <SearchField.ClearButton />
                  </SearchField.Group>
                </SearchField>
              </div>
            </div>

            <AdvoTable
              columns={[
                {
                  key: "id",
                  header: t("reseller.col.transaction"),
                  isRowHeader: true,
                  render: (ord) => <span className="font-mono font-bold text-advo-blue">#{ord.id}</span>,
                },
                {
                  key: "customer",
                  header: t("reseller.col.customer"),
                  render: (ord) => (
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-advo-blue to-advo-gold text-[10px] font-bold text-white">
                        {(ord.name ?? ord.phone).charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-advo-text">{ord.name ?? ord.phone}</span>
                        {ord.name ? <span className="block font-mono text-[10px] text-advo-muted">{ord.phone}</span> : null}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "plan",
                  header: t("reseller.col.package"),
                  render: (ord) => <span className="font-medium text-advo-text">{ord.plan ?? "—"}</span>,
                },
                {
                  key: "site",
                  header: t("reseller.col.site"),
                  render: (ord) => <span className="text-advo-muted">{ord.site}</span>,
                },
                { key: "time", header: t("reseller.col.time"), render: (ord) => <span className="text-advo-muted">{ord.time}</span> },
                {
                  key: "amount",
                  header: t("reseller.col.amount"),
                  className: "text-right",
                  render: (ord) => (
                    <span className="font-bold tabular-nums text-advo-text">{formatTzs(ord.amountTzs)}</span>
                  ),
                },
                {
                  key: "status",
                  header: t("reseller.col.status"),
                  render: (ord) => (
                    <StatusChip tone={statusTone(ord.status)}>{paymentStateLabel(t, ord.status)}</StatusChip>
                  ),
                },
              ]}
              empty={t("reseller.overview.recent.empty")}
              label={t("reseller.overview.recent.tableLabel")}
              rowKey={(ord) => ord.key}
              rows={filteredOrders}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-advo-muted">
              <span>
                {t("reseller.overview.recent.showing", { count: Math.min(displayOrders.length, 12) })}
                {filteredOrders.length !== displayOrders.length
                  ? t("reseller.overview.recent.filtered", { count: filteredOrders.length })
                  : ""}
              </span>
              <Link className="flex items-center gap-1 font-bold text-advo-blue hover:text-advo-blue-hover" href="/reseller/orders">
                {t("reseller.overview.recent.viewAll")}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </Card>
        )}
      </ResourceView>

      {/* ── Sites ── */}
      <Card className="space-y-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          action={
            <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/reseller/sites">
              <Wifi className="size-3.5" />
              {t("reseller.overview.sites.register")}
            </Link>
          }
          description={t("reseller.overview.sites.description")}
          icon={<Wifi />}
          iconTone="accent"
          title={t("reseller.overview.sites.title")}
        />

        {o.sites.length === 0 ? (
          <EmptyState className="flex flex-col items-center justify-center gap-2 rounded-lg bg-advo-page py-10 text-center">
            <Wifi className="size-5 text-advo-muted" />
            <span className="text-sm font-semibold text-advo-text">{t("reseller.overview.sites.empty.title")}</span>
            <span className="max-w-sm text-xs text-advo-muted">{t("reseller.overview.sites.empty.body")}</span>
            <Link
              className={`${buttonVariants({ size: "sm", variant: "primary" })} mt-1`}
              href="/reseller/sites"
            >
              {t("reseller.overview.sites.empty.cta")}
            </Link>
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {o.sites.map((site) => (
              <li
                className="space-y-3 rounded-xl border border-advo-border bg-advo-page p-4 transition-colors hover:border-advo-blue/40 hover:bg-white"
                key={site.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <Wifi className="size-3.5" />
                    </span>
                    <span className="truncate text-sm font-bold text-advo-text">{site.name}</span>
                  </div>
                  <StatusChip tone={statusTone(site.state)}>{site.state}</StatusChip>
                </div>
                <div className="flex items-center justify-between border-t border-advo-border pt-2.5 text-xs">
                  <span className="text-[11px] text-advo-muted">{t("reseller.overview.sites.portal")}</span>
                  <a
                    className="inline-flex items-center gap-1 font-bold text-advo-blue hover:underline"
                    href={`${PORTAL_URL}/${site.slug}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="truncate">{site.slug}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-center justify-end gap-1.5 pb-2 text-[11px] text-advo-muted">
        <Download className="size-3" />
        {t("reseller.overview.printHint")}
      </p>
    </div>
  );
}
