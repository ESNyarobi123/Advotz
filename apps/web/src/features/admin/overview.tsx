"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { BUSINESS_TIMEZONE, formatDateTime, formatTzs } from "@advo/api-client";
import { Card } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import {
  AdvoKpi,
  AdvoTable,
  DeltaBadge,
  SoftIcon,
  StatusChip,
  statusTone,
  type IconTone,
} from "@advo/ui";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  Building2,
  CreditCard,
  Cpu,
  Gauge,
  History,
  Receipt,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
  Webhook,
} from "lucide-react";
import {
  CHART_COLORS,
  ChartCard,
  DualAreaChart,
  MixDonut,
  type DualTrendPoint,
  type MixSlice,
} from "@/features/common/charts";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { paymentStateLabel } from "@/features/common/labels";
import { useSessionUser } from "@/features/shell/DashboardShell";
import { useT } from "@/lib/i18n";
import { useResource } from "@/lib/hooks";

/* ─────────────────────────────────────────────────────────────────────────
 * Types — the shapes the admin endpoints return
 * ───────────────────────────────────────────────────────────────────────── */

type AdminOverview = {
  resellers: Record<string, number>;
  activeAgents: number;
  subscriptions: { active: number; trialing: number };
  wifiSalesToday: { count: number; amountTzs: string };
  subscriptionRevenueToday: { count: number; amountTzs: string };
  queues: { pendingDeviceClaims: number; pendingWithdrawals: number; paymentsNeedingReview: number; quarantinedWebhooks: number };
  controllers: Array<{ id: string; name: string; mode: string; healthStatus: string | null; lastHealthAt: string | null }>;
  outbox: { pending: number; dead: number };
};

type AdminOrder = {
  id: string;
  purpose: string;
  amountTzs: string;
  currency: string;
  paymentState: string;
  fulfillmentState: string;
  createdAt: string;
  paidAt: string | null;
  reseller: { businessName: string } | null;
};

type AdminAudit = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
  actor: { email: string; role: string } | null;
};

/* ─────────────────────────────────────────────────────────────────────────
 * Derivation helpers
 * ───────────────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
const TREND_DAYS = 14;

/** Formats an instant as a `YYYY-MM-DD` key in the business time zone (EAT). */
const darDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayKey = (value: string | Date) => darDay.format(typeof value === "string" ? new Date(value) : value);

/** Colour per payment state, shared by the mix donut and its legend. */
const MIX_COLORS: Record<string, string> = {
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
 * baseline. A day with no sales shows "no comparison" rather than a −100%
 * crash, which would read as a real drop.
 */
function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0 || current <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Folds the recent-order window into a stacked daily trend and a payment-state
 * mix. Orders outside the window (the endpoint returns the newest 200) are
 * ignored for the trend but still counted in the mix, so the donut always
 * reflects what the admin can see.
 */
function buildSeries(orders: AdminOrder[], t: ReturnType<typeof useT>) {
  const days: string[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i -= 1) days.push(dayKey(new Date(Date.now() - i * DAY_MS)));

  const buckets = new Map<string, { primary: number; secondary: number }>();
  for (const day of days) buckets.set(day, { primary: 0, secondary: 0 });

  const mixCounts = new Map<string, number>();
  for (const order of orders) {
    mixCounts.set(order.paymentState, (mixCounts.get(order.paymentState) ?? 0) + 1);
    if (order.paymentState !== "PAID" && order.paymentState !== "OVERPAID") continue;
    const bucket = buckets.get(dayKey(order.paidAt ?? order.createdAt));
    if (!bucket) continue;
    const amount = Number(order.amountTzs) || 0;
    if (order.purpose === "PLATFORM_SUBSCRIPTION") bucket.secondary += amount;
    else bucket.primary += amount;
  }

  const trend: DualTrendPoint[] = days.map((day) => ({ day, ...buckets.get(day)! }));
  const guestTotal = trend.reduce((sum, d) => sum + d.primary, 0);
  const subTotal = trend.reduce((sum, d) => sum + d.secondary, 0);
  const today = trend.at(-1);
  const yesterday = trend.at(-2);

  const mix: MixSlice[] = [...mixCounts.entries()]
    .map(([state, count]) => ({ label: paymentStateLabel(t, state), value: count, color: MIX_COLORS[state] ?? CHART_COLORS.neutral }))
    .sort((a, b) => b.value - a.value);

  return {
    trend,
    mix,
    guestTotal,
    subTotal,
    guestDelta: today && yesterday ? percentChange(today.primary, yesterday.primary) : null,
    subDelta: today && yesterday ? percentChange(today.secondary, yesterday.secondary) : null,
    orderCount: orders.length,
  };
}

/** A human-friendly action label from an audit action like `reseller.status.set`. */
function prettyAction(action: string): string {
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Picks an activity icon from the audit action's domain. */
function activityIcon(action: string) {
  if (action.startsWith("payment") || action.startsWith("order")) return <Receipt className="size-3.5" />;
  if (action.startsWith("withdraw")) return <ArrowUpRight className="size-3.5" />;
  if (action.startsWith("device") || action.startsWith("claim") || action.startsWith("network")) return <Cpu className="size-3.5" />;
  if (action.startsWith("reseller")) return <Building2 className="size-3.5" />;
  if (action.startsWith("agent")) return <UserCheck className="size-3.5" />;
  if (action.startsWith("plan") || action.startsWith("subscription")) return <CreditCard className="size-3.5" />;
  return <History className="size-3.5" />;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────────────────────── */

export function AdminOverviewScreen() {
  const overview = useResource<AdminOverview>("/admin/overview");
  const orders = useResource<AdminOrder[]>("/admin/orders");
  const audit = useResource<AdminAudit[]>("/admin/audit");

  return (
    <ResourceView resource={overview}>
      {(o) => <OverviewBody audit={audit.data ?? []} o={o} orders={orders.data ?? []} />}
    </ResourceView>
  );
}

function OverviewBody({ o, orders, audit }: { o: AdminOverview; orders: AdminOrder[]; audit: AdminAudit[] }) {
  const t = useT();
  const me = useSessionUser();

  const series = useMemo(() => buildSeries(orders, t), [orders, t]);

  const queues: Array<{ id: string; count: number; href: string; label: string; hint: string; icon: ReactNode; tone: IconTone }> = [
    {
      id: "claims",
      count: o.queues.pendingDeviceClaims,
      href: "/admin/network",
      label: t("admin.overview.attention.claims"),
      hint: t("admin.overview.attention.claimsHint"),
      icon: <Cpu />,
      tone: "warning",
    },
    {
      id: "withdrawals",
      count: o.queues.pendingWithdrawals,
      href: "/admin/withdrawals",
      label: t("admin.overview.attention.withdrawals"),
      hint: t("admin.overview.attention.withdrawalsHint"),
      icon: <ArrowUpRight />,
      tone: "accent",
    },
    {
      id: "payments",
      count: o.queues.paymentsNeedingReview,
      href: "/admin/payments",
      label: t("admin.overview.attention.payments"),
      hint: t("admin.overview.attention.paymentsHint"),
      icon: <Receipt />,
      tone: "danger",
    },
    {
      id: "webhooks",
      count: o.queues.quarantinedWebhooks,
      href: "/admin/payments",
      label: t("admin.overview.attention.webhooks"),
      hint: t("admin.overview.attention.webhooksHint"),
      icon: <Webhook />,
      tone: "danger",
    },
    {
      id: "dead",
      count: o.outbox.dead,
      href: "/admin/operations",
      label: t("admin.overview.attention.dead"),
      hint: t("admin.overview.attention.deadHint"),
      icon: <TriangleAlert />,
      tone: "danger",
    },
  ];
  const attentionTotal = queues.reduce((sum, q) => sum + q.count, 0);
  const healthy = attentionTotal === 0;

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12
      ? t("admin.overview.greeting.morning")
      : hour < 17
        ? t("admin.overview.greeting.afternoon")
        : t("admin.overview.greeting.evening");
  const firstName = (me.name ?? "").trim().split(/\s+/)[0];
  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const recentOrders = orders.slice(0, 8);
  const recentActivity = audit.slice(0, 7);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      {/* ── Hero header ── */}
      <PageHero
        actions={
          <>
            <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/admin/payments">
              <Receipt className="size-3.5" />
              {t("admin.overview.action.reviewPayments")}
            </Link>
            <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/admin/controllers">
              <Gauge className="size-3.5" />
              {t("admin.overview.action.controllers")}
            </Link>
            <Link className={buttonVariants({ size: "sm", variant: "primary" })} href="/admin/operations">
              <Activity className="size-3.5" />
              {t("admin.overview.action.operations")}
            </Link>
          </>
        }
        description={t("admin.overview.subtitle")}
        eyebrow={today}
        icon={<ShieldAlert />}
        iconTone="accent"
        meta={
          <>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                healthy ? "bg-advo-success-soft text-[#166534]" : "bg-advo-warning-soft text-[#b45309]"
              }`}
            >
              <span className={`size-1.5 rounded-full ${healthy ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} />
              {healthy
                ? t("admin.overview.system.healthy")
                : attentionTotal === 1
                  ? t("admin.overview.system.attentionOne")
                  : t("admin.overview.system.attention", { count: attentionTotal })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--advo-border)] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-advo-muted">
              <Activity className="size-3" />
              {t("admin.overview.live")}
            </span>
          </>
        }
        title={`${greeting}, ${firstName}`}
      />

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdvoKpi
          delta={<DeltaBadge label={` ${t("reseller.vsYesterday")}`} value={series.guestDelta} />}
          hint={t("admin.overview.kpi.collectionsHint", { count: o.wifiSalesToday.count })}
          icon={<Banknote />}
          iconTone="accent"
          label={t("admin.overview.kpi.collections")}
          spark={series.trend.map((d) => d.primary)}
          value={formatTzs(o.wifiSalesToday.amountTzs)}
        />
        <AdvoKpi
          delta={<DeltaBadge label={` ${t("reseller.vsYesterday")}`} value={series.subDelta} />}
          hint={t("admin.overview.kpi.subRevenueHint", { count: o.subscriptionRevenueToday.count })}
          icon={<CreditCard />}
          iconTone="gold"
          label={t("admin.overview.kpi.subRevenue")}
          spark={series.trend.map((d) => d.secondary)}
          sparkColor={CHART_COLORS.gold}
          value={formatTzs(o.subscriptionRevenueToday.amountTzs)}
        />
        <AdvoKpi
          hint={t("admin.overview.kpi.resellersHint", {
            suspended: o.resellers.SUSPENDED ?? 0,
            pending: o.resellers.PENDING_VERIFICATION ?? 0,
          })}
          icon={<Building2 />}
          iconTone="violet"
          label={t("admin.overview.kpi.resellers")}
          value={o.resellers.ACTIVE ?? 0}
        />
        <AdvoKpi
          hint={t("admin.overview.kpi.agentsHint")}
          icon={<UserCheck />}
          iconTone="teal"
          label={t("admin.overview.kpi.agents")}
          value={o.activeAgents}
        />
      </div>

      {/* ── Attention queues ── */}
      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          action={
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                healthy ? "bg-advo-success-soft text-[#166534]" : "bg-advo-warning-soft text-[#b45309]"
              }`}
            >
              {healthy ? t("admin.overview.system.healthy") : attentionTotal}
            </span>
          }
          description={t("admin.overview.attention.description")}
          icon={<ShieldAlert />}
          iconTone={healthy ? "success" : "warning"}
          title={t("admin.overview.attention.title")}
        />
        {healthy ? (
          <p className="rounded-xl bg-advo-success-soft px-3 py-2.5 text-xs font-semibold text-[#166534]">
            {t("admin.overview.attention.clear")}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {queues.map((q) => (
            <QueueCard key={q.id} {...q} />
          ))}
        </div>
      </Card>

      {/* ── Revenue trend + payment mix ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ChartCard
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-blue-soft px-2.5 py-1 text-[11px] font-bold text-advo-blue">
                <span className="size-2 rounded-full" style={{ background: CHART_COLORS.blue }} />
                {t("admin.overview.revenue.guest")} · {formatTzs(series.guestTotal)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-advo-gold-soft px-2.5 py-1 text-[11px] font-bold text-[#b15f00]">
                <span className="size-2 rounded-full" style={{ background: CHART_COLORS.gold }} />
                {t("admin.overview.revenue.subscription")} · {formatTzs(series.subTotal)}
              </span>
            </div>
          }
          className="xl:col-span-8"
          description={t("admin.overview.revenue.description", { days: TREND_DAYS })}
          title={t("admin.overview.revenue.title")}
        >
          <DualAreaChart
            data={series.trend}
            primaryLabel={t("admin.overview.revenue.guest")}
            secondaryLabel={t("admin.overview.revenue.subscription")}
          />
        </ChartCard>

        <ChartCard
          className="xl:col-span-4"
          description={t("admin.overview.mix.description")}
          title={t("admin.overview.mix.title")}
        >
          <MixDonut
            centerLabel={t("admin.overview.mix.center")}
            centerValue={String(series.orderCount)}
            data={series.mix}
            height={190}
          />
        </ChartCard>
      </div>

      {/* ── Controllers + event processing ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 xl:col-span-7">
          <SectionHeader
            action={
              <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/admin/controllers">
                {t("admin.overview.controllers.add")}
              </Link>
            }
            description={t("admin.overview.controllers.description")}
            icon={<Gauge />}
            iconTone="accent"
            title={t("admin.overview.controllers.title")}
          />
          {o.controllers.length === 0 ? (
            <p className="rounded-xl bg-advo-warning-soft px-3 py-2.5 text-xs font-medium text-[#b45309]">
              {t("admin.overview.controllers.empty")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {o.controllers.map((c) => (
                <li
                  className="flex items-center gap-3 rounded-xl border border-[var(--advo-border)] bg-advo-page/60 p-3"
                  key={c.id}
                >
                  <span className={`size-2.5 shrink-0 rounded-full ${healthDot(c.healthStatus)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-advo-text">{c.name}</p>
                    <p className="truncate text-[11px] text-advo-muted">
                      {c.healthStatus ?? t("admin.overview.controllers.never")}
                    </p>
                  </div>
                  <StatusChip tone={c.mode === "FAKE" ? "warning" : "accent"}>
                    {c.mode === "FAKE" ? t("admin.overview.controllers.simulated") : t("admin.overview.controllers.live")}
                  </StatusChip>
                  <span className="hidden w-40 shrink-0 text-right text-[11px] text-advo-muted sm:block">
                    {formatDateTime(c.lastHealthAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 xl:col-span-5">
          <SectionHeader
            icon={<Activity />}
            iconTone={o.outbox.dead > 0 ? "danger" : "success"}
            title={t("admin.overview.events.title")}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--advo-border)] bg-advo-page/60 p-3.5">
              <p className="text-[11px] font-semibold tracking-wide text-advo-muted uppercase">
                {t("admin.overview.events.pending")}
              </p>
              <p className="mt-1 text-3xl font-black tabular-nums text-advo-text">{o.outbox.pending}</p>
              <p className="mt-1 text-[11px] text-advo-muted">{t("admin.overview.events.pendingHint")}</p>
            </div>
            <div className="rounded-xl border border-[var(--advo-border)] bg-advo-page/60 p-3.5">
              <p className="text-[11px] font-semibold tracking-wide text-advo-muted uppercase">
                {t("admin.overview.events.dead")}
              </p>
              <p className={`mt-1 text-3xl font-black tabular-nums ${o.outbox.dead > 0 ? "text-[#b91c1c]" : "text-advo-text"}`}>
                {o.outbox.dead}
              </p>
              <p className="mt-1 text-[11px] text-advo-muted">{t("admin.overview.events.deadHint")}</p>
            </div>
          </div>
          <Link
            className="flex items-center justify-between rounded-xl bg-advo-surface-soft px-3.5 py-2.5 text-xs font-bold text-advo-blue transition-colors hover:bg-advo-blue-soft"
            href="/admin/operations"
          >
            {t("admin.overview.events.review")}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </Card>
      </div>

      {/* ── Recent activity + recent orders ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 xl:col-span-5">
          <SectionHeader
            description={t("admin.overview.activity.description")}
            icon={<History />}
            iconTone="violet"
            title={t("admin.overview.activity.title")}
          />
          {recentActivity.length === 0 ? (
            <p className="py-6 text-center text-xs text-advo-muted">{t("admin.overview.activity.empty")}</p>
          ) : (
            <ol className="relative space-y-4 border-l border-[var(--advo-border)] pl-5">
              {recentActivity.map((event) => (
                <li className="relative" key={event.id}>
                  <span className="absolute -left-[27px] top-0.5 grid size-4 place-items-center rounded-full bg-white ring-1 ring-[var(--advo-border)]">
                    <span className="size-1.5 rounded-full bg-advo-blue" />
                  </span>
                  <div className="flex items-start gap-2">
                    <SoftIcon size="sm" tone="accent">
                      {activityIcon(event.action)}
                    </SoftIcon>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-advo-text">{prettyAction(event.action)}</p>
                      <p className="truncate text-[11px] text-advo-muted">
                        {event.actor?.email ?? "system"} · {event.targetType}
                      </p>
                      <p className="mt-0.5 text-[10px] text-advo-muted">{formatDateTime(event.createdAt)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 xl:col-span-7">
          <SectionHeader
            action={
              <Link
                className="inline-flex items-center gap-1 text-xs font-bold text-advo-blue hover:text-advo-blue-hover"
                href="/admin/payments"
              >
                {t("admin.overview.orders.viewAll")}
                <ArrowUpRight className="size-3.5" />
              </Link>
            }
            description={t("admin.overview.orders.description")}
            icon={<Receipt />}
            iconTone="gold"
            title={t("admin.overview.orders.title")}
          />
          <AdvoTable
            columns={[
              {
                key: "order",
                header: t("admin.overview.col.order"),
                isRowHeader: true,
                render: (order) => (
                  <span className="font-mono text-xs font-bold text-advo-blue">#{order.id.slice(0, 8).toUpperCase()}</span>
                ),
              },
              {
                key: "reseller",
                header: t("admin.overview.col.reseller"),
                render: (order) => (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-advo-text">
                      {order.reseller?.businessName ?? "—"}
                    </p>
                    <p className="truncate text-[10px] text-advo-muted">
                      {order.purpose === "PLATFORM_SUBSCRIPTION"
                        ? t("admin.overview.purpose.subscription")
                        : t("admin.overview.purpose.wifi")}
                    </p>
                  </div>
                ),
              },
              {
                key: "amount",
                header: t("admin.overview.col.amount"),
                className: "text-right",
                render: (order) => (
                  <span className="font-bold tabular-nums text-advo-text">{formatTzs(order.amountTzs)}</span>
                ),
              },
              {
                key: "status",
                header: t("admin.overview.col.status"),
                render: (order) => (
                  <StatusChip tone={statusTone(order.paymentState)}>
                    {paymentStateLabel(t, order.paymentState)}
                  </StatusChip>
                ),
              },
              {
                key: "time",
                header: t("admin.overview.col.time"),
                render: (order) => <span className="text-xs text-advo-muted">{formatDateTime(order.createdAt)}</span>,
              },
            ]}
            empty={t("admin.overview.orders.empty")}
            label={t("admin.overview.orders.title")}
            rowKey={(order) => order.id}
            rows={recentOrders}
          />
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Small pieces
 * ───────────────────────────────────────────────────────────────────────── */

/** A clickable queue counter: tinted icon, big count, label and hint. */
function QueueCard({
  count,
  href,
  label,
  hint,
  icon,
  tone,
}: {
  count: number;
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  tone: IconTone;
}) {
  const empty = count === 0;
  return (
    <Link
      className={`group flex items-center gap-3 rounded-xl border bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-advo-card ${
        empty ? "border-[var(--advo-border)] opacity-70 hover:opacity-100" : "border-[var(--advo-border)] hover:border-advo-blue/40"
      }`}
      href={href}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-4 ${
          empty
            ? "bg-advo-surface-soft text-advo-muted"
            : tone === "warning"
              ? "bg-advo-warning-soft text-[#b45309]"
              : tone === "danger"
                ? "bg-advo-danger-soft text-[#b91c1c]"
                : "bg-advo-blue-soft text-advo-blue"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl leading-none font-black tabular-nums text-advo-text">{count}</span>
        <span className="mt-1 block truncate text-[11px] font-semibold tracking-wide text-advo-text uppercase">{label}</span>
        <span className="block truncate text-[10px] text-advo-muted">{hint}</span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-advo-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

/** Colour dot for a controller's last observed health. */
function healthDot(status: string | null): string {
  if (!status) return "bg-slate-300";
  const s = status.toLowerCase();
  if (s.includes("ok") || s.includes("health") || s.includes("up") || s.includes("connect")) return "bg-emerald-500";
  if (s.includes("degrad") || s.includes("slow") || s.includes("warn")) return "bg-amber-500";
  return "bg-rose-500";
}
