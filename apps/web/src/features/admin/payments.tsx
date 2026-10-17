"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BUSINESS_TIMEZONE, formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card, Input, Label, Modal } from "@heroui/react";
import { AdvoKpi, AdvoTable, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  Banknote,
  CircleCheck,
  Clock,
  Coins,
  CreditCard,
  Eye,
  Filter,
  Hash,
  Percent,
  Receipt,
  RefreshCw,
  Search,
  TriangleAlert,
  Webhook,
  Wifi,
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
import {
  CardSkeleton,
  CHIP_TONE,
  DetailRow,
  DetailSection,
  DialogShell,
  DistributionCard,
  HeroChip,
  KpiSkeleton,
  STATE_TONE,
  useUrlFilter,
  type StateTone,
} from "@/features/common/distribution";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey, TranslateVars } from "@advo/i18n";

const TREND_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Formats an instant as a `YYYY-MM-DD` key in the business time zone (EAT). */
const darDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayKey = (value: string | Date) => darDay.format(typeof value === "string" ? new Date(value) : value);

/** Snippe attempt lifecycle colours for the status donut. */
const ATTEMPT_MIX_COLORS: Record<string, string> = {
  CREATED: CHART_COLORS.neutral,
  DISPATCHING: CHART_COLORS.blueSoft,
  PENDING: CHART_COLORS.blue,
  UNKNOWN: CHART_COLORS.warning,
  COMPLETED: CHART_COLORS.success,
  FAILED: CHART_COLORS.danger,
  VOIDED: CHART_COLORS.orange,
  EXPIRED: CHART_COLORS.muted,
  NEEDS_REVIEW: CHART_COLORS.warning,
};

type T = (key: MessageKey, vars?: TranslateVars) => string;

/** `PaymentAttemptState` on the wire. Kept in step with the Prisma enum. */
const ATTEMPT_STATES = [
  "CREATED",
  "DISPATCHING",
  "PENDING",
  "UNKNOWN",
  "COMPLETED",
  "FAILED",
  "VOIDED",
  "EXPIRED",
  "NEEDS_REVIEW",
] as const;

/** `InboxState` on the wire. */
const WEBHOOK_STATES = ["RECEIVED", "PROCESSED", "QUARANTINED", "IGNORED", "FAILED"] as const;

/** `OrderPaymentState` on the wire. */
const ORDER_STATES = ["UNPAID", "PAID", "OVERPAID", "CANCELLED", "REFUND_PENDING", "REFUNDED", "NEEDS_REVIEW"] as const;

type PaymentRow = {
  id: string;
  provider: string;
  providerAccountId: string;
  providerReference: string | null;
  idempotencyKey: string;
  state: string;
  amountReceivedTzs: string | null;
  feeTzs: string | null;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
  lastCheckedAt: string | null;
  expiresAt: string | null;
  order: {
    id: string;
    purpose: string;
    resellerId: string;
    amountTzs: string;
    paymentState: string;
    fulfillmentState: string;
    paidAt: string | null;
    reseller: { businessName: string };
    site: { name: string } | null;
    customer: { phone: string; firstName: string | null; lastName: string | null } | null;
  };
};

type WebhookRow = {
  id: string;
  provider: string;
  providerAccountId: string;
  eventId: string;
  eventType: string;
  state: string;
  reason: string | null;
  attempts: number;
  receivedAt: string;
  processedAt: string | null;
};

/** `GET /admin/payments-summary` — the counts and money behind every tile. */
type PaymentsSummary = {
  attempts: {
    total: number;
    byState: Record<string, number>;
    completed: number;
    open: number;
    unknown: number;
    failed: number;
    expired: number;
    voided: number;
    needsReview: number;
    successRatePct: number;
  };
  collected: { count: number; grossTzs: string; feesTzs: string; netTzs: string };
  settlement: { unsettled: number; unsettledAmountTzs: string; settled: number };
  orders: { total: number; byPaymentState: Record<string, number>; paid: number; unpaid: number; needsReview: number };
  webhooks: {
    total: number;
    byState: Record<string, number>;
    received: number;
    processed: number;
    quarantined: number;
    ignored: number;
    failed: number;
  };
  providers: Array<{ provider: string; count: number; grossTzs: string }>;
  attention: number;
  lastActivityAt: string | null;
};

/** States a reconcile lookup can actually change; anything else is terminal. */
const RECONCILABLE = new Set(["CREATED", "DISPATCHING", "PENDING", "UNKNOWN"]);

/**
 * Reconcile answers with either a short outcome code or the attempt's resulting
 * state. Both are translated so the flash reads as a sentence, never an enum.
 */
const RECONCILE_OUTCOMES = new Set([
  "applied",
  "duplicate",
  "overpaid",
  "ignored",
  "pending",
  "unmatched",
  "mismatch",
  "lookup_failed",
]);

function reconcileOutcome(result: string, t: T): string {
  if (RECONCILE_OUTCOMES.has(result)) return t(`admin.payments.reconcile.result.${result}` as MessageKey);
  if (ATTEMPT_STATES.includes(result as (typeof ATTEMPT_STATES)[number])) return t(stateLabel(result));
  return result;
}

const stateLabel = (state: string) => `admin.payments.state.${state}` as MessageKey;

const fulfillmentLabel = (state: string) => `admin.payments.fulfillment.${state}` as MessageKey;

const orderStateFilter = new Set<string>(ATTEMPT_STATES);
const webhookStateFilter = new Set<string>(WEBHOOK_STATES);

const isPayer = (row: PaymentRow) => {
  const c = row.order.customer;
  if (!c) return null;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return name ? `${name} · ${c.phone}` : c.phone;
};

const needsSettlement = (row: PaymentRow) =>
  row.state === "COMPLETED" && row.order.purpose === "WIFI_PACKAGE" && row.feeTzs === null;

/**
 * URL-backed filter so a filtered view is shareable and survives a reload —
 * the same contract the network and audit screens use.
 */
export function AdminPaymentsScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"attempts" | "webhooks">("attempts");
  const [state, setState] = useUrlFilter("state");
  const [provider, setProvider] = useUrlFilter("provider");
  const [hookState, setHookState] = useUrlFilter("hook");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(25);
  const [visibleHooks, setVisibleHooks] = useState(15);
  const [flash, setFlash] = useState<string | null>(null);
  const [detail, setDetail] = useState<PaymentRow | null>(null);
  const [settleTarget, setSettleTarget] = useState<PaymentRow | null>(null);
  const [reconcileTarget, setReconcileTarget] = useState<PaymentRow | null>(null);

  const summary = useResource<PaymentsSummary>("/admin/payments-summary");

  const attemptsPath = useMemo(() => {
    const q = new URLSearchParams();
    if (state && orderStateFilter.has(state)) q.set("state", state);
    if (provider) q.set("provider", provider);
    return `/admin/payments${q.size ? `?${q}` : ""}`;
  }, [state, provider]);

  const webhooksPath = useMemo(() => {
    const q = new URLSearchParams();
    if (hookState && webhookStateFilter.has(hookState)) q.set("state", hookState);
    if (provider) q.set("provider", provider);
    return `/admin/webhooks${q.size ? `?${q}` : ""}`;
  }, [hookState, provider]);

  const payments = useResource<PaymentRow[]>(attemptsPath);
  const webhooks = useResource<WebhookRow[]>(webhooksPath);

  const stats = summary.data;
  const attemptRows = payments.data ?? [];
  const webhookRows = webhooks.data ?? [];

  // The list endpoint already filtered by state and provider; this narrows the
  // visible rows further by free text without another round-trip.
  const filteredAttempts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return attemptRows;
    return attemptRows.filter((row) =>
      [
        row.providerReference ?? "",
        row.idempotencyKey,
        row.provider,
        row.order.purpose,
        row.order.reseller.businessName,
        row.order.site?.name ?? "",
        row.order.customer?.phone ?? "",
        row.order.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [attemptRows, query]);

  useEffect(() => {
    setVisibleCount(25);
  }, [state, provider, query]);

  useEffect(() => {
    setVisibleHooks(15);
  }, [hookState, provider]);

  const shownAttempts = filteredAttempts.slice(0, visibleCount);
  const shownWebhooks = webhookRows.slice(0, visibleHooks);

  const providerOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of [...(stats?.providers ?? []).map((p) => p.provider), ...attemptRows.map((a) => a.provider)]) {
      if (row) seen.add(row);
    }
    return [...seen].sort();
  }, [stats, attemptRows]);

  const providerVolume = useMemo(
    () => new Map((stats?.providers ?? []).map((p) => [p.provider, p])),
    [stats],
  );

  const attemptCards = useMemo(() => {
    const empty = { attempts: [], orders: [], webhooks: [], providers: [] } as {
      attempts: Array<{ state: string; count: number; label: string; tone: StateTone; meta?: string }>;
      orders: Array<{ state: string; count: number; label: string; tone: StateTone; meta?: string }>;
      webhooks: Array<{ state: string; count: number; label: string; tone: StateTone; meta?: string }>;
      providers: Array<{ state: string; count: number; label: string; tone: StateTone; meta?: string }>;
    };
    if (!stats) return empty;
    const build = (states: readonly string[], byState: Record<string, number>) =>
      states
        .filter((s) => (byState[s] ?? 0) > 0)
        .map((s) => ({ state: s, count: byState[s] ?? 0, label: t(stateLabel(s)), tone: STATE_TONE[s] ?? "neutral" }));

    return {
      attempts: build(ATTEMPT_STATES, stats.attempts.byState),
      orders: build(ORDER_STATES, stats.orders.byPaymentState),
      webhooks: build(WEBHOOK_STATES, stats.webhooks.byState),
      providers: stats.providers.map((p) => ({
        state: p.provider,
        count: p.count,
        label: p.provider,
        tone: "progress" as StateTone,
        meta: Number(p.grossTzs) > 0 ? formatTzs(p.grossTzs) : undefined,
      })),
    };
  }, [stats, t]);

  /** Daily completed revenue (guest vs subscription) + Snippe attempt-state donut. */
  const series = useMemo(() => {
    const days: string[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i -= 1) days.push(dayKey(new Date(Date.now() - i * DAY_MS)));
    const buckets = new Map<string, { primary: number; secondary: number }>();
    for (const day of days) buckets.set(day, { primary: 0, secondary: 0 });

    for (const row of attemptRows) {
      if (row.state !== "COMPLETED") continue;
      const when = row.completedAt ?? row.order.paidAt ?? row.createdAt;
      const bucket = buckets.get(dayKey(when));
      if (!bucket) continue;
      const amount = Number(row.amountReceivedTzs ?? row.order.amountTzs) || 0;
      if (row.order.purpose === "PLATFORM_SUBSCRIPTION") bucket.secondary += amount;
      else bucket.primary += amount;
    }

    const trend: DualTrendPoint[] = days.map((day) => ({ day, ...buckets.get(day)! }));
    const guestTotal = trend.reduce((sum, d) => sum + d.primary, 0);
    const subTotal = trend.reduce((sum, d) => sum + d.secondary, 0);

    const byState = stats?.attempts.byState ?? {};
    const mix: MixSlice[] = ATTEMPT_STATES.filter((s) => (byState[s] ?? 0) > 0)
      .map((s) => ({
        label: t(stateLabel(s)),
        value: byState[s] ?? 0,
        color: ATTEMPT_MIX_COLORS[s] ?? CHART_COLORS.neutral,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      trend,
      mix,
      guestTotal,
      subTotal,
      attemptTotal: stats?.attempts.total ?? attemptRows.length,
    };
  }, [attemptRows, stats, t]);

  async function handleReconciled(result: string) {
    setFlash(t("admin.payments.attempts.reconcileSuccess", { result: reconcileOutcome(result, t) }));
    setReconcileTarget(null);
    await Promise.all([payments.reload(), summary.reload()]);
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button
            isDisabled={summary.loading}
            onPress={() => void Promise.all([summary.reload(), payments.reload(), webhooks.reload()])}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw className={`size-4 ${summary.loading ? "animate-spin" : ""}`} />
            {t("admin.payments.action.refresh")}
          </Button>
        }
        description={t("admin.payments.description")}
        eyebrow={t("admin.payments.eyebrow")}
        icon={<CreditCard />}
        iconTone="gold"
        meta={
          stats ? (
            <>
              <HeroChip icon={<Receipt className="size-3" />}>
                {t("admin.payments.hero.attempts", { count: stats.attempts.total })}
              </HeroChip>
              <HeroChip icon={<Coins className="size-3" />} tone="success">
                {t("admin.payments.hero.collected", { amount: formatTzs(stats.collected.grossTzs) })}
              </HeroChip>
              {stats.attention > 0 ? (
                <HeroChip icon={<TriangleAlert className="size-3" />} tone="danger">
                  {t("admin.payments.hero.review", { count: stats.attention })}
                </HeroChip>
              ) : (
                <HeroChip icon={<CircleCheck className="size-3" />} tone="success">
                  {t("admin.payments.hero.clear")}
                </HeroChip>
              )}
            </>
          ) : null
        }
        title={t("admin.payments.title")}
      />

      {flash ? (
        <Notice tone="success">
          <span className="flex flex-wrap items-center gap-2">
            {flash}
            <button className="font-bold underline" onClick={() => setFlash(null)} type="button">
              ✕
            </button>
          </span>
        </Notice>
      ) : null}

      {/* ── KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats ? (
          <>
            <AdvoKpi
              hint={
                stats.collected.count > 0
                  ? t("admin.payments.kpi.collectedHint", { count: stats.collected.count })
                  : t("admin.payments.kpi.collectedEmpty")
              }
              icon={<Coins />}
              iconTone="success"
              label={t("admin.payments.kpi.collected")}
              value={formatTzs(stats.collected.grossTzs)}
            />
            <AdvoKpi
              hint={
                stats.attempts.total > 0
                  ? t("admin.payments.kpi.successfulHint", {
                      rate: stats.attempts.successRatePct,
                      total: stats.attempts.total,
                    })
                  : t("admin.payments.kpi.successfulHintEmpty")
              }
              icon={<CircleCheck />}
              iconTone="accent"
              label={t("admin.payments.kpi.successful")}
              value={stats.attempts.completed}
            />
            <AdvoKpi
              hint={
                stats.settlement.unsettled > 0
                  ? t("admin.payments.kpi.settlementHint", { amount: formatTzs(stats.settlement.unsettledAmountTzs) })
                  : t("admin.payments.kpi.settlementClear")
              }
              icon={<Clock />}
              iconTone={stats.settlement.unsettled > 0 ? "warning" : "success"}
              label={t("admin.payments.kpi.settlement")}
              value={stats.settlement.unsettled}
            />
            <AdvoKpi
              hint={
                stats.attention > 0
                  ? t("admin.payments.kpi.reviewHint", {
                      review: stats.attempts.needsReview + stats.attempts.unknown,
                      webhooks: stats.webhooks.quarantined + stats.webhooks.failed,
                      unsettled: stats.settlement.unsettled,
                    })
                  : t("admin.payments.kpi.reviewClear")
              }
              icon={<TriangleAlert />}
              iconTone={stats.attention > 0 ? "danger" : "success"}
              label={t("admin.payments.kpi.review")}
              value={stats.attention}
            />
            <AdvoKpi
              hint={
                stats.collected.count > 0
                  ? t("admin.payments.kpi.feesHint", { net: formatTzs(stats.collected.netTzs) })
                  : t("admin.payments.kpi.feesEmpty")
              }
              icon={<Percent />}
              iconTone="gold"
              label={t("admin.payments.kpi.fees")}
              value={formatTzs(stats.collected.feesTzs)}
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <KpiSkeleton key={i} />)
        )}
      </div>

      {/* ── Trends + Snippe status circle ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ChartCard
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1B5EA4]/35 bg-[#1B5EA4]/15 px-2.5 py-1 text-[11px] font-bold text-[#9EC5F0]">
                <span className="size-2 rounded-full" style={{ background: CHART_COLORS.blue }} />
                {t("admin.payments.trend.guest")} · {formatTzs(series.guestTotal)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FBA102]/35 bg-[#FBA102]/15 px-2.5 py-1 text-[11px] font-bold text-[#F5C96A]">
                <span className="size-2 rounded-full" style={{ background: CHART_COLORS.gold }} />
                {t("admin.payments.trend.subscription")} · {formatTzs(series.subTotal)}
              </span>
            </div>
          }
          className="xl:col-span-8"
          description={t("admin.payments.trend.description", { days: TREND_DAYS })}
          title={t("admin.payments.trend.title")}
        >
          <DualAreaChart
            data={series.trend}
            primaryLabel={t("admin.payments.trend.guest")}
            secondaryLabel={t("admin.payments.trend.subscription")}
          />
        </ChartCard>

        <ChartCard
          className="xl:col-span-4"
          description={t("admin.payments.mix.description")}
          title={t("admin.payments.mix.title")}
        >
          <MixDonut
            centerLabel={t("admin.payments.mix.center")}
            centerValue={String(series.attemptTotal)}
            data={series.mix}
            height={190}
          />
        </ChartCard>
      </div>

      {/* ── Distribution box cards ── */}
      <section>
        <SectionHeader
          description={t("admin.payments.distribution.description")}
          icon={<Banknote />}
          iconTone="gold"
          title={t("admin.payments.distribution.title")}
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats ? (
            <>
              <DistributionCard
                empty={t("admin.payments.distribution.empty")}
                hint={t("admin.payments.distribution.attemptsHint")}
                icon={<CreditCard />}
                iconTone={stats.attempts.needsReview > 0 ? "danger" : "accent"}
                onPick={(next) => {
                  setTab("attempts");
                  setState(state === next ? "" : next);
                }}
                pickedState={state}
                rows={attemptCards.attempts}
                title={t("admin.payments.distribution.attempts")}
                totalLabel={t("admin.payments.distribution.total", { count: stats.attempts.total })}
              />
              <DistributionCard
                empty={t("admin.payments.distribution.empty")}
                hint={t("admin.payments.distribution.ordersHint")}
                icon={<Receipt />}
                iconTone={stats.orders.needsReview > 0 ? "warning" : "teal"}
                rows={attemptCards.orders}
                title={t("admin.payments.distribution.orders")}
                totalLabel={t("admin.payments.distribution.total", { count: stats.orders.total })}
              />
              <DistributionCard
                empty={t("admin.payments.distribution.empty")}
                hint={t("admin.payments.distribution.providersHint")}
                icon={<Wifi />}
                iconTone="violet"
                onPick={(next) => {
                  setTab("attempts");
                  setProvider(provider === next ? "" : next);
                }}
                pickedState={provider}
                rows={attemptCards.providers}
                title={t("admin.payments.distribution.providers")}
                totalLabel={t("admin.payments.distribution.total", { count: stats.attempts.total })}
              />
              <DistributionCard
                empty={t("admin.payments.distribution.empty")}
                hint={t("admin.payments.distribution.webhooksHint")}
                icon={<Webhook />}
                iconTone={stats.webhooks.quarantined + stats.webhooks.failed > 0 ? "warning" : "success"}
                onPick={(next) => {
                  setTab("webhooks");
                  setHookState(hookState === next ? "" : next);
                }}
                pickedState={hookState}
                rows={attemptCards.webhooks}
                title={t("admin.payments.distribution.webhooks")}
                totalLabel={t("admin.payments.distribution.total", { count: stats.webhooks.total })}
              />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          )}
        </div>
      </section>

      {/* ── Tabs ── */}
      <div
        className="flex flex-wrap gap-1 rounded-2xl border border-[var(--advo-border)] bg-[var(--advo-surface-sunken)] p-1.5 shadow-advo-card"
        role="tablist"
      >
        {(
          [
            {
              key: "attempts" as const,
              icon: <CreditCard className="size-3.5 shrink-0" />,
              label: t("admin.payments.tab.attempts"),
              count: stats?.attempts.total ?? attemptRows.length,
            },
            {
              key: "webhooks" as const,
              icon: <Webhook className="size-3.5 shrink-0" />,
              label: t("admin.payments.tab.webhooks"),
              count: stats?.webhooks.total ?? webhookRows.length,
            },
          ] as const
        ).map((item) => {
          const active = tab === item.key;
          return (
            <button
              aria-selected={active}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                active
                  ? "bg-[#1B5EA4] text-white shadow-advo-card"
                  : "text-[#E8EAEE] hover:bg-[#2A2D33] hover:text-white"
              }`}
              key={item.key}
              onClick={() => setTab(item.key)}
              role="tab"
              type="button"
            >
              {item.icon}
              {item.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/25 text-white" : "border border-white/15 bg-[#101113] text-[#F4F6F8]"
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "attempts" ? (
        <>
          <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <SectionHeader
              action={
                <span className="rounded-full border border-white/15 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-bold text-[#E8EAEE] tabular-nums">
                  {t("admin.payments.attempts.count", {
                    shown: filteredAttempts.length,
                    total: attemptRows.length,
                  })}
                </span>
              }
              description={t("admin.payments.attempts.description")}
              icon={<Filter />}
              iconTone="accent"
              title={t("admin.payments.attempts.filterTitle")}
            />
            <div className="relative min-w-56">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#8B939E]" />
              <Input
                aria-label={t("admin.payments.attempts.search")}
                className="border border-[var(--advo-border)] !bg-[var(--advo-surface-sunken)] pl-9 !text-[var(--advo-text)]"
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("admin.payments.attempts.search")}
                value={query}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.payments.attempts.filterState")}>
              <FilterPill
                active={!state}
                count={stats?.attempts.total ?? attemptRows.length}
                label={t("admin.payments.attempts.allStates")}
                onClick={() => setState("")}
              />
              {ATTEMPT_STATES.map((s) => (
                <FilterPill
                  active={state === s}
                  count={stats?.attempts.byState[s] ?? 0}
                  key={s}
                  label={t(stateLabel(s))}
                  onClick={() => setState(state === s ? "" : s)}
                />
              ))}
            </div>
            {providerOptions.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.payments.attempts.filterProvider")}>
                <FilterPill
                  active={!provider}
                  count={stats?.attempts.total ?? attemptRows.length}
                  label={t("admin.payments.attempts.allProviders")}
                  onClick={() => setProvider("")}
                />
                {providerOptions.map((p) => (
                  <FilterPill
                    active={provider === p}
                    count={providerVolume.get(p)?.count ?? 0}
                    key={p}
                    label={p}
                    onClick={() => setProvider(provider === p ? "" : p)}
                  />
                ))}
              </div>
            ) : null}
          </Card>

          <ResourceView resource={payments}>
            {() =>
              filteredAttempts.length === 0 ? (
                <Card className="shadow-advo-card ring-1 ring-advo-border/70">
                  <EmptyState text={t("admin.payments.attempts.empty")} />
                </Card>
              ) : (
                <div className="space-y-3">
                  {shownAttempts.map((p) => (
                    <AttemptCard
                      key={p.id}
                      onDetail={() => setDetail(p)}
                      onReconcile={RECONCILABLE.has(p.state) ? () => setReconcileTarget(p) : undefined}
                      onSettle={needsSettlement(p) ? () => setSettleTarget(p) : undefined}
                      payment={p}
                      t={t}
                    />
                  ))}
                  {visibleCount < filteredAttempts.length ? (
                    <div className="flex justify-center pt-1">
                      <Button onPress={() => setVisibleCount((n) => n + 25)} size="sm" type="button" variant="outline">
                        {t("admin.payments.attempts.action.showMore")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            }
          </ResourceView>
        </>
      ) : (
        <>
          <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <SectionHeader
              action={
                <span className="rounded-full border border-white/15 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-bold text-[#E8EAEE] tabular-nums">
                  {t("admin.payments.webhooks.count", {
                    shown: shownWebhooks.length,
                    total: webhookRows.length,
                  })}
                </span>
              }
              description={t("admin.payments.webhooks.description")}
              icon={<Filter />}
              iconTone="teal"
              title={t("admin.payments.webhooks.filterTitle")}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.payments.webhooks.filterState")}>
              <FilterPill
                active={!hookState}
                count={stats?.webhooks.total ?? webhookRows.length}
                label={t("admin.payments.webhooks.allStates")}
                onClick={() => setHookState("")}
              />
              {WEBHOOK_STATES.map((s) => (
                <FilterPill
                  active={hookState === s}
                  count={stats?.webhooks.byState[s] ?? 0}
                  key={s}
                  label={t(stateLabel(s))}
                  onClick={() => setHookState(hookState === s ? "" : s)}
                />
              ))}
            </div>
          </Card>

          <ResourceView resource={webhooks}>
            {() =>
              webhookRows.length === 0 ? (
                <Card className="shadow-advo-card ring-1 ring-advo-border/70">
                  <EmptyState text={t("admin.payments.webhooks.empty")} />
                </Card>
              ) : (
                <>
                  <Card className="gap-0 overflow-hidden p-0 shadow-advo-card ring-1 ring-advo-border/70">
                    <AdvoTable
                      empty={t("admin.payments.webhooks.empty")}
                      label={t("admin.payments.webhooks.title")}
                      rowKey={(w) => w.id}
                      rows={shownWebhooks}
                      columns={[
                        {
                          key: "event",
                          header: t("admin.payments.webhooks.col.event"),
                          render: (w) => (
                            <div className="min-w-44">
                              <Mono>{w.eventType}</Mono>
                              <p className="mt-1 max-w-48 truncate text-[11px] text-advo-muted">{w.eventId}</p>
                            </div>
                          ),
                        },
                        {
                          key: "provider",
                          header: t("admin.payments.webhooks.col.provider"),
                          render: (w) => (
                            <div className="min-w-28 text-xs">
                              <p className="font-semibold text-advo-text">{w.provider}</p>
                              <p className="mt-0.5 truncate text-[11px] text-advo-muted">
                                {t("admin.payments.webhooks.account", { id: w.providerAccountId.slice(0, 8) })}
                              </p>
                            </div>
                          ),
                        },
                        {
                          key: "state",
                          header: t("admin.payments.webhooks.col.state"),
                          render: (w) => (
                            <div className="min-w-32">
                              <StatusChip tone={CHIP_TONE[w.state] ?? "default"}>{t(stateLabel(w.state))}</StatusChip>
                              {w.reason ? (
                                <p className="mt-1 max-w-56 text-[11px] leading-snug text-advo-muted">{w.reason}</p>
                              ) : null}
                            </div>
                          ),
                        },
                        {
                          key: "attempts",
                          header: t("admin.payments.webhooks.col.attempts"),
                          render: (w) => (
                            <span className="text-sm font-bold text-advo-text tabular-nums">{w.attempts}</span>
                          ),
                        },
                        {
                          key: "received",
                          header: t("admin.payments.webhooks.col.received"),
                          render: (w) => (
                            <span className="text-xs text-advo-text">{formatDateTime(w.receivedAt)}</span>
                          ),
                        },
                        {
                          key: "processed",
                          header: t("admin.payments.webhooks.col.processed"),
                          render: (w) => (
                            <span className="text-xs text-advo-muted">
                              {w.processedAt
                                ? formatDateTime(w.processedAt)
                                : t("admin.payments.webhooks.notProcessed")}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </Card>
                  {visibleHooks < webhookRows.length ? (
                    <div className="flex justify-center pt-1">
                      <Button onPress={() => setVisibleHooks((n) => n + 15)} size="sm" type="button" variant="outline">
                        {t("admin.payments.attempts.action.showMore")}
                      </Button>
                    </div>
                  ) : null}
                </>
              )
            }
          </ResourceView>
        </>
      )}

      <PaymentDetailDialog onClose={() => setDetail(null)} open={detail !== null} target={detail} t={t} />

      <ReconcileDialog
        onClose={() => setReconcileTarget(null)}
        onReconciled={handleReconciled}
        open={reconcileTarget !== null}
        target={reconcileTarget}
        t={t}
      />

      <SettleDialog
        onClose={() => setSettleTarget(null)}
        onSettled={async (amount) => {
          setFlash(t("admin.payments.settle.success", { amount }));
          setSettleTarget(null);
          await Promise.all([payments.reload(), summary.reload()]);
        }}
        open={settleTarget !== null}
        target={settleTarget}
        t={t}
      />
    </div>
  );
}

function AttemptCard({
  payment: p,
  t,
  onDetail,
  onReconcile,
  onSettle,
}: {
  payment: PaymentRow;
  t: T;
  onDetail: () => void;
  onReconcile?: () => void;
  onSettle?: () => void;
}) {
  const guest = p.order.purpose === "WIFI_PACKAGE";
  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-advo-card ring-1 ring-advo-border/70">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="sm" tone={guest ? "teal" : "violet"}>
            {guest ? <Wifi /> : <Receipt />}
          </SoftIcon>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[var(--advo-text)]">
                {guest ? t("admin.payments.attempts.purpose.guest") : t("admin.payments.attempts.purpose.subscription")}
              </p>
              <StatusChip tone={CHIP_TONE[p.state] ?? "default"}>{t(stateLabel(p.state))}</StatusChip>
              <StatusChip tone={CHIP_TONE[p.order.paymentState] ?? "default"}>
                {t(stateLabel(p.order.paymentState))}
              </StatusChip>
            </div>
            <p className="truncate text-xs text-[var(--advo-muted)]">
              {p.order.reseller.businessName}
              {p.order.site?.name ? ` · ${p.order.site.name}` : ""}
            </p>
            <p className="text-sm font-bold text-[var(--advo-text)] tabular-nums">
              {formatTzs(p.order.amountTzs)}
              {p.amountReceivedTzs ? (
                <span className="ml-2 text-xs font-semibold text-emerald-300">
                  {t("admin.payments.attempts.received", { amount: formatTzs(p.amountReceivedTzs) })}
                </span>
              ) : null}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--advo-muted)]">
              <span>{p.provider}</span>
              <Mono>{p.providerReference ?? t("admin.payments.none")}</Mono>
              <span>{formatDateTime(p.createdAt)}</span>
            </p>
            {p.lastError ? <p className="text-[11px] leading-snug text-red-300">{p.lastError}</p> : null}
            {needsSettlement(p) ? (
              <p className="text-[11px] font-semibold text-amber-300">{t("admin.payments.attempts.feeUnknown")}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
          <Button className="text-xs" onPress={onDetail} size="sm" type="button" variant="primary">
            <Eye className="size-3.5" />
            {t("admin.payments.attempts.action.detail")}
          </Button>
          {onReconcile ? (
            <Button className="text-xs" onPress={onReconcile} size="sm" type="button" variant="outline">
              {t("admin.payments.attempts.action.reconcile")}
            </Button>
          ) : null}
          {onSettle ? (
            <Button className="text-xs" onPress={onSettle} size="sm" type="button" variant="outline">
              {t("admin.payments.attempts.action.settle")}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
        active
          ? "border-transparent bg-[#1B5EA4] text-white"
          : "border-white/15 bg-[#2A2D33] text-[#E8EAEE] hover:border-[#1B5EA4]/60 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className={`ml-1.5 tabular-nums ${active ? "text-white/85" : "text-white"}`}>{count}</span>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <span className="flex flex-col items-center gap-1.5 py-8">
      <span className="text-sm font-bold text-[var(--advo-text)]">{text}</span>
    </span>
  );
}

function PaymentDetailDialog({
  open,
  onClose,
  target,
  t,
}: {
  open: boolean;
  onClose: () => void;
  target: PaymentRow | null;
  t: T;
}) {
  if (!target) return null;
  const p = target;
  return (
    <DialogShell onClose={onClose} open={open}>
      <Modal.Header>
        <Modal.Heading className="text-base font-black text-advo-text">{t("admin.payments.detail.title")}</Modal.Heading>
        <p className="mt-1 text-xs text-advo-muted">
          {p.order.reseller.businessName} · <Mono>{p.id.slice(0, 8)}</Mono>
        </p>
      </Modal.Header>
      <Modal.Body>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={CHIP_TONE[p.state] ?? "default"}>{t(stateLabel(p.state))}</StatusChip>
            <StatusChip tone={CHIP_TONE[p.order.paymentState] ?? "default"}>
              {t(stateLabel(p.order.paymentState))}
            </StatusChip>
            <span className="text-xs font-bold text-advo-text tabular-nums">{formatTzs(p.order.amountTzs)}</span>
          </div>

          <div>
            <DetailSection>{t("admin.payments.detail.section.identity")}</DetailSection>
            <DetailRow
              label={t("admin.payments.detail.purpose")}
              value={
                p.order.purpose === "WIFI_PACKAGE"
                  ? t("admin.payments.attempts.purpose.guest")
                  : t("admin.payments.attempts.purpose.subscription")
              }
            />
            <DetailRow label={t("admin.payments.detail.reseller")} value={p.order.reseller.businessName} />
            <DetailRow label={t("admin.payments.detail.site")} value={p.order.site?.name ?? t("admin.payments.none")} />
            <DetailRow label={t("admin.payments.detail.payer")} value={isPayer(p) ?? t("admin.payments.none")} />
            <DetailRow label={t("admin.payments.detail.provider")} value={p.provider} />
            <DetailRow
              label={t("admin.payments.detail.reference")}
              value={<Mono>{p.providerReference ?? t("admin.payments.none")}</Mono>}
            />
            <DetailRow label={t("admin.payments.detail.idempotency")} value={<Mono>{p.idempotencyKey}</Mono>} />
            <DetailRow label={t("admin.payments.detail.order")} value={<Mono>{p.order.id}</Mono>} />
          </div>

          <div>
            <DetailSection>{t("admin.payments.detail.section.money")}</DetailSection>
            <DetailRow
              label={t("admin.payments.detail.expected")}
              value={<span className="font-bold tabular-nums">{formatTzs(p.order.amountTzs)}</span>}
            />
            <DetailRow
              label={t("admin.payments.detail.received")}
              value={<span className="tabular-nums">{formatTzs(p.amountReceivedTzs)}</span>}
            />
            <DetailRow
              label={t("admin.payments.detail.fee")}
              value={
                p.feeTzs !== null ? (
                  <span className="tabular-nums">{formatTzs(p.feeTzs)}</span>
                ) : (
                  <StatusChip tone="warning">{t("admin.payments.attempts.feeUnknown")}</StatusChip>
                )
              }
            />
          </div>

          <div>
            <DetailSection>{t("admin.payments.detail.section.timeline")}</DetailSection>
            <DetailRow label={t("admin.payments.detail.state")} value={t(stateLabel(p.state))} />
            <DetailRow
              label={t("admin.payments.detail.orderState")}
              value={t(stateLabel(p.order.paymentState))}
            />
            <DetailRow label={t("admin.payments.detail.fulfillment")} value={t(fulfillmentLabel(p.order.fulfillmentState))} />
            <DetailRow label={t("admin.payments.detail.created")} value={formatDateTime(p.createdAt)} />
            {p.completedAt ? (
              <DetailRow label={t("admin.payments.detail.completed")} value={formatDateTime(p.completedAt)} />
            ) : null}
            {p.order.paidAt ? (
              <DetailRow label={t("admin.payments.detail.paidAt")} value={formatDateTime(p.order.paidAt)} />
            ) : null}
            {p.lastCheckedAt ? (
              <DetailRow label={t("admin.payments.detail.lastChecked")} value={formatDateTime(p.lastCheckedAt)} />
            ) : null}
            {p.expiresAt ? (
              <DetailRow label={t("admin.payments.detail.expires")} value={formatDateTime(p.expiresAt)} />
            ) : null}
          </div>

          {p.lastError ? (
            <div>
              <DetailSection>{t("admin.payments.detail.error")}</DetailSection>
              <Notice tone="danger">{p.lastError}</Notice>
            </div>
          ) : null}

          <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
            <Button onPress={onClose} type="button" variant="outline">
              {t("admin.payments.detail.close")}
            </Button>
          </div>
        </div>
      </Modal.Body>
    </DialogShell>
  );
}

/**
 * Reconciliation is a provider lookup, not a state change: it asks the provider
 * for the real status and lets the normal webhook path apply the answer. The
 * dialog says so, because an operator must never believe it force-pays.
 */
function ReconcileDialog({
  open,
  onClose,
  target,
  t,
  onReconciled,
}: {
  open: boolean;
  onClose: () => void;
  target: PaymentRow | null;
  t: T;
  onReconciled: (result: string) => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  if (!target) return null;

  async function submit() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.post<{ result: string }>(`/admin/payments/${target.id}/reconcile`);
      await onReconciled(res.result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogShell onClose={onClose} open={open}>
      <Modal.Header>
        <Modal.Heading className="text-base font-black text-advo-text">
          {t("admin.payments.reconcile.title")}
        </Modal.Heading>
      </Modal.Header>
      <Modal.Body>
        <div className="space-y-4">
          <p className="text-xs text-advo-muted">{t("admin.payments.reconcile.note")}</p>
          <div className="rounded-card border border-[var(--advo-border)] bg-slate-50 p-3">
            <DetailRow
              label={t("admin.payments.detail.reference")}
              value={<Mono>{target.providerReference ?? target.idempotencyKey}</Mono>}
            />
            <DetailRow label={t("admin.payments.detail.provider")} value={target.provider} />
            <DetailRow
              label={t("admin.payments.detail.state")}
              value={t(stateLabel(target.state))}
            />
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
            <Button isDisabled={pending} onPress={onClose} type="button" variant="outline">
              {t("admin.payments.dialog.cancel")}
            </Button>
            <Button isDisabled={pending} onPress={() => void submit()} type="button" variant="primary">
              {pending ? "…" : t("admin.payments.reconcile.confirm")}
            </Button>
          </div>
        </div>
      </Modal.Body>
    </DialogShell>
  );
}

/**
 * Records the provider fee for a completed WiFi sale whose settlement was
 * unknown. Unlike reconciliation this *does* move money — it releases the
 * reseller's held balance — so it demands a fee and an audited reason.
 */
function SettleDialog({
  open,
  onClose,
  target,
  t,
  onSettled,
}: {
  open: boolean;
  onClose: () => void;
  target: PaymentRow | null;
  t: T;
  onSettled: (amount: string) => void | Promise<void>;
}) {
  const [fee, setFee] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setFee("");
      setReason("");
      setError(null);
      setTooShort(false);
    }
  }, [open]);

  if (!target) return null;

  async function submit() {
    if (!target) return;
    const parsed = Number.parseInt(fee, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(t("admin.payments.settle.feeRequired"));
      return;
    }
    if (reason.trim().length < 3) {
      setTooShort(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post(`/admin/payments/${target.id}/settle`, { feeTzs: parsed, reason: reason.trim() });
      await onSettled(formatTzs(parsed));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogShell onClose={onClose} open={open}>
      <Modal.Header>
        <Modal.Heading className="text-base font-black text-advo-text">{t("admin.payments.settle.title")}</Modal.Heading>
      </Modal.Header>
      <Modal.Body>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="text-xs text-advo-muted">{t("admin.payments.settle.note")}</p>
          <div className="rounded-card border border-[var(--advo-border)] bg-slate-50 p-3">
            <DetailRow
              label={t("admin.payments.detail.expected")}
              value={<span className="font-bold tabular-nums">{formatTzs(target.order.amountTzs)}</span>}
            />
            <DetailRow
              label={t("admin.payments.settle.pendingLabel")}
              value={<span className="tabular-nums">{formatTzs(target.amountReceivedTzs)}</span>}
            />
            <DetailRow
              label={t("admin.payments.detail.reference")}
              value={<Mono>{target.providerReference ?? t("admin.payments.none")}</Mono>}
            />
          </div>

          <div>
            <Label htmlFor="settle-fee">
              {t("admin.payments.settle.feeLabel")}
              <span className="text-[var(--advo-danger)]"> *</span>
            </Label>
            <Input
              id="settle-fee"
              inputMode="numeric"
              min={0}
              onChange={(e) => {
                setFee(e.target.value);
                if (error) setError(null);
              }}
              placeholder="0"
              type="number"
              value={fee}
            />
            <p className="mt-1 text-xs text-advo-muted">{t("admin.payments.settle.feeHint")}</p>
          </div>

          <div>
            <Label htmlFor="settle-reason">
              {t("admin.payments.settle.reasonLabel")}
              <span className="text-[var(--advo-danger)]"> *</span>
            </Label>
            <Input
              id="settle-reason"
              onChange={(e) => {
                setReason(e.target.value);
                if (tooShort && e.target.value.trim().length >= 3) setTooShort(false);
              }}
              placeholder={t("admin.payments.settle.reasonPlaceholder")}
              value={reason}
            />
          </div>

          {tooShort ? <Notice tone="danger">{t("admin.payments.settle.tooShort")}</Notice> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}

          <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
            <Button isDisabled={pending} onPress={onClose} type="button" variant="outline">
              {t("admin.payments.dialog.cancel")}
            </Button>
            <Button isDisabled={pending} type="submit" variant="primary">
              {pending ? "…" : t("admin.payments.settle.confirm")}
            </Button>
          </div>
        </form>
      </Modal.Body>
    </DialogShell>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-white/10 bg-[#101113] px-1.5 py-0.5 font-mono text-xs text-[#E8EAEE]">
      <Hash className="mr-0.5 inline size-2.5 opacity-50" />
      {children}
    </code>
  );
}
