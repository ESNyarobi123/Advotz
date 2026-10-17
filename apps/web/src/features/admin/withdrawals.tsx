"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BUSINESS_TIMEZONE, formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card, Input, Modal } from "@heroui/react";
import { AdvoKpi, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  ArrowLeftRight,
  Ban,
  Banknote,
  Building2,
  CircleCheck,
  Coins,
  Eye,
  Filter,
  HandCoins,
  Hourglass,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  TriangleAlert,
  UserRound,
  Wallet,
  X,
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
  chipToneOf,
  DetailRow,
  DetailSection,
  DialogShell,
  DistributionCard,
  HeroChip,
  KpiSkeleton,
  TONE_BAR,
  toneOf,
  useUrlFilter,
  type StateTone,
} from "@/features/common/distribution";
import { ReasonDialog } from "@/features/common/reason-dialog";
import { api, errorMessage } from "@/lib/api";
import { useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey, TranslateVars } from "@advo/i18n";

const TREND_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const darDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayKey = (value: string | Date) => darDay.format(typeof value === "string" ? new Date(value) : value);

/** Withdrawal request lifecycle colours for the status donut. */
const REQUEST_MIX_COLORS: Record<string, string> = {
  REQUESTED: CHART_COLORS.warning,
  APPROVED: CHART_COLORS.blueSoft,
  PROCESSING: CHART_COLORS.blue,
  UNKNOWN: CHART_COLORS.orange,
  NEEDS_REVIEW: CHART_COLORS.warning,
  COMPLETED: CHART_COLORS.success,
  FAILED: CHART_COLORS.danger,
  REVERSED: CHART_COLORS.orange,
  REJECTED: CHART_COLORS.neutral,
};

type T = (key: MessageKey, vars?: TranslateVars) => string;

/** `WithdrawalState` on the wire. Kept in step with the Prisma enum. */
const REQUEST_STATES = [
  "REQUESTED",
  "APPROVED",
  "PROCESSING",
  "UNKNOWN",
  "COMPLETED",
  "FAILED",
  "REVERSED",
  "REJECTED",
  "NEEDS_REVIEW",
] as const;

/** `PayoutAttemptState` on the wire. */
const ATTEMPT_STATES = ["CREATED", "DISPATCHING", "PENDING", "UNKNOWN", "COMPLETED", "FAILED", "REVERSED"] as const;

const BENEFICIARY_TYPES = ["RESELLER", "AGENT"] as const;

/**
 * Request states where money has left the beneficiary's balance but no payout has
 * settled. Mirrors `RESERVED_STATES` in the API so the tile and the ledger agree.
 */
const RESERVED_STATES = new Set(["REQUESTED", "APPROVED", "PROCESSING", "UNKNOWN", "NEEDS_REVIEW"]);
const RELEASED_STATES = new Set(["FAILED", "REJECTED"]);

/** States a reconcile lookup can still move; anything else is terminal. */
const RECONCILABLE = new Set(["CREATED", "DISPATCHING", "PENDING", "UNKNOWN"]);
const RECONCILE_OUTCOMES = new Set([
  "no_attempt",
  "pending",
  "completed",
  "failed",
  "reversed",
  "needs_review",
  "duplicate",
  "unmatched",
  "ignored",
  "lookup_failed",
]);

const stateLabel = (state: string) => `admin.withdrawals.state.${state}` as MessageKey;
const attemptLabel = (state: string) => `admin.withdrawals.attempt.${state}` as MessageKey;
const beneficiaryLabel = (type: string) => `admin.withdrawals.beneficiary.${type}` as MessageKey;
const allocationLabel = (state: string) => `admin.withdrawals.allocation.${state}` as MessageKey;

type PayoutAttempt = {
  id: string;
  provider: string;
  providerAccountId: string;
  providerReference: string | null;
  idempotencyKey: string;
  state: string;
  feeTzs: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WithdrawalRow = {
  id: string;
  ownerType: string;
  ownerId: string;
  destinationSnapshot: { recipientName?: string; phone?: string };
  amountTzs: string;
  providerFeeTzs: string;
  platformFeeTzs: string;
  totalDebitTzs: string;
  state: string;
  reviewReason: string | null;
  reviewedAt: string | null;
  failureReason: string | null;
  requestIdempotencyKey: string;
  quotedAt: string;
  createdAt: string;
  updatedAt: string;
  attempts: PayoutAttempt[];
  allocations: Array<{ id: string; amountTzs: string; state: string }>;
  destination: { id: string; verifiedAt: string | null; archivedAt: string | null };
  owner: { type: string; name: string; handle: string; status: string; contact: string | null } | null;
};

/** `GET /admin/withdrawals-summary` — the counts and money behind every tile. */
type WithdrawalsSummary = {
  requests: {
    total: number;
    byState: Record<string, number>;
    amountByState: Record<string, string>;
    awaitingDecision: number;
    awaitingAmountTzs: string;
    inFlight: number;
    inFlightAmountTzs: string;
    completed: number;
    completedAmountTzs: string;
    failed: number;
    rejected: number;
    reversed: number;
    needsReview: number;
    averagePayoutTzs: string;
    oldestWaitingAt: string | null;
    oldestWaitingHours: number | null;
  };
  reserve: { heldCount: number; heldTzs: string; releasedCount: number; releasedTzs: string; committedTzs: string };
  money: {
    totalDebitTzs: string;
    paidOutTzs: string;
    providerFeesTzs: string;
    platformFeesTzs: string;
    feeVarianceTzs: string;
    principalSharePct: number;
  };
  beneficiaries: Array<{ ownerType: string; count: number; amountTzs: string; debitTzs: string }>;
  payouts: { total: number; byState: Record<string, number>; open: number; failed: number; reversed: number; stale: number };
  allocations: { total: number; byState: Record<string, number>; amountTzs: string };
  attention: number;
  lastActivityAt: string | null;
};

const PAGE_SIZE = 25;

const latestAttempt = (row: WithdrawalRow) => row.attempts[0] ?? null;

/**
 * The payout destination's own name, but only when it adds information: paying a
 * trusted third party under a different name is the case an operator must spot.
 */
function destinationName(row: WithdrawalRow): string {
  const name = row.destinationSnapshot.recipientName?.trim();
  if (!name) return "";
  return name.toLowerCase() === row.owner?.name?.trim().toLowerCase() ? "" : name;
}

/** Order the request states the way an operator reads them, not the way the enum is declared. */
const ORDERED_REQUEST_STATES = [
  "REQUESTED",
  "APPROVED",
  "PROCESSING",
  "UNKNOWN",
  "NEEDS_REVIEW",
  "COMPLETED",
  "FAILED",
  "REVERSED",
  "REJECTED",
] as const;

function ageLabel(row: WithdrawalRow, t: T): string {
  const hours = Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 3_600_000);
  if (hours < 1) return t("admin.withdrawals.age.now");
  if (hours < 48) return t("admin.withdrawals.age.hours", { count: hours });
  return t("admin.withdrawals.age.days", { count: Math.floor(hours / 24) });
}

/** The word an operator should see for the reserve behind one request. */
function reserveLabel(row: WithdrawalRow): string {
  if (RESERVED_STATES.has(row.state)) return "admin.withdrawals.reserve.held";
  if (RELEASED_STATES.has(row.state)) return "admin.withdrawals.reserve.released";
  return "admin.withdrawals.reserve.paid";
}

const reserveTone = (row: WithdrawalRow): StateTone =>
  RESERVED_STATES.has(row.state) ? "warn" : RELEASED_STATES.has(row.state) ? "neutral" : "good";

export function AdminWithdrawalsScreen() {
  const { t } = useI18n();
  const [state, setState] = useUrlFilter("state");
  const [ownerType, setOwnerType] = useUrlFilter("ownerType");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [flash, setFlash] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ row: WithdrawalRow; kind: "approve" | "reject" } | null>(null);
  const [reconcileTarget, setReconcileTarget] = useState<WithdrawalRow | null>(null);
  const [detail, setDetail] = useState<WithdrawalRow | null>(null);

  const summary = useResource<WithdrawalsSummary>("/admin/withdrawals-summary");
  const requests = useResource<WithdrawalRow[]>("/admin/withdrawals");
  const stats = summary.data;

  const rows = useMemo(() => requests.data ?? [], [requests.data]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (state && row.state !== state) return false;
      if (ownerType && row.ownerType !== ownerType) return false;
      if (!needle) return true;
      const phone = row.destinationSnapshot.phone ?? "";
      const reference = latestAttempt(row)?.providerReference ?? "";
      return [row.owner?.name, row.owner?.handle, row.owner?.contact, phone, reference, row.id, row.requestIdempotencyKey]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, state, ownerType, query]);

  const shown = filtered.slice(0, visibleCount);

  async function reload() {
    await Promise.all([summary.reload(), requests.reload()]);
  }

  async function onDecided(message: string) {
    setFlash(message);
    await reload();
  }

  /* ── Distribution card rows ─────────────────────────────────────────── */

  const stateRows = useMemo(() => {
    if (!stats) return [];
    return ORDERED_REQUEST_STATES.map((value) => ({
      state: value,
      count: stats.requests.byState[value] ?? 0,
      label: t(stateLabel(value)),
      tone: toneOf(value),
      meta: formatTzs(stats.requests.amountByState[value] ?? "0"),
    }));
  }, [stats, t]);

  const attemptRows = useMemo(() => {
    if (!stats) return [];
    return ATTEMPT_STATES.map((value) => ({
      state: value,
      count: stats.payouts.byState[value] ?? 0,
      label: t(attemptLabel(value)),
      tone: toneOf(value),
    }));
  }, [stats, t]);

  const beneficiaryRows = useMemo(() => {
    if (!stats) return [];
    return stats.beneficiaries.map((row) => ({
      state: row.ownerType,
      count: row.count,
      label: t(beneficiaryLabel(row.ownerType)),
      tone: toneOf(row.ownerType === "RESELLER" ? "PAID" : "APPROVED"),
      meta: formatTzs(row.amountTzs),
    }));
  }, [stats, t]);

  const moneyRows = useMemo(() => {
    if (!stats) return [];
    return [
      {
        state: "held",
        count: stats.reserve.heldCount,
        label: t("admin.withdrawals.money.held"),
        tone: toneOf("REQUESTED"),
        meta: formatTzs(stats.reserve.heldTzs),
      },
      {
        state: "paid",
        count: stats.requests.completed,
        label: t("admin.withdrawals.money.paidOut"),
        tone: toneOf("COMPLETED"),
        meta: formatTzs(stats.money.paidOutTzs),
      },
      {
        state: "released",
        count: stats.reserve.releasedCount,
        label: t("admin.withdrawals.money.released"),
        tone: toneOf("REJECTED"),
        meta: formatTzs(stats.reserve.releasedTzs),
      },
    ];
  }, [stats, t]);

  /** Daily paid-out volume (reseller vs agent) + request-state donut. */
  const series = useMemo(() => {
    const days: string[] = [];
    for (let i = TREND_DAYS - 1; i >= 0; i -= 1) days.push(dayKey(new Date(Date.now() - i * DAY_MS)));
    const buckets = new Map<string, { primary: number; secondary: number }>();
    for (const day of days) buckets.set(day, { primary: 0, secondary: 0 });

    for (const row of rows) {
      if (row.state !== "COMPLETED") continue;
      const when = row.updatedAt || row.createdAt;
      const bucket = buckets.get(dayKey(when));
      if (!bucket) continue;
      const amount = Number(row.amountTzs) || 0;
      if (row.ownerType === "AGENT") bucket.secondary += amount;
      else bucket.primary += amount;
    }

    const trend: DualTrendPoint[] = days.map((day) => ({ day, ...buckets.get(day)! }));
    const resellerTotal = trend.reduce((sum, d) => sum + d.primary, 0);
    const agentTotal = trend.reduce((sum, d) => sum + d.secondary, 0);

    const byState = stats?.requests.byState ?? {};
    const mix: MixSlice[] = ORDERED_REQUEST_STATES.filter((s) => (byState[s] ?? 0) > 0)
      .map((s) => ({
        label: t(stateLabel(s)),
        value: byState[s] ?? 0,
        color: REQUEST_MIX_COLORS[s] ?? CHART_COLORS.neutral,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      trend,
      mix,
      resellerTotal,
      agentTotal,
      requestTotal: stats?.requests.total ?? rows.length,
    };
  }, [rows, stats, t]);

  const filteredCount = filtered.length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button
            isDisabled={summary.loading}
            onPress={() => void reload()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCw className={`size-4 ${summary.loading ? "animate-spin" : ""}`} />
            {t("admin.withdrawals.action.refresh")}
          </Button>
        }
        description={t("admin.withdrawals.description")}
        eyebrow={t("admin.withdrawals.eyebrow")}
        icon={<Banknote />}
        iconTone="gold"
        meta={
          stats ? (
            <>
              <HeroChip icon={<Send className="size-3" />}>
                {t("admin.withdrawals.hero.requests", { count: stats.requests.total })}
              </HeroChip>
              <HeroChip icon={<Wallet className="size-3" />}>
                {t("admin.withdrawals.hero.reserveHeld", { amount: formatTzs(stats.reserve.heldTzs) })}
              </HeroChip>
              {stats.attention > 0 ? (
                <HeroChip icon={<TriangleAlert className="size-3" />} tone="danger">
                  {t("admin.withdrawals.hero.attention", { count: stats.attention })}
                </HeroChip>
              ) : (
                <HeroChip icon={<CircleCheck className="size-3" />} tone="success">
                  {t("admin.withdrawals.kpi.attention.clear")}
                </HeroChip>
              )}
            </>
          ) : null
        }
        title={t("admin.withdrawals.title")}
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
                stats.requests.awaitingDecision > 0
                  ? t("admin.withdrawals.kpi.awaiting.hint", {
                      count: stats.requests.awaitingDecision,
                      amount: formatTzs(stats.requests.awaitingAmountTzs),
                    })
                  : t("admin.withdrawals.kpi.awaiting.empty")
              }
              icon={<Hourglass />}
              iconTone={stats.requests.awaitingDecision > 0 ? "warning" : "success"}
              label={t("admin.withdrawals.kpi.awaiting.title")}
              value={stats.requests.awaitingDecision}
              delta={
                stats.requests.oldestWaitingHours !== null && stats.requests.awaitingDecision > 0 ? (
                  <span className="text-[11px] font-semibold text-[#b45309]">
                    {t("admin.withdrawals.kpi.awaiting.oldest", { hours: stats.requests.oldestWaitingHours })}
                  </span>
                ) : undefined
              }
            />
            <AdvoKpi
              hint={
                stats.requests.inFlight > 0
                  ? t("admin.withdrawals.kpi.inFlight.hint")
                  : t("admin.withdrawals.kpi.inFlight.empty")
              }
              icon={<ArrowLeftRight />}
              iconTone={stats.payouts.stale > 0 ? "warning" : "accent"}
              label={t("admin.withdrawals.kpi.inFlight.title")}
              value={stats.requests.inFlight}
              delta={
                stats.payouts.stale > 0 ? (
                  <span className="text-[11px] font-semibold text-[#b45309]">
                    {t("admin.withdrawals.kpi.inFlight.stale", { count: stats.payouts.stale })}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {formatTzs(stats.requests.inFlightAmountTzs)}
                  </span>
                )
              }
            />
            <AdvoKpi
              hint={
                stats.requests.completed > 0
                  ? t("admin.withdrawals.kpi.paid.hint", {
                      count: stats.requests.completed,
                      amount: formatTzs(stats.requests.averagePayoutTzs),
                    })
                  : t("admin.withdrawals.kpi.paid.empty")
              }
              icon={<Coins />}
              iconTone="success"
              label={t("admin.withdrawals.kpi.paid.title")}
              value={formatTzs(stats.money.paidOutTzs)}
              delta={
                <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                  {t("admin.withdrawals.kpi.paid.fees", { amount: formatTzs(stats.money.providerFeesTzs) })}
                </span>
              }
            />
            <AdvoKpi
              hint={
                stats.reserve.heldCount > 0
                  ? t("admin.withdrawals.kpi.reserve.hint", { count: stats.reserve.heldCount })
                  : t("admin.withdrawals.kpi.reserve.empty")
              }
              icon={<Wallet />}
              iconTone={stats.reserve.heldCount > 0 ? "teal" : "success"}
              label={t("admin.withdrawals.kpi.reserve.title")}
              value={formatTzs(stats.reserve.heldTzs)}
              delta={
                stats.reserve.releasedCount > 0 ? (
                  <span className="text-[11px] font-semibold text-advo-muted tabular-nums">
                    {t("admin.withdrawals.kpi.reserve.released", { amount: formatTzs(stats.reserve.releasedTzs) })}
                  </span>
                ) : undefined
              }
            />
            <AdvoKpi
              hint={
                stats.attention > 0
                  ? t("admin.withdrawals.kpi.attention.hint", {
                      review: stats.requests.needsReview,
                      unknown: stats.requests.byState.UNKNOWN ?? 0,
                      stale: stats.payouts.stale,
                    })
                  : t("admin.withdrawals.kpi.attention.clear")
              }
              icon={<TriangleAlert />}
              iconTone={stats.attention > 0 ? "danger" : "success"}
              label={t("admin.withdrawals.kpi.attention.title")}
              value={stats.attention}
              delta={
                stats.requests.failed + stats.requests.reversed > 0 ? (
                  <span className="text-[11px] font-semibold text-[var(--advo-danger)]">
                    {t("admin.withdrawals.kpi.failed", {
                      count: stats.requests.failed + stats.requests.reversed,
                    })}
                  </span>
                ) : undefined
              }
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <KpiSkeleton key={i} />)
        )}
      </div>

      {/* ── Trends + status circle ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ChartCard
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1B5EA4]/35 bg-[#1B5EA4]/15 px-2.5 py-1 text-[11px] font-bold text-[#9EC5F0]">
                <span className="size-2 rounded-full" style={{ background: CHART_COLORS.blue }} />
                {t("admin.withdrawals.trend.reseller")} · {formatTzs(series.resellerTotal)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FBA102]/35 bg-[#FBA102]/15 px-2.5 py-1 text-[11px] font-bold text-[#F5C96A]">
                <span className="size-2 rounded-full" style={{ background: CHART_COLORS.gold }} />
                {t("admin.withdrawals.trend.agent")} · {formatTzs(series.agentTotal)}
              </span>
            </div>
          }
          className="xl:col-span-8"
          description={t("admin.withdrawals.trend.description", { days: TREND_DAYS })}
          title={t("admin.withdrawals.trend.title")}
        >
          <DualAreaChart
            data={series.trend}
            primaryLabel={t("admin.withdrawals.trend.reseller")}
            secondaryLabel={t("admin.withdrawals.trend.agent")}
          />
        </ChartCard>

        <ChartCard
          className="xl:col-span-4"
          description={t("admin.withdrawals.mix.description")}
          title={t("admin.withdrawals.mix.title")}
        >
          <MixDonut
            centerLabel={t("admin.withdrawals.mix.center")}
            centerValue={String(series.requestTotal)}
            data={series.mix}
            height={190}
          />
        </ChartCard>
      </div>

      {/* ── Distribution box cards ── */}
      <section>
        <SectionHeader
          description={t("admin.withdrawals.board.hint")}
          icon={<Banknote />}
          iconTone="gold"
          title={t("admin.withdrawals.board.title")}
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats ? (
            <>
              <DistributionCard
                empty={t("admin.withdrawals.states.empty")}
                hint={t("admin.withdrawals.states.hint")}
                icon={<Send />}
                iconTone={stats.attention > 0 ? "danger" : "accent"}
                onPick={(next) => {
                  setState(state === next ? "" : next);
                  setVisibleCount(PAGE_SIZE);
                }}
                pickedState={state}
                rows={stateRows}
                title={t("admin.withdrawals.states.title")}
                totalLabel={t("admin.withdrawals.states.total", { count: stats.requests.total })}
              />
              <DistributionCard
                empty={t("admin.withdrawals.attempts.empty")}
                hint={t("admin.withdrawals.attempts.hint")}
                icon={<ArrowLeftRight />}
                iconTone={stats.payouts.stale > 0 ? "warning" : "violet"}
                rows={attemptRows}
                title={t("admin.withdrawals.attempts.title")}
                totalLabel={t("admin.withdrawals.attempts.open", { count: stats.payouts.open })}
              />
              <DistributionCard
                empty={t("admin.withdrawals.beneficiaries.empty")}
                hint={t("admin.withdrawals.beneficiaries.hint")}
                icon={<UserRound />}
                iconTone="teal"
                onPick={(next) => {
                  setOwnerType(ownerType === next ? "" : next);
                  setVisibleCount(PAGE_SIZE);
                }}
                pickedState={ownerType}
                rows={beneficiaryRows}
                title={t("admin.withdrawals.beneficiaries.title")}
                totalLabel={t("admin.withdrawals.beneficiaries.total", {
                  count: stats.beneficiaries.length,
                })}
              />
              <DistributionCard
                empty={t("admin.withdrawals.states.empty")}
                hint={t("admin.withdrawals.money.hint")}
                icon={<HandCoins />}
                iconTone="gold"
                rows={moneyRows}
                title={t("admin.withdrawals.money.title")}
                totalLabel={formatTzs(stats.reserve.committedTzs)}
              />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <CardSkeleton key={i} />)
          )}
        </div>

        {stats && Number(stats.money.feeVarianceTzs) !== 0 ? (
          <div className="mt-4">
            <Notice tone="warning">
              {t("admin.withdrawals.money.absorbed", { amount: formatTzs(stats.money.feeVarianceTzs) })}
            </Notice>
          </div>
        ) : null}
      </section>

      {/* ── Find + list ── */}
      <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
        <SectionHeader
          action={
            <span className="rounded-full border border-white/15 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-bold text-[#E8EAEE] tabular-nums">
              {t("admin.withdrawals.requests.count", { shown: filteredCount, total: rows.length })}
            </span>
          }
          description={t("admin.withdrawals.requests.description")}
          icon={<Filter />}
          iconTone="accent"
          title={t("admin.withdrawals.requests.filterTitle")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#8B939E]" />
            <Input
              aria-label={t("admin.withdrawals.filter.search")}
              className="border border-[var(--advo-border)] !bg-[var(--advo-surface-sunken)] pl-9 !text-[var(--advo-text)]"
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder={t("admin.withdrawals.filter.search")}
              value={query}
            />
          </div>
          {state || ownerType || query ? (
            <Button
              onPress={() => {
                setState("");
                setOwnerType("");
                setQuery("");
                setVisibleCount(PAGE_SIZE);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
              {t("admin.withdrawals.filter.clear")}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.withdrawals.filter.state")}>
          <FilterPill
            active={!state}
            count={stats?.requests.total ?? rows.length}
            label={t("admin.withdrawals.filter.allStates")}
            onClick={() => {
              setState("");
              setVisibleCount(PAGE_SIZE);
            }}
          />
          {ORDERED_REQUEST_STATES.map((value) => (
            <FilterPill
              active={state === value}
              count={stats?.requests.byState[value] ?? 0}
              key={value}
              label={t(stateLabel(value))}
              onClick={() => {
                setState(state === value ? "" : value);
                setVisibleCount(PAGE_SIZE);
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.withdrawals.filter.beneficiary")}>
          <FilterPill
            active={!ownerType}
            count={stats?.requests.total ?? rows.length}
            label={t("admin.withdrawals.filter.allBeneficiaries")}
            onClick={() => {
              setOwnerType("");
              setVisibleCount(PAGE_SIZE);
            }}
          />
          {BENEFICIARY_TYPES.map((value) => {
            const count = stats?.beneficiaries.find((b) => b.ownerType === value)?.count ?? 0;
            return (
              <FilterPill
                active={ownerType === value}
                count={count}
                key={value}
                label={t(beneficiaryLabel(value))}
                onClick={() => {
                  setOwnerType(ownerType === value ? "" : value);
                  setVisibleCount(PAGE_SIZE);
                }}
              />
            );
          })}
        </div>
      </Card>

      <ResourceView resource={requests}>
        {() =>
          filteredCount === 0 ? (
            <Card className="shadow-advo-card ring-1 ring-advo-border/70">
              <EmptyState
                text={rows.length === 0 ? t("admin.withdrawals.requests.empty") : t("admin.withdrawals.requests.noMatch")}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {shown.map((w) => (
                <WithdrawalCard
                  key={w.id}
                  onApprove={w.state === "REQUESTED" ? () => setDecision({ row: w, kind: "approve" }) : undefined}
                  onDetail={() => setDetail(w)}
                  onReconcile={
                    latestAttempt(w) && RECONCILABLE.has(latestAttempt(w)!.state) && w.state !== "REQUESTED"
                      ? () => setReconcileTarget(w)
                      : undefined
                  }
                  onReject={w.state === "REQUESTED" ? () => setDecision({ row: w, kind: "reject" }) : undefined}
                  row={w}
                  t={t}
                />
              ))}
              {visibleCount < filteredCount ? (
                <div className="flex justify-center pt-1">
                  <Button
                    onPress={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("admin.withdrawals.requests.showMore", {
                      count: Math.min(PAGE_SIZE, filteredCount - visibleCount),
                    })}
                  </Button>
                </div>
              ) : null}
            </div>
          )
        }
      </ResourceView>

      <DecisionDialog
        onClose={() => setDecision(null)}
        onDone={onDecided}
        target={decision}
        t={t}
      />
      <ReconcileDialog onClose={() => setReconcileTarget(null)} onDone={onDecided} target={reconcileTarget} t={t} />
      <DetailDialog onClose={() => setDetail(null)} target={detail} t={t} />
    </div>
  );
}

const TONE_DOT = TONE_BAR;
const barClass = (tone: StateTone) => TONE_DOT[tone];

function WithdrawalCard({
  row: w,
  t,
  onDetail,
  onApprove,
  onReject,
  onReconcile,
}: {
  row: WithdrawalRow;
  t: T;
  onDetail: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onReconcile?: () => void;
}) {
  const attempt = latestAttempt(w);
  const reseller = w.ownerType === "RESELLER";
  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-advo-card ring-1 ring-advo-border/70">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="sm" tone={reseller ? "teal" : "violet"}>
            {reseller ? <Building2 /> : <UserRound />}
          </SoftIcon>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[var(--advo-text)]">
                {w.owner?.name ?? t("admin.withdrawals.unknownBeneficiary")}
              </p>
              <StatusChip tone={chipToneOf(w.state)}>{t(stateLabel(w.state))}</StatusChip>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--advo-muted)]">
                <span aria-hidden="true" className={`size-2 rounded-full ${barClass(reserveTone(w))}`} />
                {t(reserveLabel(w) as MessageKey)}
              </span>
            </div>
            <p className="truncate text-xs text-[var(--advo-muted)]">
              {t(beneficiaryLabel(w.ownerType))}
              {w.owner?.handle ? ` · ${w.owner.handle}` : ""}
            </p>
            <p className="truncate text-[11px] text-[var(--advo-muted)] tabular-nums">
              {destinationName(w) ? `${destinationName(w)} · ` : ""}
              {w.destinationSnapshot.phone ?? t("admin.withdrawals.none")}
            </p>
            <p className="text-sm font-bold text-[var(--advo-text)] tabular-nums">
              {formatTzs(w.amountTzs)}
              <span className="ml-2 text-xs font-semibold text-[var(--advo-muted)]">
                {t("admin.withdrawals.col.totalDebit")} {formatTzs(w.totalDebitTzs)}
              </span>
            </p>
            <p className="text-[11px] text-[var(--advo-muted)] tabular-nums">
              {t("admin.withdrawals.fees.provider")} {formatTzs(w.providerFeeTzs)}
              {" · "}
              {t("admin.withdrawals.fees.platform")} {formatTzs(w.platformFeeTzs)}
              {" · "}
              {formatDateTime(w.createdAt)}
              {w.state === "REQUESTED" ? ` · ${ageLabel(w, t)}` : ""}
            </p>
            {w.failureReason || w.reviewReason ? (
              <p className="text-[11px] leading-snug text-amber-300">{w.failureReason ?? w.reviewReason}</p>
            ) : null}
            {attempt?.providerReference ? (
              <p className="text-[11px] text-[var(--advo-muted)]">
                {attempt.provider} · {attempt.providerReference}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
          <Button className="text-xs" onPress={onDetail} size="sm" type="button" variant="primary">
            <Eye className="size-3.5" />
            {t("admin.withdrawals.action.detail")}
          </Button>
          {onApprove ? (
            <Button className="text-xs" onPress={onApprove} size="sm" type="button" variant="outline">
              <CircleCheck className="size-3.5" />
              {t("admin.withdrawals.action.approve")}
            </Button>
          ) : null}
          {onReject ? (
            <Button className="text-xs" onPress={onReject} size="sm" type="button" variant="danger-soft">
              <Ban className="size-3.5" />
              {t("admin.withdrawals.action.reject")}
            </Button>
          ) : null}
          {onReconcile ? (
            <Button className="text-xs" onPress={onReconcile} size="sm" type="button" variant="outline">
              <RotateCcw className="size-3.5" />
              {t("admin.withdrawals.action.reconcile")}
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

/* ────────────────────────────── Dialogs ────────────────────────────── */
/** The preview every audited money decision shows before it is taken. */
function DecisionSummary({ t, row }: { t: T; row: WithdrawalRow }) {
  return (
    <div className="rounded-lg border border-[var(--advo-border)] bg-slate-50/60 px-3">
      <DetailRow
        label={t("admin.withdrawals.decision.summary.beneficiary")}
        value={
          <>
            {row.owner?.name ?? t("admin.withdrawals.unknownBeneficiary")}
            <span className="text-advo-muted">{` · ${t(beneficiaryLabel(row.ownerType))}`}</span>
          </>
        }
      />
      <DetailRow
        label={t("admin.withdrawals.decision.summary.destination")}
        value={
          <>
            {row.destinationSnapshot.recipientName ?? t("admin.withdrawals.none")}
            <span className="text-advo-muted tabular-nums">{` · ${row.destinationSnapshot.phone ?? ""}`}</span>
          </>
        }
      />
      <DetailRow
        label={t("admin.withdrawals.decision.summary.amount")}
        value={<span className="font-bold tabular-nums">{formatTzs(row.amountTzs)}</span>}
      />
      <DetailRow
        label={t("admin.withdrawals.decision.summary.totalDebit")}
        value={<span className="font-semibold tabular-nums">{formatTzs(row.totalDebitTzs)}</span>}
      />
      <DetailRow
        label={t("admin.withdrawals.decision.summary.waiting")}
        value={<span className="tabular-nums">{ageLabel(row, t)}</span>}
      />
    </div>
  );
}

function DecisionDialog({
  target,
  onClose,
  onDone,
  t,
}: {
  target: { row: WithdrawalRow; kind: "approve" | "reject" } | null;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  t: T;
}) {
  const approving = target?.kind === "approve";
  return (
    <ReasonDialog
      labels={{
        title: approving
          ? t("admin.withdrawals.decision.approveTitle")
          : t("admin.withdrawals.decision.rejectTitle"),
        note: approving ? t("admin.withdrawals.decision.approveNote") : t("admin.withdrawals.decision.rejectNote"),
        reasonLabel: approving
          ? t("admin.withdrawals.decision.approveReasonLabel")
          : t("admin.withdrawals.decision.rejectReasonLabel"),
        reasonPlaceholder: t("admin.withdrawals.decision.reasonPlaceholder"),
        tooShort: t("admin.withdrawals.decision.tooShort"),
        cancel: t("admin.withdrawals.dialog.cancel"),
        confirm: approving ? t("admin.withdrawals.action.approve") : t("admin.withdrawals.action.reject"),
      }}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!target) return;
        await api.post(`/admin/withdrawals/${target.row.id}/review`, {
          decision: target.kind,
          reason,
        });
        await onDone(
          `${t(stateLabel(approving ? "APPROVED" : "REJECTED"))} · ${formatTzs(target.row.amountTzs)}`,
        );
      }}
      open={Boolean(target)}
      summary={target ? <DecisionSummary row={target.row} t={t} /> : null}
      tone={approving ? "primary" : "danger"}
      warning={approving ? undefined : t("admin.withdrawals.decision.rejectWarning")}
    />
  );
}

/**
 * Asks the provider for the truth about a stuck payout. The dialog never offers a
 * local override — if the provider cannot answer, the screen says so and the row
 * stays exactly where it was.
 */
function ReconcileDialog({
  target,
  onClose,
  onDone,
  t,
}: {
  target: WithdrawalRow | null;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  t: T;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = target ? latestAttempt(target) : null;

  async function run() {
    if (!target) return;
    setPending(true);
    setError(null);
    try {
      const response = await api.post<{ result: string }>(`/admin/withdrawals/${target.id}/reconcile`, {});
      setResult(response.result);
      await onDone(t("admin.withdrawals.action.reconcile"));
    } catch (err) {
      setError(errorMessage(err));
      setResult("error");
    } finally {
      setPending(false);
    }
  }

  function close() {
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <DialogShell onClose={close} open={Boolean(target)}>
      <Modal.Header>
        <Modal.Heading className="text-base font-black text-advo-text">
          {t("admin.withdrawals.reconcile.title")}
        </Modal.Heading>
        <p className="mt-1 text-xs text-advo-muted">{t("admin.withdrawals.reconcile.note")}</p>
      </Modal.Header>
      <Modal.Body>
        {target ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--advo-border)] bg-slate-50/60 px-3">
              <DetailRow
                label={t("admin.withdrawals.decision.summary.beneficiary")}
                value={target.owner?.name ?? t("admin.withdrawals.unknownBeneficiary")}
              />
              <DetailRow
                label={t("admin.withdrawals.decision.summary.amount")}
                value={<span className="font-bold tabular-nums">{formatTzs(target.amountTzs)}</span>}
              />
              <DetailRow
                label={t("admin.withdrawals.reconcile.attempt")}
                value={attempt ? t(attemptLabel(attempt.state)) : t("admin.withdrawals.reconcile.none")}
              />
              <DetailRow
                label={t("admin.withdrawals.reconcile.reference")}
                value={
                  attempt?.providerReference ? (
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{attempt.providerReference}</code>
                  ) : (
                    <span className="text-advo-muted">{t("admin.withdrawals.reconcile.noReference")}</span>
                  )
                }
              />
            </div>

            {result ? (
              <Notice tone={result === "error" || result === "lookup_failed" ? "warning" : "success"}>
                <span className="font-semibold">{t("admin.withdrawals.reconcile.result")}: </span>
                {t(`admin.withdrawals.reconcile.result.${result}` as MessageKey)}
              </Notice>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}

            <div className="flex justify-end gap-2 border-t border-[var(--advo-border)] pt-4">
              <Button onPress={close} type="button" variant="outline">
                {t("admin.withdrawals.reconcile.close")}
              </Button>
              <Button isDisabled={pending || Boolean(result)} onPress={() => void run()} type="button" variant="primary">
                <ShieldAlert className={`size-4 ${pending ? "animate-pulse" : ""}`} />
                {pending ? t("admin.withdrawals.reconcile.running") : t("admin.withdrawals.reconcile.run")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal.Body>
    </DialogShell>
  );
}

function DetailDialog({ target, onClose, t }: { target: WithdrawalRow | null; onClose: () => void; t: T }) {
  if (!target) return null;
  const w = target;
  const destinationArchived = Boolean(w.destination.archivedAt);

  return (
    <DialogShell onClose={onClose} open>
      <Modal.Header>
        <Modal.Heading className="text-base font-black text-advo-text">
          {t("admin.withdrawals.detail.title")}
        </Modal.Heading>
        <p className="mt-1 text-xs text-advo-muted">
          {w.owner?.name ?? t("admin.withdrawals.unknownBeneficiary")} · <code className="text-xs">{w.id.slice(0, 8)}</code>
        </p>
      </Modal.Header>
      <Modal.Body>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={chipToneOf(w.state)}>{t(stateLabel(w.state))}</StatusChip>
            <SoftIcon size="sm" tone={w.ownerType === "RESELLER" ? "teal" : "violet"}>
              {w.ownerType === "RESELLER" ? <Building2 /> : <UserRound />}
            </SoftIcon>
            <span className="text-xs font-bold text-advo-text tabular-nums">{formatTzs(w.amountTzs)}</span>
          </div>

          <div>
            <DetailSection>{t("admin.withdrawals.detail.section.identity")}</DetailSection>
            <DetailRow
              label={t("admin.withdrawals.detail.beneficiary")}
              value={w.owner?.name ?? t("admin.withdrawals.unknownBeneficiary")}
            />
            <DetailRow label={t("admin.withdrawals.detail.kind")} value={t(beneficiaryLabel(w.ownerType))} />
            <DetailRow
              label={t("admin.withdrawals.detail.handle")}
              value={w.owner?.handle ? <code className="text-xs">{w.owner.handle}</code> : t("admin.withdrawals.none")}
            />
            <DetailRow
              label={t("admin.withdrawals.detail.contact")}
              value={w.owner?.contact ?? t("admin.withdrawals.noContact")}
            />
            <DetailRow
              label={t("admin.withdrawals.detail.accountStatus")}
              value={w.owner?.status ? <StatusChip tone={w.owner.status === "ACTIVE" ? "success" : "warning"}>{w.owner.status}</StatusChip> : t("admin.withdrawals.none")}
            />
            <DetailRow
              label={t("admin.withdrawals.detail.destination")}
              value={
                <>
                  {w.destinationSnapshot.recipientName ?? t("admin.withdrawals.none")}
                  <span className="block tabular-nums text-advo-muted">{w.destinationSnapshot.phone ?? ""}</span>
                  <span className="block text-[11px] font-semibold">
                    {destinationArchived ? (
                      <span className="text-[var(--advo-danger)]">
                        {t("admin.withdrawals.detail.destinationArchived")}
                      </span>
                    ) : w.destination.verifiedAt ? (
                      <span className="text-emerald-600">{t("admin.withdrawals.detail.destinationVerified")}</span>
                    ) : (
                      <span className="text-[#b45309]">{t("admin.withdrawals.detail.destinationUnverified")}</span>
                    )}
                  </span>
                </>
              }
            />
            <DetailRow label={t("admin.withdrawals.detail.request")} value={<code className="text-xs">{w.id}</code>} />
            <DetailRow
              label={t("admin.withdrawals.detail.idempotency")}
              value={<code className="text-xs">{w.requestIdempotencyKey}</code>}
            />
          </div>

          <div>
            <DetailSection>{t("admin.withdrawals.detail.section.money")}</DetailSection>
            <DetailRow
              label={t("admin.withdrawals.detail.amount")}
              value={<span className="font-bold tabular-nums">{formatTzs(w.amountTzs)}</span>}
            />
            <DetailRow
              label={t("admin.withdrawals.detail.providerFee")}
              value={<span className="tabular-nums">{formatTzs(w.providerFeeTzs)}</span>}
            />
            <DetailRow
              label={t("admin.withdrawals.detail.platformFee")}
              value={<span className="tabular-nums">{formatTzs(w.platformFeeTzs)}</span>}
            />
            <DetailRow
              label={t("admin.withdrawals.detail.totalDebit")}
              value={<span className="font-semibold tabular-nums">{formatTzs(w.totalDebitTzs)}</span>}
            />
            <DetailRow label={t("admin.withdrawals.col.reserve")} value={t(reserveLabel(w) as MessageKey)} />
          </div>

          <div>
            <DetailSection>{t("admin.withdrawals.detail.section.timeline")}</DetailSection>
            <DetailRow label={t("admin.withdrawals.detail.provider")} value={latestAttempt(w)?.provider ?? t("admin.withdrawals.none")} />
            <DetailRow label={t("admin.withdrawals.detail.quotedAt")} value={formatDateTime(w.quotedAt)} />
            <DetailRow label={t("admin.withdrawals.detail.created")} value={formatDateTime(w.createdAt)} />
            <DetailRow label={t("admin.withdrawals.detail.updated")} value={formatDateTime(w.updatedAt)} />
            {w.reviewedAt ? (
              <>
                <DetailRow label={t("admin.withdrawals.detail.reviewedAt")} value={formatDateTime(w.reviewedAt)} />
                <DetailRow
                  label={t("admin.withdrawals.detail.reviewReason")}
                  value={w.reviewReason ?? t("admin.withdrawals.none")}
                />
              </>
            ) : null}
            {w.failureReason ? (
              <DetailRow
                label={t("admin.withdrawals.detail.failureReason")}
                value={<span className="text-[var(--advo-danger)]">{w.failureReason}</span>}
              />
            ) : null}
          </div>

          <div>
            <DetailSection>{t("admin.withdrawals.detail.section.attempts")}</DetailSection>
            {w.attempts.length === 0 ? (
              <p className="py-2 text-xs text-advo-muted">{t("admin.withdrawals.detail.noAttempts")}</p>
            ) : (
              <ul className="space-y-3">
                {w.attempts.map((attempt) => (
                  <li key={attempt.id} className="rounded-lg border border-[var(--advo-border)] bg-slate-50/60 px-3 py-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <StatusChip tone={chipToneOf(attempt.state)}>{t(attemptLabel(attempt.state))}</StatusChip>
                      <span className="text-[11px] text-advo-muted">{formatDateTime(attempt.createdAt)}</span>
                    </div>
                    <DetailRow
                      label={t("admin.withdrawals.detail.attemptRef")}
                      value={
                        attempt.providerReference ? (
                          <code className="text-xs">{attempt.providerReference}</code>
                        ) : (
                          <span className="text-advo-muted">{t("admin.withdrawals.reconcile.noReference")}</span>
                        )
                      }
                    />
                    <DetailRow
                      label={t("admin.withdrawals.detail.attemptFee")}
                      value={<span className="tabular-nums">{formatTzs(attempt.feeTzs)}</span>}
                    />
                    <DetailRow label={t("admin.withdrawals.detail.attemptCreated")} value={formatDateTime(attempt.createdAt)} />
                    {attempt.lastCheckedAt ? (
                      <DetailRow
                        label={t("admin.withdrawals.detail.attemptChecked")}
                        value={formatDateTime(attempt.lastCheckedAt)}
                      />
                    ) : null}
                    {attempt.lastError ? (
                      <DetailRow
                        label={t("admin.withdrawals.detail.attemptError")}
                        value={<span className="text-[var(--advo-danger)]">{attempt.lastError}</span>}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <DetailSection>{t("admin.withdrawals.detail.section.allocations")}</DetailSection>
            {w.allocations.length === 0 ? (
              <p className="py-2 text-xs text-advo-muted">{t("admin.withdrawals.detail.noAllocations")}</p>
            ) : (
              <>
                <p className="mb-1 text-xs font-semibold text-advo-text tabular-nums">
                  {t("admin.withdrawals.detail.allocationTotal", {
                    count: w.allocations.length,
                    amount: formatTzs(
                      w.allocations.reduce((sum, a) => sum + BigInt(a.amountTzs), 0n).toString(),
                    ),
                  })}
                </p>
                {w.allocations.map((allocation) => (
                  <DetailRow
                    key={allocation.id}
                    label={t(allocationLabel(allocation.state))}
                    value={<span className="tabular-nums">{formatTzs(allocation.amountTzs)}</span>}
                  />
                ))}
              </>
            )}
          </div>

          <div className="flex justify-end border-t border-[var(--advo-border)] pt-4">
            <Button onPress={onClose} type="button" variant="outline">
              {t("admin.withdrawals.detail.close")}
            </Button>
          </div>
        </div>
      </Modal.Body>
    </DialogShell>
  );
}
