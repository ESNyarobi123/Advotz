"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card, Input, Label, Modal } from "@heroui/react";
import { AdvoKpi, AdvoSelect, AdvoTable, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  Banknote,
  CircleCheck,
  Clock,
  Coins,
  CreditCard,
  Hash,
  Info,
  Percent,
  Receipt,
  RefreshCw,
  Search,
  TriangleAlert,
  Webhook,
  Wifi,
} from "lucide-react";
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
                onPick={(next) => setState(state === next ? "" : next)}
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
                onPick={(next) => setProvider(provider === next ? "" : next)}
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
                onPick={(next) => setHookState(hookState === next ? "" : next)}
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

      {/* ── Payment attempts ── */}
      <section>
        <SectionHeader
          description={t("admin.payments.attempts.description")}
          icon={<CreditCard />}
          iconTone="accent"
          title={t("admin.payments.attempts.title")}
        />
        <Card className="mt-3 gap-3 p-3 shadow-advo-card ring-1 ring-advo-border/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-advo-muted" />
              <Input
                aria-label={t("admin.payments.attempts.search")}
                className="pl-9"
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("admin.payments.attempts.search")}
                value={query}
              />
            </div>
            <AdvoSelect
              aria-label={t("admin.payments.attempts.filterState")}
              className="w-auto"
              onChange={(e) => setState(e.target.value)}
              value={state}
            >
              <option value="">{t("admin.payments.attempts.allStates")}</option>
              {ATTEMPT_STATES.map((s) => (
                <option key={s} value={s}>
                  {t(stateLabel(s))}
                </option>
              ))}
            </AdvoSelect>
            <AdvoSelect
              aria-label={t("admin.payments.attempts.filterProvider")}
              className="w-auto"
              onChange={(e) => setProvider(e.target.value)}
              value={provider}
            >
              <option value="">{t("admin.payments.attempts.allProviders")}</option>
              {providerOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </AdvoSelect>
            <span className="ml-auto shrink-0 text-xs font-semibold text-advo-muted tabular-nums">
              {t("admin.payments.attempts.count", { shown: filteredAttempts.length, total: attemptRows.length })}
            </span>
          </div>

          <ResourceView resource={payments}>
            {() => (
              <>
                <AdvoTable
                  empty={t("admin.payments.attempts.empty")}
                  label={t("admin.payments.attempts.title")}
                  rowKey={(p) => p.id}
                  rows={shownAttempts}
                  columns={[
                    {
                      key: "purpose",
                      header: t("admin.payments.attempts.col.purpose"),
                      render: (p) => (
                        <div className="flex min-w-44 items-start gap-2.5">
                          <SoftIcon size="sm" tone={p.order.purpose === "WIFI_PACKAGE" ? "teal" : "violet"}>
                            {p.order.purpose === "WIFI_PACKAGE" ? <Wifi /> : <Receipt />}
                          </SoftIcon>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-advo-text">
                              {p.order.purpose === "WIFI_PACKAGE"
                                ? t("admin.payments.attempts.purpose.guest")
                                : t("admin.payments.attempts.purpose.subscription")}
                            </p>
                            <p className="truncate text-xs text-advo-muted">{p.order.reseller.businessName}</p>
                            {p.order.site?.name ? (
                              <p className="truncate text-[11px] text-advo-muted">{p.order.site.name}</p>
                            ) : null}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "amount",
                      header: t("admin.payments.attempts.col.amount"),
                      render: (p) => (
                        <div className="min-w-40">
                          <p className="text-sm font-bold text-advo-text tabular-nums">
                            {t("admin.payments.attempts.expected", { amount: formatTzs(p.order.amountTzs) })}
                          </p>
                          <p className="mt-0.5 text-xs text-advo-muted tabular-nums">
                            {p.amountReceivedTzs
                              ? t("admin.payments.attempts.received", { amount: formatTzs(p.amountReceivedTzs) })
                              : t("admin.payments.none")}
                          </p>
                          <p className="text-xs tabular-nums">
                            {p.feeTzs !== null ? (
                              <span className="text-advo-muted">
                                {t("admin.payments.attempts.fee", { amount: formatTzs(p.feeTzs) })}
                              </span>
                            ) : needsSettlement(p) ? (
                              <span className="font-semibold text-[#b45309]">
                                {t("admin.payments.attempts.feeUnknown")}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "state",
                      header: t("admin.payments.attempts.col.state"),
                      render: (p) => (
                        <div className="min-w-32">
                          <StatusChip tone={CHIP_TONE[p.state] ?? "default"}>{t(stateLabel(p.state))}</StatusChip>
                          {p.lastError ? (
                            <p className="mt-1 max-w-56 text-[11px] leading-snug text-[var(--advo-danger)]">
                              {p.lastError}
                            </p>
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      key: "order",
                      header: t("admin.payments.attempts.col.order"),
                      render: (p) => (
                        <div className="flex min-w-32 flex-col items-start gap-1">
                          <StatusChip tone={CHIP_TONE[p.order.paymentState] ?? "default"}>
                            {t(stateLabel(p.order.paymentState))}
                          </StatusChip>
                          <StatusChip>{t(fulfillmentLabel(p.order.fulfillmentState))}</StatusChip>
                        </div>
                      ),
                    },
                    {
                      key: "reference",
                      header: t("admin.payments.attempts.col.reference"),
                      render: (p) => (
                        <div className="min-w-32">
                          <Mono>{p.providerReference ?? t("admin.payments.none")}</Mono>
                          <p className="mt-1 max-w-40 truncate text-[11px] text-advo-muted">{p.provider}</p>
                        </div>
                      ),
                    },
                    {
                      key: "created",
                      header: t("admin.payments.attempts.col.created"),
                      render: (p) => (
                        <div className="min-w-32 text-xs">
                          <p className="text-advo-text">{formatDateTime(p.createdAt)}</p>
                          <p className="mt-0.5 text-[11px] text-advo-muted">
                            {p.lastCheckedAt
                              ? t("admin.payments.attempts.checked", { when: formatDateTime(p.lastCheckedAt) })
                              : t("admin.payments.attempts.neverChecked")}
                          </p>
                        </div>
                      ),
                    },
                    {
                      key: "actions",
                      header: t("admin.payments.attempts.col.actions"),
                      render: (p) => (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {RECONCILABLE.has(p.state) ? (
                            <Button
                              className="text-xs"
                              onPress={() => setReconcileTarget(p)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {t("admin.payments.attempts.action.reconcile")}
                            </Button>
                          ) : null}
                          {needsSettlement(p) ? (
                            <Button
                              className="text-xs"
                              onPress={() => setSettleTarget(p)}
                              size="sm"
                              type="button"
                              variant="primary"
                            >
                              {t("admin.payments.attempts.action.settle")}
                            </Button>
                          ) : null}
                          <Button
                            className="text-xs"
                            onPress={() => setDetail(p)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Info className="size-3.5" />
                            {t("admin.payments.attempts.action.detail")}
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
                {visibleCount < filteredAttempts.length ? (
                  <div className="flex justify-center pt-1">
                    <Button onPress={() => setVisibleCount((n) => n + 25)} size="sm" type="button" variant="outline">
                      {t("admin.payments.attempts.action.showMore")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </ResourceView>
        </Card>
      </section>

      {/* ── Webhook inbox ── */}
      <section>
        <SectionHeader
          description={t("admin.payments.webhooks.description")}
          icon={<Webhook />}
          iconTone="teal"
          title={t("admin.payments.webhooks.title")}
        />
        <Card className="mt-3 gap-3 p-3 shadow-advo-card ring-1 ring-advo-border/70">
          <div className="flex flex-wrap items-center gap-3">
            <AdvoSelect
              aria-label={t("admin.payments.webhooks.filterState")}
              className="w-auto"
              onChange={(e) => setHookState(e.target.value)}
              value={hookState}
            >
              <option value="">{t("admin.payments.webhooks.allStates")}</option>
              {WEBHOOK_STATES.map((s) => (
                <option key={s} value={s}>
                  {t(stateLabel(s))}
                </option>
              ))}
            </AdvoSelect>
            <span className="ml-auto shrink-0 text-xs font-semibold text-advo-muted tabular-nums">
              {t("admin.payments.webhooks.count", {
                shown: shownWebhooks.length,
                total: webhookRows.length,
              })}
            </span>
          </div>

          <ResourceView resource={webhooks}>
            {() => (
              <>
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
                    render: (w) => <span className="text-sm font-bold text-advo-text tabular-nums">{w.attempts}</span>,
                  },
                  {
                    key: "received",
                    header: t("admin.payments.webhooks.col.received"),
                    render: (w) => <span className="text-xs text-advo-text">{formatDateTime(w.receivedAt)}</span>,
                  },
                  {
                    key: "processed",
                    header: t("admin.payments.webhooks.col.processed"),
                    render: (w) => (
                      <span className="text-xs text-advo-muted">
                        {w.processedAt ? formatDateTime(w.processedAt) : t("admin.payments.webhooks.notProcessed")}
                      </span>
                    ),
                  },
                ]}
              />
                {visibleHooks < webhookRows.length ? (
                  <div className="flex justify-center pt-1">
                    <Button onPress={() => setVisibleHooks((n) => n + 15)} size="sm" type="button" variant="outline">
                      {t("admin.payments.attempts.action.showMore")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </ResourceView>
        </Card>
      </section>

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
    <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
      <Hash className="mr-0.5 inline size-2.5 opacity-50" />
      {children}
    </code>
  );
}
