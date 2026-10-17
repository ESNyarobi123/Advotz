"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Button, Card, Input, Modal, useOverlayState } from "@heroui/react";
import { AdvoKpi, AdvoSelect, Notice, SoftIcon, StatusChip } from "@advo/ui";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Coins,
  Filter,
  HandCoins,
  Percent,
  Plus,
  Receipt,
  Repeat,
  Search,
  Sparkles,
  Tag,
  Timer,
  Trash2,
  TriangleAlert,
  User,
  Wallet,
} from "lucide-react";
import { PageHero, ResourceView, SectionHeader } from "@/features/common/components";
import { ReasonDialog, type ReasonDialogLabels } from "@/features/common/reason-dialog";
import { api, errorMessage } from "@/lib/api";
import { toInt, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MessageKey, TranslateVars } from "@advo/i18n";

type Trigger = "FIRST_SUBSCRIPTION_PAYMENT" | "SUBSCRIPTION_RENEWAL";
type Mode = "FIXED" | "PERCENTAGE";
type PolicyStatus = "OPEN" | "SCHEDULED" | "ENDED";

/** `GET /admin/commission-policies` — a policy plus the usage it actually saw. */
type PolicyRow = {
  id: string;
  name: string;
  agentId: string | null;
  trigger: Trigger;
  mode: Mode;
  fixedTzs: string | null;
  basisPoints: number | null;
  eligiblePlanCodes: string[];
  referralEligibilityDays: number | null;
  holdDays: number;
  maxPerInvoiceTzs: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isDemo: boolean;
  agent: { id: string; referralCode: string; user: { name: string } } | null;
  accrualCount: number;
  accruedTzs: string;
  paidTzs: string;
};

/**
 * The rate frozen onto an accrual the day it was created.
 *
 * Read from the snapshot rather than the live policy: a later rate change must never make
 * an old row display a rate that was not actually paid.
 */
type PolicySnapshot = {
  name?: string;
  mode?: Mode;
  basisPoints?: number | null;
  fixedTzs?: string | null;
  maxPerInvoiceTzs?: string | null;
  holdDays?: number;
  planCode?: string;
  isDemo?: boolean;
};

/** `GET /admin/commissions` — one verified subscription payment priced at its own rate. */
type AccrualRow = {
  id: string;
  state: string;
  trigger: Trigger;
  eligibleBaseTzs: string;
  amountTzs: string;
  reservedTzs: string;
  paidTzs: string;
  reversedTzs: string;
  availableAt: string;
  reason: string | null;
  createdAt: string;
  policySnapshot: PolicySnapshot;
  agent: { id: string; referralCode: string };
  reseller: { id: string; businessName: string };
};

/** `GET /admin/commissions/summary` — money grouped by accrual state. */
type Summary = {
  accruedTzs: string;
  onHoldTzs: string;
  availableTzs: string;
  paidTzs: string;
  reversedTzs: string;
  needsReviewTzs: string;
  needsReviewCount: number;
  totalCount: number;
  states: Array<{ state: string; count: number; outstandingTzs: string }>;
};

const STATES = ["PENDING_HOLD", "AVAILABLE", "RESERVED_FOR_WITHDRAWAL", "PAID", "REVERSED", "NEEDS_REVIEW"] as const;
type AccrualState = (typeof STATES)[number];

/** Static maps keep every translator call on a literal key, so a typo fails the build. */
const STATE_KEY: Record<AccrualState, MessageKey> = {
  PENDING_HOLD: "admin.commissions.state.PENDING_HOLD",
  AVAILABLE: "admin.commissions.state.AVAILABLE",
  RESERVED_FOR_WITHDRAWAL: "admin.commissions.state.RESERVED_FOR_WITHDRAWAL",
  PAID: "admin.commissions.state.PAID",
  REVERSED: "admin.commissions.state.REVERSED",
  NEEDS_REVIEW: "admin.commissions.state.NEEDS_REVIEW",
};

const TRIGGER_KEY: Record<Trigger, MessageKey> = {
  FIRST_SUBSCRIPTION_PAYMENT: "admin.commissions.trigger.FIRST_SUBSCRIPTION_PAYMENT",
  SUBSCRIPTION_RENEWAL: "admin.commissions.trigger.SUBSCRIPTION_RENEWAL",
};

const STATUS_KEY: Record<PolicyStatus, MessageKey> = {
  OPEN: "admin.commissions.policies.status.OPEN",
  SCHEDULED: "admin.commissions.policies.status.SCHEDULED",
  ENDED: "admin.commissions.policies.status.ENDED",
};

/** Status chip colours, kept beside the status keys so the two cannot drift. */
const STATUS_TONE: Record<PolicyStatus, "success" | "accent" | "default"> = {
  OPEN: "success",
  SCHEDULED: "accent",
  ENDED: "default",
};

const STATE_TONE: Record<string, "success" | "warning" | "danger" | "accent" | "default"> = {
  PENDING_HOLD: "warning",
  AVAILABLE: "success",
  RESERVED_FOR_WITHDRAWAL: "accent",
  PAID: "success",
  REVERSED: "default",
  NEEDS_REVIEW: "danger",
};

type Translator = (key: MessageKey, vars?: TranslateVars) => string;

/** Basis points render as whole percents when they divide evenly, so 1000 reads as "10%". */
function bpsLabel(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** The headline number of a policy: a percent or a flat amount, never both. */
function rateLabel(policy: { mode: Mode; fixedTzs: string | null; basisPoints: number | null }): string {
  return policy.mode === "FIXED" ? formatTzs(policy.fixedTzs) : bpsLabel(policy.basisPoints ?? 0);
}

/**
 * Live, scheduled or finished — decided by the clock, not by whether `effectiveTo` is set.
 *
 * A policy can carry a future `effectiveTo` (a successor starting later closed it) while
 * still being very much in force today, so only the dates can answer this.
 */
function policyStatus(policy: { effectiveFrom: string; effectiveTo: string | null }): PolicyStatus {
  const now = Date.now();
  if (new Date(policy.effectiveFrom).getTime() > now) return "SCHEDULED";
  if (policy.effectiveTo && new Date(policy.effectiveTo).getTime() <= now) return "ENDED";
  return "OPEN";
}

/** What an agent is still owed on one accrual: amount − already paid − already reversed. */
function outstanding(accrual: { amountTzs: string; paidTzs: string; reversedTzs: string }): bigint {
  return BigInt(accrual.amountTzs) - BigInt(accrual.paidTzs) - BigInt(accrual.reversedTzs);
}

/** Reversing only makes sense while money is still owed and not already spoken for. */
function canReverse(accrual: AccrualRow): boolean {
  return (
    ["PENDING_HOLD", "AVAILABLE"].includes(accrual.state) &&
    BigInt(accrual.reservedTzs) === 0n &&
    outstanding(accrual) > 0n
  );
}

export function AdminCommissionsScreen() {
  const { t } = useI18n();
  const policies = useResource<PolicyRow[]>("/admin/commission-policies");
  const accruals = useResource<AccrualRow[]>("/admin/commissions");
  const summary = useResource<Summary>("/admin/commissions/summary");
  const agents = useResource<Array<{ id: string; referralCode: string }>>("/admin/agents");

  const [tab, setTab] = useState<"accruals" | "policies">("accruals");
  const [accrualQuery, setAccrualQuery] = useState("");
  const [accrualState, setAccrualState] = useState<"all" | AccrualState>("all");
  const [policyQuery, setPolicyQuery] = useState("");
  const [policyFilter, setPolicyFilter] = useState<"all" | PolicyStatus | "DEMO">("all");
  const [flash, setFlash] = useState<string | null>(null);

  /** `null` = create, a row = replace that policy, `undefined` = modal closed. */
  const [formTarget, setFormTarget] = useState<PolicyRow | null | undefined>(undefined);
  /** End or delete a policy, or reverse an accrual — all three need an audited reason. */
  const [reasonTarget, setReasonTarget] = useState<
    { kind: "end" | "delete"; policy: PolicyRow } | { kind: "reverse"; accrual: AccrualRow } | null
  >(null);

  const policyRows = policies.data ?? [];
  const accrualRows = accruals.data ?? [];

  const stats = useMemo(() => {
    const statuses = policyRows.map(policyStatus);
    return {
      live: statuses.filter((s) => s === "OPEN").length,
      scheduled: statuses.filter((s) => s === "SCHEDULED").length,
      ended: statuses.filter((s) => s === "ENDED").length,
      demo: policyRows.filter((p) => p.isDemo).length,
    };
  }, [policyRows]);

  /** Live first, then scheduled, then history — each newest first. */
  const orderedPolicies = useMemo(() => {
    const weight: Record<PolicyStatus, number> = { OPEN: 0, SCHEDULED: 1, ENDED: 2 };
    return [...policyRows].sort((a, b) => {
      const byStatus = weight[policyStatus(a)] - weight[policyStatus(b)];
      if (byStatus !== 0) return byStatus;
      return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    });
  }, [policyRows]);

  const visiblePolicies = useMemo(() => {
    const needle = policyQuery.trim().toLowerCase();
    return orderedPolicies.filter((policy) => {
      const status = policyStatus(policy);
      const matchesFilter =
        policyFilter === "all" ? true : policyFilter === "DEMO" ? policy.isDemo : status === policyFilter;
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [
        policy.name,
        policy.agent?.referralCode ?? "",
        policy.agent?.user.name ?? "",
        rateLabel(policy),
        policy.trigger,
        ...policy.eligiblePlanCodes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [orderedPolicies, policyQuery, policyFilter]);

  const visibleAccruals = useMemo(() => {
    const needle = accrualQuery.trim().toLowerCase();
    return accrualRows.filter((accrual) => {
      if (accrualState !== "all" && accrual.state !== accrualState) return false;
      if (!needle) return true;
      return [
        accrual.agent.referralCode,
        accrual.reseller.businessName,
        accrual.trigger,
        accrual.state,
        accrual.policySnapshot.name ?? "",
        accrual.amountTzs,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [accrualRows, accrualQuery, accrualState]);

  /** Counts come from the summary so they describe every accrual, not just the fetched page. */
  const stateCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of summary.data?.states ?? []) map.set(row.state, row.count);
    return map;
  }, [summary.data]);

  async function afterChange(message: string) {
    setFlash(message);
    await Promise.all([policies.reload(), accruals.reload(), summary.reload()]);
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-4">
      <PageHero
        actions={
          <Button onPress={() => setFormTarget(null)} size="sm" type="button" variant="primary">
            <Plus className="size-4" />
            {t("admin.commissions.action.newPolicy")}
          </Button>
        }
        description={t("admin.commissions.description")}
        eyebrow={t("admin.commissions.eyebrow")}
        icon={<HandCoins />}
        iconTone="gold"
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-semibold text-[#F4F6F8] tabular-nums">
              <Filter className="size-3 text-[#C5CDD8]" />
              {t("admin.commissions.policies.count", { count: policyRows.length })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 tabular-nums">
              <Sparkles className="size-3" />
              {t("admin.commissions.hero.live", { count: stats.live })}
            </span>
          </>
        }
        title={t("admin.commissions.title")}
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

      {/* ── Money at a glance ── */}
      <ResourceView resource={summary}>
        {(data) => (
          <div className="space-y-4">
            {data.needsReviewCount > 0 ? (
              <Notice tone="warning">
                <span className="flex flex-wrap items-center gap-2">
                  <TriangleAlert className="size-4 shrink-0" />
                  <span className="font-bold">
                    {t("admin.commissions.alert.needsReview", { count: data.needsReviewCount })}
                  </span>
                  <span className="opacity-80">{t("admin.commissions.alert.needsReviewHint")}</span>
                </span>
              </Notice>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <AdvoKpi
                hint={t("admin.commissions.kpi.accruedHint", { count: data.totalCount })}
                icon={<Coins />}
                iconTone="gold"
                label={t("admin.commissions.kpi.accrued")}
                value={formatTzs(data.accruedTzs)}
              />
              <AdvoKpi
                hint={t("admin.commissions.kpi.onHoldHint")}
                icon={<Timer />}
                iconTone="warning"
                label={t("admin.commissions.kpi.onHold")}
                value={formatTzs(data.onHoldTzs)}
              />
              <AdvoKpi
                hint={t("admin.commissions.kpi.availableHint")}
                icon={<Wallet />}
                iconTone="success"
                label={t("admin.commissions.kpi.available")}
                value={formatTzs(data.availableTzs)}
              />
              <AdvoKpi
                hint={t("admin.commissions.kpi.paidHint", { reversed: formatTzs(data.reversedTzs) })}
                icon={<BadgeCheck />}
                iconTone="accent"
                label={t("admin.commissions.kpi.paid")}
                value={formatTzs(data.paidTzs)}
              />
            </div>
          </div>
        )}
      </ResourceView>

      {/* ── Tabs ── */}
      <div
        className="flex flex-wrap gap-1 rounded-2xl border border-[var(--advo-border)] bg-[var(--advo-surface-sunken)] p-1.5 shadow-advo-card"
        role="tablist"
      >
        {(["accruals", "policies"] as const).map((key) => {
          const active = tab === key;
          return (
            <button
              aria-selected={active}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                active
                  ? "bg-[#1B5EA4] text-white shadow-advo-card"
                  : "text-[#E8EAEE] hover:bg-[#2A2D33] hover:text-white"
              }`}
              key={key}
              onClick={() => setTab(key)}
              role="tab"
              type="button"
            >
              {key === "accruals" ? <Coins className="size-3.5 shrink-0" /> : <Percent className="size-3.5 shrink-0" />}
              {t(key === "accruals" ? "admin.commissions.tab.accruals" : "admin.commissions.tab.policies")}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/25 text-white" : "border border-white/15 bg-[#101113] text-[#F4F6F8]"
                }`}
              >
                {key === "accruals" ? (summary.data?.totalCount ?? accrualRows.length) : policyRows.length}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "accruals" ? (
        <>
          <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <SectionHeader
              action={
                <span className="rounded-full border border-white/15 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-bold text-[#E8EAEE] tabular-nums">
                  {t("admin.commissions.accruals.showing", { shown: visibleAccruals.length, total: accrualRows.length })}
                </span>
              }
              icon={<Filter />}
              iconTone="teal"
              title={t("admin.commissions.search.accrualsTitle")}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-advo-muted" />
                <Input
                  aria-label={t("admin.commissions.search.accruals")}
                  className="border border-[var(--advo-border)] !bg-[var(--advo-surface-sunken)] pl-9 !text-[var(--advo-text)]"
                  placeholder={t("admin.commissions.search.accruals")}
                  value={accrualQuery}
                  onChange={(e) => setAccrualQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group">
                <FilterPill
                  active={accrualState === "all"}
                  count={summary.data?.totalCount ?? accrualRows.length}
                  label={t("admin.commissions.filter.all")}
                  onClick={() => setAccrualState("all")}
                />
                {STATES.map((state) => (
                  <FilterPill
                    active={accrualState === state}
                    count={stateCount.get(state) ?? 0}
                    key={state}
                    label={t(STATE_KEY[state])}
                    onClick={() => setAccrualState(state)}
                  />
                ))}
              </div>
            </div>
          </Card>

          <ResourceView resource={accruals}>
            {(rows) => (
              <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
                <SectionHeader
                  description={t("admin.commissions.accruals.description")}
                  icon={<Receipt />}
                  iconTone="gold"
                  title={t("admin.commissions.accruals.title")}
                />
                {rows.length === 0 ? (
                  <EmptyState
                    hint={t("admin.commissions.accruals.emptyHint")}
                    text={t("admin.commissions.accruals.empty")}
                  />
                ) : visibleAccruals.length === 0 ? (
                  <EmptyState
                    hint={t("admin.commissions.accruals.noMatchHint")}
                    text={t("admin.commissions.accruals.noMatch")}
                  />
                ) : (
                  <>
                    <div className="-mx-5 overflow-x-auto">
                      <table className="w-full min-w-[64rem] text-sm">
                        <thead>
                          <tr className="border-y border-[var(--advo-border)] bg-advo-surface-soft/60 text-left">
                            <Th>{t("admin.commissions.col.agent")}</Th>
                            <Th>{t("admin.commissions.col.reseller")}</Th>
                            <Th>{t("admin.commissions.col.trigger")}</Th>
                            <Th>{t("admin.commissions.col.base")}</Th>
                            <Th>{t("admin.commissions.col.amount")}</Th>
                            <Th>{t("admin.commissions.col.state")}</Th>
                            <Th>{t("admin.commissions.col.availableFrom")}</Th>
                            <Th>{t("admin.commissions.col.actions")}</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleAccruals.map((accrual) => (
                            <AccrualTableRow
                              accrual={accrual}
                              key={accrual.id}
                              onReverse={() => setReasonTarget({ kind: "reverse", accrual })}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {rows.length === 200 ? (
                      <p className="text-[11px] text-advo-muted">
                        {t("admin.commissions.accruals.capped", { count: 200 })}
                      </p>
                    ) : null}
                  </>
                )}
              </Card>
            )}
          </ResourceView>
        </>
      ) : (
        <>
          <Card className="gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70">
            <SectionHeader
              action={
                <span className="rounded-full border border-white/15 bg-[#2A2D33] px-2.5 py-1 text-[11px] font-bold text-[#E8EAEE] tabular-nums">
                  {visiblePolicies.length} / {policyRows.length}
                </span>
              }
              icon={<Filter />}
              iconTone="teal"
              title={t("admin.commissions.search.policiesTitle")}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-advo-muted" />
                <Input
                  aria-label={t("admin.commissions.search.policies")}
                  className="border border-[var(--advo-border)] !bg-[var(--advo-surface-sunken)] pl-9 !text-[var(--advo-text)]"
                  placeholder={t("admin.commissions.search.policies")}
                  value={policyQuery}
                  onChange={(e) => setPolicyQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group">
                <FilterPill
                  active={policyFilter === "all"}
                  count={policyRows.length}
                  label={t("admin.commissions.filter.all")}
                  onClick={() => setPolicyFilter("all")}
                />
                {(["OPEN", "SCHEDULED", "ENDED"] as const).map((status) => (
                  <FilterPill
                    active={policyFilter === status}
                    count={
                      status === "OPEN" ? stats.live : status === "SCHEDULED" ? stats.scheduled : stats.ended
                    }
                    key={status}
                    label={t(STATUS_KEY[status])}
                    onClick={() => setPolicyFilter(status)}
                  />
                ))}
                <FilterPill
                  active={policyFilter === "DEMO"}
                  count={stats.demo}
                  label={t("admin.commissions.policies.badge.demo")}
                  onClick={() => setPolicyFilter("DEMO")}
                />
              </div>
            </div>
          </Card>

          <ResourceView resource={policies}>
            {(rows) =>
              rows.length === 0 ? (
                <Card className="shadow-advo-card ring-1 ring-advo-border/70">
                  <span className="flex flex-col items-center gap-2 py-6">
                    <SoftIcon size="lg" tone="gold">
                      <Percent />
                    </SoftIcon>
                    <span className="text-sm font-bold text-advo-text">{t("admin.commissions.policies.empty")}</span>
                    <span className="max-w-md text-center text-xs text-advo-muted">
                      {t("admin.commissions.policies.emptyHint")}
                    </span>
                    <Button onPress={() => setFormTarget(null)} size="sm" type="button" variant="primary">
                      <Plus className="size-4" />
                      {t("admin.commissions.action.newPolicy")}
                    </Button>
                  </span>
                </Card>
              ) : visiblePolicies.length === 0 ? (
                <Card className="shadow-advo-card ring-1 ring-advo-border/70">
                  <EmptyState
                    hint={t("admin.commissions.policies.noMatchHint")}
                    text={t("admin.commissions.policies.noMatch")}
                  />
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visiblePolicies.map((policy) => (
                    <PolicyCard
                      key={policy.id}
                      onDelete={() => setReasonTarget({ kind: "delete", policy })}
                      onEnd={() => setReasonTarget({ kind: "end", policy })}
                      onReplace={() => setFormTarget(policy)}
                      policy={policy}
                    />
                  ))}
                </div>
              )
            }
          </ResourceView>
        </>
      )}

      <PolicyFormModal
        agents={agents.data ?? []}
        onClose={() => setFormTarget(undefined)}
        onSaved={afterChange}
        policy={formTarget ?? null}
        open={formTarget !== undefined}
      />

      <ReasonDialog
        labels={reasonLabelsFor(t, reasonTarget)}
        onClose={() => setReasonTarget(null)}
        onSubmit={async (reason) => {
          if (!reasonTarget) return;
          if (reasonTarget.kind === "reverse") {
            const { accrual } = reasonTarget;
            await api.post(`/admin/commissions/${accrual.id}/reverse`, { reason });
            await afterChange(t("admin.commissions.dialog.reverseSuccess", { name: accrual.reseller.businessName }));
            return;
          }
          const { policy } = reasonTarget;
          if (reasonTarget.kind === "end") {
            await api.post(`/admin/commission-policies/${policy.id}/end`, { reason });
            await afterChange(t("admin.commissions.dialog.endSuccess", { name: policy.name }));
            return;
          }
          // `api.del` cannot carry a body, and the reason has to reach the audit log.
          await api.request(`/admin/commission-policies/${policy.id}`, {
            method: "DELETE",
            body: JSON.stringify({ reason }),
          });
          await afterChange(t("admin.commissions.dialog.deleteSuccess", { name: policy.name }));
        }}
        open={reasonTarget !== null}
        summary={
          reasonTarget ? (
            reasonTarget.kind === "reverse" ? (
              <AccrualSummary accrual={reasonTarget.accrual} />
            ) : (
              <PolicySummary policy={reasonTarget.policy} />
            )
          ) : null
        }
        tone={reasonTarget?.kind === "reverse" || reasonTarget?.kind === "delete" ? "danger" : "primary"}
      />
    </div>
  );
}

/** The dialog must describe whichever action was picked, and only that one. */
function reasonLabelsFor(
  t: Translator,
  target: { kind: "end" | "delete"; policy: PolicyRow } | { kind: "reverse"; accrual: AccrualRow } | null,
): ReasonDialogLabels {
  const shared = {
    reasonLabel: t("admin.commissions.dialog.reason"),
    reasonPlaceholder: t("admin.commissions.dialog.reasonPlaceholder"),
    reasonHint: t("admin.commissions.dialog.reasonHint"),
    tooShort: t("admin.commissions.dialog.reasonTooShort"),
    cancel: t("admin.commissions.dialog.cancel"),
    confirm: t("admin.commissions.dialog.confirm"),
  };

  if (target?.kind === "reverse") {
    return {
      title: t("admin.commissions.dialog.reverseTitle"),
      note: t("admin.commissions.dialog.reverseNote"),
      ...shared,
    };
  }
  if (target?.kind === "delete") {
    return {
      title: t("admin.commissions.dialog.deleteTitle", { name: target.policy.name }),
      note: t("admin.commissions.dialog.deleteNote"),
      ...shared,
    };
  }
  return {
    title: t("admin.commissions.dialog.endTitle", { name: target?.policy.name ?? "" }),
    note: t("admin.commissions.dialog.endNote"),
    ...shared,
  };
}

/* ─────────────────────────────── Pieces ─────────────────────────────── */

/** Pill in a filter row; the count is always the unfiltered total for that value. */
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

function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="flex flex-col items-center gap-1.5 py-6">
      <span className="text-sm font-bold text-advo-text">{text}</span>
      {hint ? <span className="max-w-md text-center text-xs text-advo-muted">{hint}</span> : null}
    </span>
  );
}

function AccrualTableRow({ accrual, onReverse }: { accrual: AccrualRow; onReverse: () => void }) {
  const { t } = useI18n();
  const owes = outstanding(accrual);
  const snapshot = accrual.policySnapshot;
  const reserved = BigInt(accrual.reservedTzs) > 0n;

  return (
    <tr className="border-b border-[var(--advo-border)] last:border-b-0 hover:bg-advo-surface-soft/40">
      <Td>
        <Link
          className="font-mono text-[11px] font-bold text-advo-text hover:text-advo-blue"
          href={`/admin/agents/${accrual.agent.id}`}
        >
          {accrual.agent.referralCode}
        </Link>
      </Td>
      <Td>
        <Link
          className="font-semibold text-advo-text hover:text-advo-blue"
          href={`/admin/resellers/${accrual.reseller.id}`}
        >
          {accrual.reseller.businessName}
        </Link>
      </Td>
      <Td>
        <span className="text-xs font-semibold text-advo-text">{t(TRIGGER_KEY[accrual.trigger])}</span>
        {snapshot.name ? (
          <p className="text-[10px] text-advo-muted">
            {snapshot.name}
            {snapshot.planCode ? ` · ${snapshot.planCode}` : ""}
          </p>
        ) : null}
      </Td>
      <Td className="whitespace-nowrap">
        <span className="font-semibold tabular-nums">{formatTzs(accrual.eligibleBaseTzs)}</span>
        <p className="text-[10px] text-advo-muted">
          {t("admin.commissions.accruals.rateOf", {
            rate: rateLabel({
              mode: snapshot.mode ?? "PERCENTAGE",
              fixedTzs: snapshot.fixedTzs ?? null,
              basisPoints: snapshot.basisPoints ?? 0,
            }),
            base: formatTzs(accrual.eligibleBaseTzs),
          })}
        </p>
      </Td>
      <Td className="whitespace-nowrap">
        <span className="font-black tabular-nums">{formatTzs(accrual.amountTzs)}</span>
        {owes > 0n && owes !== BigInt(accrual.amountTzs) ? (
          <p className="text-[10px] text-advo-muted">
            {t("admin.commissions.accruals.outstanding", { amount: formatTzs(owes) })}
          </p>
        ) : null}
      </Td>
      <Td>
        <StatusChip tone={STATE_TONE[accrual.state] ?? "default"}>{t(STATE_KEY[accrual.state as AccrualState] ?? "admin.commissions.state.PAID")}</StatusChip>
        {accrual.reason ? <p className="mt-1 max-w-40 text-[10px] text-advo-muted">{accrual.reason}</p> : null}
        {reserved ? (
          <p className="mt-1 text-[10px] font-semibold text-[#b45309]">
            {t("admin.commissions.accruals.reserved")}
          </p>
        ) : null}
      </Td>
      <Td className="whitespace-nowrap">
        <span className="text-xs text-advo-muted">{formatDateTime(accrual.availableAt)}</span>
        <p className="text-[10px] text-advo-muted">
          {t("admin.commissions.accruals.created")} {formatDateTime(accrual.createdAt)}
        </p>
      </Td>
      <Td>
        {canReverse(accrual) ? (
          <Button onPress={onReverse} size="sm" type="button" variant="danger-soft">
            <Ban className="size-3.5" />
            {t("admin.commissions.accruals.action.reverse")}
          </Button>
        ) : (
          <span className="text-xs text-advo-muted">—</span>
        )}
      </Td>
    </tr>
  );
}

/** One policy: the rate up front, scope and usage underneath, actions last. */
function PolicyCard({
  policy,
  onReplace,
  onEnd,
  onDelete,
}: {
  policy: PolicyRow;
  onReplace: () => void;
  onEnd: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const status = policyStatus(policy);
  const scheduled = status === "SCHEDULED";
  const blocked = policy.accrualCount > 0;

  return (
    <Card className="group flex flex-col gap-4 p-5 shadow-advo-card ring-1 ring-advo-border/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-advo-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SoftIcon size="lg" tone={status === "OPEN" ? "gold" : status === "SCHEDULED" ? "accent" : "warning"}>
            {policy.mode === "FIXED" ? <Coins /> : <Percent />}
          </SoftIcon>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-black tracking-tight text-advo-text">{policy.name}</h3>
              {policy.isDemo ? (
                <StatusChip tone="warning">{t("admin.commissions.policies.badge.demo")}</StatusChip>
              ) : null}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-advo-muted">
              <span className="font-semibold">
                {policy.agent
                  ? t("admin.commissions.policies.scope.agent", { code: policy.agent.referralCode })
                  : t("admin.commissions.policies.scope.allAgents")}
              </span>
              <span>·</span>
              <span>{t(TRIGGER_KEY[policy.trigger])}</span>
            </p>
          </div>
        </div>
        <StatusChip size="md" tone={STATUS_TONE[status]}>
          {t(STATUS_KEY[status])}
        </StatusChip>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[var(--advo-border)] bg-gradient-to-br from-white to-[var(--advo-gold-soft)] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
            {t("admin.commissions.policies.rate")}
          </p>
          <p className="mt-0.5 text-xl font-black tracking-tight text-advo-text tabular-nums">{rateLabel(policy)}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-advo-muted">
          <Timer className="size-3" />
          {policy.holdDays === 0
            ? t("admin.commissions.policies.holdDaysZero")
            : t("admin.commissions.policies.holdDays", { days: policy.holdDays })}
        </span>
      </div>

      <ul className="grid gap-1.5 text-[11px] text-advo-muted sm:grid-cols-2">
        <li className="flex items-center gap-1.5">
          <Coins className="size-3 shrink-0" />
          {policy.maxPerInvoiceTzs
            ? t("admin.commissions.policies.cap", { amount: formatTzs(policy.maxPerInvoiceTzs) })
            : t("admin.commissions.policies.noCap")}
        </li>
        <li className="flex items-center gap-1.5">
          <Repeat className="size-3 shrink-0" />
          {policy.referralEligibilityDays
            ? t("admin.commissions.policies.referralWindowDays", { days: policy.referralEligibilityDays })
            : t("admin.commissions.policies.referralWindowNone")}
        </li>
        <li className="flex items-center gap-1.5">
          <Receipt className="size-3 shrink-0" />
          {policy.eligiblePlanCodes.length > 0
            ? policy.eligiblePlanCodes.join(", ")
            : t("admin.commissions.policies.plansAll")}
        </li>
        <li className="flex items-center gap-1.5">
          <CalendarClock className="size-3 shrink-0" />
          {t("admin.commissions.policies.effectiveFrom", { date: formatDateTime(policy.effectiveFrom) })}
          {policy.effectiveTo
            ? ` · ${t("admin.commissions.policies.effectiveTo", { date: formatDateTime(policy.effectiveTo) })}`
            : ""}
        </li>
      </ul>

      <div className="grid grid-cols-3 gap-2">
        <Mini label={t("admin.commissions.policies.accruals")} value={policy.accrualCount} />
        <Mini label={t("admin.commissions.policies.credit")} value={formatTzs(policy.accruedTzs)} />
        <Mini label={t("admin.commissions.policies.paidOut")} value={formatTzs(policy.paidTzs)} />
      </div>

      {blocked ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-advo-warning-soft px-3 py-2 text-[11px] font-semibold text-[#b45309]">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {t("admin.commissions.policies.deleteBlocked", { count: policy.accrualCount })}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--advo-border)] pt-3.5">
        <Button onPress={onReplace} size="sm" type="button" variant="primary">
          <Repeat className="size-3.5" />
          {t("admin.commissions.policies.action.replace")}
        </Button>
        {status !== "ENDED" ? (
          <Button isDisabled={scheduled} onPress={onEnd} size="sm" type="button" variant="outline">
            <Ban className="size-3.5" />
            {t("admin.commissions.policies.action.end")}
          </Button>
        ) : null}
        <Button
          className="ml-auto"
          isDisabled={blocked}
          onPress={onDelete}
          size="sm"
          type="button"
          variant="danger-soft"
        >
          <Trash2 className="size-3.5" />
          {t("admin.commissions.policies.action.delete")}
        </Button>
      </div>

      {scheduled ? (
        <p className="text-[11px] text-advo-muted">{t("admin.commissions.policies.endBlocked")}</p>
      ) : blocked ? (
        <p className="text-[11px] text-advo-muted">{t("admin.commissions.policies.endsNow")}</p>
      ) : null}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-3 py-2">
      <p className="truncate text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-advo-text tabular-nums">{value}</p>
    </div>
  );
}

/** Record preview shown inside the reason dialog before a policy action. */
function PolicySummary({ policy }: { policy: PolicyRow }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-3.5 py-2.5">
      <div>
        <p className="text-sm font-black text-advo-text">{policy.name}</p>
        <p className="text-[10px] text-advo-muted">
          {policy.agent
            ? t("admin.commissions.policies.scope.agent", { code: policy.agent.referralCode })
            : t("admin.commissions.policies.scope.allAgents")}
          {" · "}
          {t(TRIGGER_KEY[policy.trigger])}
        </p>
      </div>
      <p className="text-sm font-bold text-advo-text tabular-nums">{rateLabel(policy)}</p>
    </div>
  );
}

/** Record preview shown inside the reason dialog before a reversal. */
function AccrualSummary({ accrual }: { accrual: AccrualRow }) {
  const { t } = useI18n();
  const owes = outstanding(accrual);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-3.5 py-2.5">
      <div>
        <p className="text-sm font-black text-advo-text">{accrual.reseller.businessName}</p>
        <p className="font-mono text-[10px] text-advo-muted">{accrual.agent.referralCode}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-advo-text tabular-nums">{formatTzs(accrual.amountTzs)}</p>
        {owes !== BigInt(accrual.amountTzs) ? (
          <p className="text-[10px] text-advo-muted">
            {t("admin.commissions.accruals.outstanding", { amount: formatTzs(owes) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ────────────────────────── Create / replace modal ────────────────────────── */

const POLICY_FORM_STEPS = ["identity", "rate", "eligibility", "launch"] as const;
type PolicyFormStep = (typeof POLICY_FORM_STEPS)[number];

const POLICY_STEP_LABEL: Record<
  PolicyFormStep,
  | "admin.commissions.form.step.identity"
  | "admin.commissions.form.step.rate"
  | "admin.commissions.form.step.eligibility"
  | "admin.commissions.form.step.launch"
> = {
  identity: "admin.commissions.form.step.identity",
  rate: "admin.commissions.form.step.rate",
  eligibility: "admin.commissions.form.step.eligibility",
  launch: "admin.commissions.form.step.launch",
};

const POLICY_STEP_LEAD: Record<
  PolicyFormStep,
  | "admin.commissions.form.step.identityLead"
  | "admin.commissions.form.step.rateLead"
  | "admin.commissions.form.step.eligibilityLead"
  | "admin.commissions.form.step.launchLead"
> = {
  identity: "admin.commissions.form.step.identityLead",
  rate: "admin.commissions.form.step.rateLead",
  eligibility: "admin.commissions.form.step.eligibilityLead",
  launch: "admin.commissions.form.step.launchLead",
};

type PolicyFormValues = {
  name: string;
  agentId: string;
  trigger: Trigger;
  planCodes: string;
  referralEligibilityDays: string;
  holdDays: string;
  effectiveFrom: string;
  isDemo: boolean;
};

function policyFormValuesFrom(policy: PolicyRow | null): PolicyFormValues {
  return {
    name: policy?.name ?? "",
    agentId: policy?.agentId ?? "",
    trigger: policy?.trigger ?? "FIRST_SUBSCRIPTION_PAYMENT",
    planCodes: policy?.eligiblePlanCodes.join(", ") ?? "",
    referralEligibilityDays: policy?.referralEligibilityDays != null ? String(policy.referralEligibilityDays) : "",
    holdDays: String(policy?.holdDays ?? 0),
    effectiveFrom: "",
    isDemo: policy?.isDemo ?? false,
  };
}

/**
 * One modal for both create and replace — four short light steps so fields stay
 * readable inside the dark admin shell.
 *
 * `policy === null` creates from scratch; a row means "replace this policy", which
 * prefills the scope and rate and starts the successor now. Replacing is how a rate
 * changes — the old policy keeps its history, so past accruals stay honest.
 */
function PolicyFormModal({
  open,
  policy,
  agents,
  onClose,
  onSaved,
}: {
  open: boolean;
  policy: PolicyRow | null;
  agents: Array<{ id: string; referralCode: string }>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });

  const [step, setStep] = useState<PolicyFormStep>("identity");
  const [stepError, setStepError] = useState<string | null>(null);
  const [values, setValues] = useState<PolicyFormValues>(() => policyFormValuesFrom(policy));
  const [mode, setMode] = useState<Mode>("PERCENTAGE");
  const [percent, setPercent] = useState("");
  const [fixed, setFixed] = useState("");
  const [cap, setCap] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Every open starts clean, and a replace prefills the rate being replaced.
  useEffect(() => {
    if (!open) return;
    setDone(false);
    setError(null);
    setStepError(null);
    setStep("identity");
    setValues(policyFormValuesFrom(policy));
    setMode(policy?.mode ?? "PERCENTAGE");
    setPercent(policy?.mode === "PERCENTAGE" && policy.basisPoints ? String(policy.basisPoints / 100) : "");
    setFixed(policy?.mode === "FIXED" && policy.fixedTzs ? policy.fixedTzs : "");
    setCap(policy?.maxPerInvoiceTzs ?? "");
  }, [open, policy]);

  /** Mirrors `calculateCommission` so the preview cannot promise a different number. */
  const preview = useMemo(() => {
    const sample = 10_000;
    const parsed = Number(mode === "PERCENTAGE" ? percent : fixed);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    let amount = mode === "PERCENTAGE" ? Math.floor((sample * Math.round(parsed * 100)) / 10_000) : Math.floor(parsed);
    const capValue = Number(cap);
    let cappedAt: number | null = null;
    if (Number.isFinite(capValue) && capValue > 0 && amount > capValue) {
      amount = Math.floor(capValue);
      cappedAt = Math.floor(capValue);
    }
    if (amount > sample) amount = sample;
    return { amount, base: sample, cappedAt };
  }, [mode, percent, fixed, cap]);

  function patch<K extends keyof PolicyFormValues>(key: K, value: PolicyFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setStepError(null);
  }

  function validateStep(current: PolicyFormStep): string | null {
    if (current === "identity") {
      if (!values.name.trim()) return t("admin.commissions.form.name");
      return null;
    }
    if (current === "rate") {
      if (mode === "PERCENTAGE") {
        const bps = Math.round(Number(percent) * 100);
        if (!Number.isFinite(bps) || bps < 1) return t("admin.commissions.form.percent");
      } else if (!fixed || Number(fixed) < 1) {
        return t("admin.commissions.form.fixedTzs");
      }
      return null;
    }
    return null;
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setStepError(message);
      return;
    }
    const index = POLICY_FORM_STEPS.indexOf(step);
    if (index < POLICY_FORM_STEPS.length - 1) {
      setStepError(null);
      setStep(POLICY_FORM_STEPS[index + 1]!);
    }
  }

  function goBack() {
    const index = POLICY_FORM_STEPS.indexOf(step);
    if (index > 0) {
      setStepError(null);
      setStep(POLICY_FORM_STEPS[index - 1]!);
    }
  }

  async function save() {
    const message = validateStep("rate");
    if (message) {
      setStep("rate");
      setStepError(message);
      return;
    }
    const bps = mode === "PERCENTAGE" ? Math.round(Number(percent) * 100) : undefined;
    setPending(true);
    setError(null);
    try {
      await api.post("/admin/commission-policies", {
        name: values.name.trim(),
        agentId: values.agentId || undefined,
        trigger: values.trigger,
        mode,
        // Use controlled state — the fixed Input previously had no `name`, so FormData
        // silently dropped FIXED rates.
        fixedTzs: mode === "FIXED" ? fixed : undefined,
        basisPoints: bps,
        eligiblePlanCodes: values.planCodes
          ? values.planCodes.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        referralEligibilityDays: toInt(values.referralEligibilityDays),
        holdDays: toInt(values.holdDays) ?? 0,
        maxPerInvoiceTzs: cap || undefined,
        effectiveFrom: values.effectiveFrom
          ? new Date(values.effectiveFrom).toISOString()
          : new Date().toISOString(),
        isDemo: values.isDemo,
      });
      await onSaved(
        policy ? t("admin.commissions.form.successReplace") : t("admin.commissions.form.successCreate"),
      );
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function close() {
    setDone(false);
    setError(null);
    setStepError(null);
    setStep("identity");
    onClose();
  }

  const title = policy
    ? t("admin.commissions.form.titleReplace", { name: policy.name })
    : t("admin.commissions.form.titleCreate");
  const stepIndex = POLICY_FORM_STEPS.indexOf(step);
  const progressPct = (stepIndex / (POLICY_FORM_STEPS.length - 1)) * 100;
  const lightSelect =
    "border border-[#DFE5EC] !bg-white !text-[#18212F] shadow-none hover:!bg-white focus:!bg-white focus:ring-2 focus:ring-[#1B5EA4]/20";

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="max-h-[92vh] overflow-hidden !bg-white !text-[#18212F] [color-scheme:light]">
            <Modal.Header className="relative overflow-hidden !bg-white border-b border-[#DFE5EC] pb-4">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1.5"
                style={{ background: "linear-gradient(90deg, #1B5EA4 0%, #FBA102 50%, #F16304 100%)" }}
              />
              <div className="space-y-1 pt-1">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-[#1B5EA4]/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[#1B5EA4] uppercase">
                  <Sparkles className="size-3 text-[#FBA102]" />
                  {t("admin.commissions.form.step.of", { current: stepIndex + 1, total: POLICY_FORM_STEPS.length })}
                </p>
                <Modal.Heading className="!text-xl font-black tracking-tight !text-[#18212F]">{title}</Modal.Heading>
                <p className="text-xs leading-relaxed text-[#526174]">
                  {policy
                    ? t("admin.commissions.form.descriptionReplace")
                    : t("admin.commissions.form.descriptionCreate")}
                </p>
              </div>
            </Modal.Header>
            <Modal.Body className="overflow-y-auto !bg-white">
              {done ? (
                <div className="space-y-4 py-2">
                  <Notice tone="success">
                    {policy
                      ? t("admin.commissions.form.successReplace")
                      : t("admin.commissions.form.successCreate")}
                  </Notice>
                  <div className="flex justify-end border-t border-[#DFE5EC] pt-4">
                    <Button onPress={close} type="button" variant="primary">
                      {t("admin.commissions.form.done")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5" key={policy?.id ?? "create"}>
                  <div className="rounded-2xl border border-[#DFE5EC] bg-[#F7F9FC] p-4">
                    <div className="relative flex items-center justify-between">
                      <div className="absolute top-4 right-6 left-6 -z-0 h-0.5 bg-[#DFE5EC]" />
                      <div
                        className="absolute top-4 left-6 -z-0 h-0.5 bg-[#1B5EA4] transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                      {POLICY_FORM_STEPS.map((key, index) => {
                        const active = index === stepIndex;
                        const complete = index < stepIndex;
                        const last = index === POLICY_FORM_STEPS.length - 1;
                        return (
                          <div className="relative z-10 flex flex-col items-center" key={key}>
                            <div
                              className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                                complete
                                  ? "bg-[#1B5EA4] text-white shadow-md ring-4 ring-blue-50"
                                  : active && last
                                    ? "text-[#111213] shadow-md ring-4 ring-amber-50"
                                    : active
                                      ? "bg-[#1B5EA4] text-white shadow-md ring-4 ring-blue-50"
                                      : "bg-slate-200 text-slate-500"
                              }`}
                              style={
                                active && last
                                  ? { background: "linear-gradient(135deg, #FBA102 0%, #F16304 100%)" }
                                  : undefined
                              }
                            >
                              {complete ? <CheckCircle2 className="size-4 text-white" /> : index + 1}
                            </div>
                            <span
                              className={`mt-1.5 text-[10px] font-bold ${
                                active ? (last ? "text-[#F16304]" : "text-[#1B5EA4]") : "text-[#18212F]"
                              }`}
                            >
                              {t(POLICY_STEP_LABEL[key])}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-black tracking-tight text-[#18212F]">{t(POLICY_STEP_LABEL[step])}</h3>
                    <p className="text-xs text-[#526174]">{t(POLICY_STEP_LEAD[step])}</p>
                  </div>

                  {step === "identity" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 grid gap-4 duration-200 sm:grid-cols-2">
                      <PolicySmartField
                        icon={<Tag />}
                        label={t("admin.commissions.form.name")}
                        onChange={(v) => patch("name", v)}
                        placeholder={t("admin.commissions.form.namePlaceholder")}
                        value={values.name}
                      />
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold tracking-wide text-[#18212F] uppercase">
                          {t("admin.commissions.form.agent")}
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#526174]">
                            <User className="size-4" />
                          </div>
                          <AdvoSelect
                            className={`pl-10 ${lightSelect}`}
                            onChange={(e) => patch("agentId", e.target.value)}
                            value={values.agentId}
                          >
                            <option value="">{t("admin.commissions.form.agentAll")}</option>
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.referralCode}
                              </option>
                            ))}
                          </AdvoSelect>
                        </div>
                        <p className="text-[11px] leading-snug text-[#526174]">{t("admin.commissions.form.agentHint")}</p>
                      </div>
                    </div>
                  ) : null}

                  {step === "rate" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold tracking-wide text-[#18212F] uppercase">
                            {t("admin.commissions.form.trigger")}
                          </label>
                          <AdvoSelect
                            className={lightSelect}
                            onChange={(e) => patch("trigger", e.target.value as Trigger)}
                            value={values.trigger}
                          >
                            <option value="FIRST_SUBSCRIPTION_PAYMENT">
                              {t("admin.commissions.form.triggerFirst")}
                            </option>
                            <option value="SUBSCRIPTION_RENEWAL">{t("admin.commissions.form.triggerRenewal")}</option>
                          </AdvoSelect>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold tracking-wide text-[#18212F] uppercase">
                            {t("admin.commissions.form.mode")}
                          </label>
                          <AdvoSelect
                            className={lightSelect}
                            onChange={(e) => setMode(e.target.value as Mode)}
                            value={mode}
                          >
                            <option value="PERCENTAGE">{t("admin.commissions.form.mode.PERCENTAGE")}</option>
                            <option value="FIXED">{t("admin.commissions.form.mode.FIXED")}</option>
                          </AdvoSelect>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {mode === "PERCENTAGE" ? (
                          <PolicySmartField
                            hint={t("admin.commissions.form.percentHint")}
                            icon={<Percent />}
                            label={t("admin.commissions.form.percent")}
                            min={0.01}
                            onChange={setPercent}
                            placeholder="10"
                            step={0.01}
                            type="number"
                            value={percent}
                          />
                        ) : (
                          <PolicySmartField
                            hint={t("admin.commissions.form.fixedTzsHint")}
                            icon={<Coins />}
                            label={t("admin.commissions.form.fixedTzs")}
                            min={1}
                            onChange={setFixed}
                            type="number"
                            value={fixed}
                          />
                        )}
                        <PolicySmartField
                          hint={t("admin.commissions.form.capHint")}
                          icon={<Wallet />}
                          label={t("admin.commissions.form.cap")}
                          min={1}
                          onChange={setCap}
                          type="number"
                          value={cap}
                        />
                      </div>
                      {preview ? (
                        <div className="overflow-hidden rounded-2xl border border-[#DFE5EC] bg-gradient-to-br from-[#F7F9FC] via-white to-[#FFF8EE] p-4">
                          <p className="text-[10px] font-bold tracking-wider text-[#526174] uppercase">
                            {t("admin.commissions.form.previewTitle")}
                          </p>
                          <p className="mt-1 text-sm font-bold text-[#18212F]">
                            {t("admin.commissions.form.preview", {
                              amount: formatTzs(preview.amount),
                              base: formatTzs(preview.base),
                            })}
                          </p>
                          {preview.cappedAt ? (
                            <p className="mt-0.5 text-[11px] text-[#526174]">
                              {t("admin.commissions.form.previewCap", { amount: formatTzs(preview.cappedAt) })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {step === "eligibility" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 grid gap-4 duration-200 sm:grid-cols-2">
                      <PolicySmartField
                        hint={t("admin.commissions.form.planCodesHint")}
                        icon={<Receipt />}
                        label={t("admin.commissions.form.planCodes")}
                        onChange={(v) => patch("planCodes", v)}
                        value={values.planCodes}
                      />
                      <PolicySmartField
                        hint={t("admin.commissions.form.referralDaysHint")}
                        icon={<CalendarClock />}
                        label={t("admin.commissions.form.referralDays")}
                        min={1}
                        onChange={(v) => patch("referralEligibilityDays", v)}
                        type="number"
                        value={values.referralEligibilityDays}
                      />
                    </div>
                  ) : null}

                  {step === "launch" ? (
                    <div className="animate-in fade-in slide-in-from-right-4 space-y-4 duration-200">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <PolicySmartField
                          hint={t("admin.commissions.form.holdDaysHint")}
                          icon={<Timer />}
                          label={t("admin.commissions.form.holdDays")}
                          min={0}
                          onChange={(v) => patch("holdDays", v)}
                          type="number"
                          value={values.holdDays}
                        />
                        <PolicySmartField
                          hint={t("admin.commissions.form.effectiveFromHint")}
                          icon={<CalendarClock />}
                          label={t("admin.commissions.form.effectiveFrom")}
                          onChange={(v) => patch("effectiveFrom", v)}
                          type="datetime-local"
                          value={values.effectiveFrom}
                        />
                      </div>
                      <button
                        aria-pressed={values.isDemo}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          values.isDemo
                            ? "border-[#1B5EA4]/30 bg-[#1B5EA4]/8 text-[#18212F]"
                            : "border-[#DFE5EC] bg-[#F7F9FC] text-[#526174] hover:border-[#1B5EA4]/20"
                        }`}
                        onClick={() => patch("isDemo", !values.isDemo)}
                        type="button"
                      >
                        <span>
                          <span className="block text-sm font-semibold">{t("admin.commissions.form.isDemo")}</span>
                          <span className="mt-0.5 block text-[11px] text-[#526174]">
                            {t("admin.commissions.form.isDemoHint")}
                          </span>
                        </span>
                        <span
                          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                            values.isDemo ? "bg-[#1B5EA4]" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition ${
                              values.isDemo ? "translate-x-4" : ""
                            }`}
                          />
                        </span>
                      </button>
                      <Notice tone="accent">{t("admin.commissions.form.previewCloses")}</Notice>
                    </div>
                  ) : null}

                  {stepError ? <Notice tone="danger">{stepError}</Notice> : null}
                  {error ? <Notice tone="danger">{error}</Notice> : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#DFE5EC] pt-4">
                    <div>
                      {stepIndex > 0 ? (
                        <Button onPress={goBack} type="button" variant="ghost">
                          <ChevronLeft className="size-4" />
                          {t("admin.commissions.form.step.back")}
                        </Button>
                      ) : (
                        <Button onPress={close} type="button" variant="ghost">
                          {t("admin.commissions.form.cancel")}
                        </Button>
                      )}
                    </div>
                    <div>
                      {step === "launch" ? (
                        <Button isDisabled={pending} onPress={() => void save()} type="button" variant="primary">
                          {policy ? <Repeat className="size-4" /> : <Plus className="size-4" />}
                          {pending
                            ? "…"
                            : policy
                              ? t("admin.commissions.form.submitReplace")
                              : t("admin.commissions.form.submitCreate")}
                        </Button>
                      ) : (
                        <Button onPress={goNext} type="button" variant="primary">
                          {t("admin.commissions.form.step.next")}
                          <ArrowRight className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.CloseTrigger aria-label={t("admin.commissions.form.cancel")} />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** Light labelled input that stays readable inside the dark admin shell. */
function PolicySmartField({
  label,
  hint,
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  step,
}: {
  label: string;
  hint?: string;
  icon: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "datetime-local";
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold tracking-wide text-[#18212F] uppercase">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#526174] [&_svg]:size-4">
          {icon}
        </div>
        <input
          className="w-full rounded-field border border-[#DFE5EC] !bg-[#F7F9FC] py-3 pr-3.5 pl-10 text-xs !text-[#18212F] outline-none transition focus:border-[#1B5EA4] focus:!bg-white focus:ring-2 focus:ring-[#1B5EA4]/20"
          min={min}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          step={step}
          type={type}
          value={value}
        />
      </div>
      {hint ? <p className="text-[11px] leading-snug text-[#526174]">{hint}</p> : null}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase" scope="col">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-5 py-2.5 align-top text-advo-text ${className}`}>{children}</td>;
}
