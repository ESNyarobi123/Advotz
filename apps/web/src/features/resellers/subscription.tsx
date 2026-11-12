"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { planFeaturesWithDefaults } from "@advo/contracts";
import { Button, Card, Modal, useOverlayState } from "@heroui/react";
import { Notice, StatusChip, statusTone } from "@advo/ui";
import { Field, PageHero, ResourceView } from "@/features/common/components";
import { useSessionUser } from "@/features/shell/DashboardShell";
import type { MessageKey } from "@advo/i18n";
import { useI18n, type I18n } from "@/lib/i18n";
import { api, newIdempotencyKey } from "@/lib/api";
import { formValues, useAction, useResource } from "@/lib/hooks";
import {
  Crown,
  Info,
  Sparkles,
  Check,
  Smartphone,
  Search,
  X,
  Clock,
  Calendar,
  Receipt,
  CheckCircle2,
  MapPin,
  Router,
  Package,
  AlertTriangle,
  Copy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  PlanDetailDrawer,
  capacityOf,
  planHighlights,
  type ResellerPlan as Plan,
  type PlanCapacity,
} from "./subscription-plan-drawer";
import { PlanCatalog, buildCatalog } from "./plan-catalog";

type Invoice = {
  id: string;
  amountTzs: string;
  status: string;
  plan: { name?: string };
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
  payment: { state: string; lastError: string | null } | null;
};

type SubscriptionView = {
  state: string;
  plan: Plan | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialUsed: boolean;
  invoices: Invoice[];
};

type InvoiceFilter = "ALL" | "PAID" | "OPEN" | "VOID";

const PAYMENT_ATTEMPT_LABELS: Record<string, string> = {
  CREATED: "Created",
  DISPATCHING: "Dispatching",
  PENDING: "Pending",
  UNKNOWN: "Unknown",
  COMPLETED: "Completed",
  FAILED: "Failed",
  VOIDED: "Voided",
  EXPIRED: "Expired",
  NEEDS_REVIEW: "Needs review",
};

function formatCap(t: I18n["t"], value: number | null): string {
  return value === null ? t("reseller.subscription.unlimited") : String(value);
}

function subscriptionStateLabel(t: I18n["t"], state: string): string {
  const key = `reseller.subscription.state.${state}` as MessageKey;
  const translated = t(key);
  return translated === key ? state.replace(/_/g, " ") : translated;
}

function invoiceStatusLabel(t: I18n["t"], status: string): string {
  const key = `reseller.subscription.invoice.${status}` as MessageKey;
  const translated = t(key);
  return translated === key ? status.replace(/_/g, " ") : translated;
}

function invoiceTone(
  status: string,
): "success" | "danger" | "warning" | "default" {
  if (status === "PAID") return "success";
  if (status === "VOID") return "danger";
  return "warning";
}

export function ResellerSubscriptionScreen() {
  const { t } = useI18n();
  const user = useSessionUser();
  const sub = useResource<SubscriptionView>("/reseller/subscription");
  const plans = useResource<Plan[]>("/reseller/plans");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [detail, setDetail] = useState<Plan | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("ALL");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const trial = useAction(async (planId: string) => {
    await api.post("/reseller/subscription/trial", { planId });
  }, sub.reload);

  /** Opens the checkout dialog for a plan; the dialog owns the form and the wait. */
  function choosePlan(plan: Plan) {
    setDetail(null);
    setSelected(plan);
  }

  const currentSub = sub.data;
  const capacity: PlanCapacity | null = currentSub?.plan
    ? capacityOf(currentSub.plan)
    : null;

  const trialPlan =
    (plans.data ?? []).find((p) => p.trialEligible && (p.trialDays ?? 0) > 0) ??
    null;
  const showTrialBanner =
    trialPlan !== null && !currentSub?.plan && !currentSub?.trialUsed;

  const invoices = currentSub?.invoices ?? [];
  const paidInvoices = invoices.filter((i) => i.status === "PAID");
  const openInvoices = invoices.filter((i) => i.status === "OPEN");
  const totalPaid = paidInvoices.reduce(
    (acc, i) => acc + (Number(i.amountTzs) || 0),
    0,
  );

  const invoiceFilters = useMemo(() => {
    const count = (status: InvoiceFilter) =>
      status === "ALL"
        ? invoices.length
        : invoices.filter((i) => i.status === status).length;
    return [
      {
        value: "ALL" as const,
        label: t("reseller.filter.all"),
        count: count("ALL"),
      },
      {
        value: "PAID" as const,
        label: t("reseller.subscription.invoices.filter.paid"),
        count: count("PAID"),
      },
      {
        value: "OPEN" as const,
        label: t("reseller.subscription.invoices.filter.open"),
        count: count("OPEN"),
      },
      {
        value: "VOID" as const,
        label: t("reseller.subscription.invoices.filter.void"),
        count: count("VOID"),
      },
    ];
  }, [invoices, t]);

  const term = invoiceQuery.trim().toLowerCase();
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((i) => {
        if (invoiceFilter !== "ALL" && i.status !== invoiceFilter) return false;
        if (!term) return true;
        const hay = [i.plan?.name ?? "", i.id, i.payment?.state ?? "", i.status]
          .join(" ")
          .toLowerCase();
        return hay.includes(term);
      }),
    [invoices, invoiceFilter, term],
  );

  function copyRef(id: string) {
    void navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        eyebrow={t("reseller.subscription.badge")}
        title={t("nav.subscription")}
        description={t("reseller.subscription.subtitle")}
        icon={<Crown />}
        iconTone="accent"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-advo-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-advo-muted">
            {t("reseller.subscription.meta")}
          </span>
        }
      />

      <ResourceView resource={sub}>
        {(s) => (
          <div className="space-y-4">
            {s.state === "PAST_DUE" ? (
              <Notice tone="warning">
                {t("reseller.subscription.notice.pastDue")}
              </Notice>
            ) : null}
            {s.state === "EXPIRED" ? (
              <Notice tone="danger">
                {t("reseller.subscription.notice.expired")}
              </Notice>
            ) : null}

            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
                <span
                  className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-sm ${
                    s.state === "ACTIVE" || s.state === "TRIALING"
                      ? "bg-advo-blue"
                      : s.state === "PAST_DUE"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                  }`}
                >
                  <Crown className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-black tracking-tight text-advo-text sm:text-lg">
                      {s.plan?.name ?? t("reseller.subscription.noPlan")}
                    </h2>
                    <StatusChip tone={statusTone(s.state)}>
                      {subscriptionStateLabel(t, s.state)}
                    </StatusChip>
                  </div>
                  <p className="mt-1 text-xs text-advo-muted">
                    {s.plan && capacity
                      ? `${formatCap(t, capacity.sites)} ${t("reseller.subscription.plans.sites").toLowerCase()} · ${formatCap(t, capacity.devices)} ${t("reseller.subscription.plans.devices").toLowerCase()} · ${formatCap(t, capacity.wifiPackagesPerSite)} ${t("reseller.subscription.plans.packages").toLowerCase()}`
                      : t("reseller.subscription.noPlanHint")}
                  </p>
                </div>
                <div className="hidden shrink-0 flex-col items-end border-l border-advo-border/60 pl-4 sm:flex">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t("reseller.subscription.period")}
                  </span>
                  <p className="mt-0.5 text-sm font-bold text-advo-text">
                    {s.currentPeriodEnd
                      ? t("reseller.subscription.expires", {
                          date: formatDateTime(s.currentPeriodEnd),
                        })
                      : t("reseller.subscription.notScheduled")}
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                hint={t("reseller.subscription.kpi.planHint")}
                icon={Wallet}
                label={t("reseller.subscription.kpi.plan")}
                tone="blue"
                value={s.plan?.name ?? "—"}
              />
              <KpiCard
                hint={t("reseller.subscription.kpi.sitesHint")}
                icon={MapPin}
                label={t("reseller.subscription.kpi.sites")}
                tone="emerald"
                value={capacity ? formatCap(t, capacity.sites) : "—"}
              />
              <KpiCard
                hint={t("reseller.subscription.kpi.devicesHint")}
                icon={Router}
                label={t("reseller.subscription.kpi.devices")}
                tone="amber"
                value={capacity ? formatCap(t, capacity.devices) : "—"}
              />
              <KpiCard
                hint={t("reseller.subscription.kpi.packagesHint")}
                icon={Package}
                label={t("reseller.subscription.kpi.packages")}
                tone="rose"
                value={
                  capacity ? formatCap(t, capacity.wifiPackagesPerSite) : "—"
                }
              />
            </div>
          </div>
        )}
      </ResourceView>

      {showTrialBanner && trialPlan ? (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-advo-text">
                  {t("reseller.subscription.trial.title", {
                    days: trialPlan.trialDays ?? 0,
                  })}
                </h2>
                <p className="mt-0.5 max-w-xl text-xs text-slate-600">
                  {t("reseller.subscription.trial.body", {
                    plan: trialPlan.name,
                    days: trialPlan.trialDays ?? 0,
                  })}
                </p>
              </div>
            </div>
            <button
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              disabled={trial.pending}
              onClick={() => void trial.run(trialPlan.id)}
              type="button"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {trial.pending
                ? t("reseller.subscription.trial.starting")
                : t("reseller.subscription.trial.cta", {
                    days: trialPlan.trialDays ?? 0,
                  })}
            </button>
          </div>
          {trial.error ? (
            <p className="mt-3 text-xs font-semibold text-red-600">
              {trial.error}
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-black tracking-tight text-advo-text">
            {t("reseller.subscription.plans.title")}
          </h2>
          <p className="text-xs text-advo-muted">
            {t("reseller.subscription.plans.subtitle")}
          </p>
        </div>

        <ResourceView resource={plans}>
          {(rows) => {
            if (rows.length === 0) {
              return (
                <Notice tone="default">
                  {t("reseller.subscription.plans.empty")}
                </Notice>
              );
            }
            const catalog = buildCatalog(rows);
            return (
              <div className="space-y-5">
                {catalog.tiers.length > 0 ? (
                  <PlanCatalog
                    plans={rows}
                    currentPlanId={currentSub?.plan?.id ?? null}
                    trialUsed={Boolean(currentSub?.trialUsed)}
                    trialPending={trial.pending}
                    onChoose={choosePlan}
                    onDetail={setDetail}
                    onTrial={(plan) => void trial.run(plan.id)}
                  />
                ) : null}

                {catalog.other.length > 0 ? (
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-sm font-black tracking-tight text-advo-text">
                        {t("reseller.subscription.catalog.other")}
                      </h3>
                      <p className="text-xs text-advo-muted">
                        {t("reseller.subscription.catalog.otherHint")}
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      {catalog.other.map((p) => {
                        const isSelected = selected?.id === p.id;
                        const features = planFeaturesWithDefaults(p.features);
                        const cap = capacityOf(p);
                        const highlights = planHighlights(features).slice(0, 5);
                        return (
                          <Card
                            key={p.id}
                            className={`group relative flex flex-col justify-between overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-advo-lift ${
                              isSelected
                                ? "border-advo-blue ring-4 ring-advo-blue/10"
                                : "border-advo-border hover:border-slate-300"
                            }`}
                          >
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-advo-blue via-advo-gold to-advo-orange" />

                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="text-base font-black tracking-tight text-advo-text">
                                    {p.name}
                                  </h3>
                                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                                    {p.code}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  {p.isDemo ? (
                                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-advo-gold">
                                      DEMO
                                    </span>
                                  ) : null}
                                  {p.commercialPromise === "ad_free" ? (
                                    <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600">
                                      AD FREE
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-4 flex items-baseline gap-1">
                                <span className="text-2xl font-black tracking-tight text-advo-text tabular-nums">
                                  {formatTzs(p.priceTzs)}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {t("reseller.subscription.plans.perDays", {
                                    days: p.periodDays,
                                  })}
                                </span>
                              </div>

                              {p.trialEligible && p.trialDays ? (
                                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                  <Sparkles className="h-3 w-3" />
                                  {t("reseller.subscription.plans.trialBadge", {
                                    days: p.trialDays,
                                  })}
                                </p>
                              ) : null}

                              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-advo-border/60 pt-4 text-center">
                                <div className="rounded-xl bg-advo-page px-1 py-2">
                                  <div className="truncate text-sm font-extrabold text-advo-text tabular-nums">
                                    {formatCap(t, cap.sites)}
                                  </div>
                                  <span className="text-[10px] font-medium text-slate-500">
                                    {t("reseller.subscription.plans.sites")}
                                  </span>
                                </div>
                                <div className="rounded-xl bg-advo-page px-1 py-2">
                                  <div className="truncate text-sm font-extrabold text-advo-text tabular-nums">
                                    {formatCap(t, cap.devices)}
                                  </div>
                                  <span className="text-[10px] font-medium text-slate-500">
                                    {t("reseller.subscription.plans.devices")}
                                  </span>
                                </div>
                                <div className="rounded-xl bg-advo-page px-1 py-2">
                                  <div className="truncate text-sm font-extrabold text-advo-text tabular-nums">
                                    {formatCap(t, cap.wifiPackagesPerSite)}
                                  </div>
                                  <span className="text-[10px] font-medium text-slate-500">
                                    {t("reseller.subscription.plans.packages")}
                                  </span>
                                </div>
                              </div>

                              <ul className="mt-4 space-y-2 text-xs">
                                {highlights.map((line) => (
                                  <li
                                    className="flex items-start gap-2.5 text-slate-700"
                                    key={line}
                                  >
                                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                      <Check className="h-2.5 w-2.5" />
                                    </div>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="mt-5 space-y-2 border-t border-advo-border/60 pt-4">
                              <button
                                type="button"
                                onClick={() => setDetail(p)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-advo-border bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-advo-page"
                              >
                                <Info className="h-3.5 w-3.5" />
                                {t("reseller.subscription.plans.viewFeatures")}
                              </button>
                              <button
                                type="button"
                                onClick={() => choosePlan(p)}
                                className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold shadow-sm transition ${
                                  isSelected
                                    ? "bg-advo-blue text-white ring-2 ring-advo-blue/30"
                                    : "border border-advo-blue bg-white text-advo-blue hover:bg-advo-blue/10"
                                }`}
                              >
                                {isSelected ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <Smartphone className="h-3.5 w-3.5" />
                                )}
                                {isSelected
                                  ? t("reseller.subscription.plans.selected")
                                  : t("reseller.subscription.plans.select")}
                              </button>

                              {p.trialEligible &&
                              (p.trialDays ?? 0) > 0 &&
                              !currentSub?.trialUsed ? (
                                <button
                                  type="button"
                                  disabled={trial.pending}
                                  onClick={() => void trial.run(p.id)}
                                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-advo-border bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-advo-page"
                                >
                                  <Sparkles className="h-3.5 w-3.5 text-advo-gold" />
                                  {t("reseller.subscription.plans.startTrial", {
                                    days: p.trialDays ?? 0,
                                  })}
                                </button>
                              ) : null}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }}
        </ResourceView>

        {trial.error ? (
          <div className="mt-1">
            <Notice tone="danger">{trial.error}</Notice>
          </div>
        ) : null}
      </section>

      <PlanDetailDrawer
        onChoose={choosePlan}
        onClose={() => setDetail(null)}
        onTrial={(plan) => void trial.run(plan.id)}
        open={detail !== null}
        plan={detail}
        trialPending={trial.pending}
        trialUsed={Boolean(currentSub?.trialUsed)}
      />

      <SubscriptionCheckoutDialog
        onClose={() => setSelected(null)}
        onPaid={() => void sub.reload()}
        open={selected !== null}
        plan={selected}
        user={user}
      />

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black tracking-tight text-advo-text">
              {t("reseller.subscription.invoices.title")}
              <span className="ml-1.5 font-bold text-advo-muted">
                {t("reseller.subscription.invoices.count", {
                  count: filteredInvoices.length,
                })}
              </span>
            </h2>
            <p className="text-xs text-advo-muted">
              {t("reseller.subscription.invoices.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              {formatTzs(totalPaid)} · {paidInvoices.length}
            </span>
            {openInvoices.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                <Clock className="h-3 w-3" />
                {openInvoices.length}{" "}
                {t("reseller.subscription.invoices.filter.open").toLowerCase()}
              </span>
            ) : null}
            <div className="relative min-w-0 w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-advo-muted" />
              <input
                aria-label={t("reseller.subscription.invoices.search")}
                className="w-full rounded-xl border border-advo-border bg-white py-2 pl-8 pr-8 text-xs font-medium text-advo-text transition placeholder:text-advo-muted focus:border-advo-blue focus:outline-none"
                onChange={(e) => setInvoiceQuery(e.target.value)}
                placeholder={t("reseller.subscription.invoices.search")}
                type="search"
                value={invoiceQuery}
              />
              {invoiceQuery ? (
                <button
                  aria-label={t("reseller.subscription.invoices.search.clear")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-advo-muted hover:bg-slate-100"
                  onClick={() => setInvoiceQuery("")}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {invoiceFilters.map((f) => {
            const active = invoiceFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={active}
                onClick={() => setInvoiceFilter(f.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  active
                    ? "border-advo-blue bg-advo-blue text-white shadow-sm"
                    : "border-advo-border bg-white text-advo-muted hover:border-advo-blue/40 hover:text-advo-text"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-advo-page text-advo-text"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        <ResourceView resource={sub}>
          {(s) =>
            s.invoices.length === 0 ? (
              <Card className="border-dashed p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-advo-blue">
                  <Receipt className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-advo-text">
                  {t("reseller.subscription.invoices.empty")}
                </h3>
              </Card>
            ) : filteredInvoices.length === 0 ? (
              <Card className="p-8 text-center text-xs text-advo-muted">
                {t("reseller.subscription.invoices.noMatch")}
              </Card>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredInvoices.map((invoice) => (
                  <InvoiceDetailRow
                    key={invoice.id}
                    copied={copiedId === invoice.id}
                    invoice={invoice}
                    onCopy={() => copyRef(invoice.id)}
                    t={t}
                  />
                ))}
              </div>
            )
          }
        </ResourceView>
      </section>
    </div>
  );
}

function InvoiceDetailRow({
  invoice: i,
  t,
  copied,
  onCopy,
}: {
  invoice: Invoice;
  t: I18n["t"];
  copied: boolean;
  onCopy: () => void;
}) {
  const paid = i.status === "PAID";
  const when = formatDateTime(i.paidAt ?? i.createdAt);
  const planName = i.plan?.name ?? "—";
  const err = i.payment?.lastError ?? null;

  return (
    <Card className="overflow-hidden p-0 transition-shadow hover:shadow-advo-lift">
      <div className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
        <span
          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${
            paid
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
              : i.status === "VOID"
                ? "bg-rose-50 text-rose-700 ring-rose-200/70"
                : "bg-amber-50 text-amber-800 ring-amber-200/70"
          }`}
        >
          <Receipt className="h-5 w-5" />
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-white ${
              paid
                ? "bg-emerald-500"
                : i.status === "VOID"
                  ? "bg-rose-400"
                  : "bg-amber-400"
            }`}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="truncate text-sm font-black tracking-tight text-advo-text"
              title={planName}
            >
              {planName}
            </h3>
            <StatusChip tone={invoiceTone(i.status)}>
              {invoiceStatusLabel(t, i.status)}
            </StatusChip>
            {i.payment ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {PAYMENT_ATTEMPT_LABELS[i.payment.state] ??
                  i.payment.state.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-advo-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              {paid
                ? t("reseller.subscription.invoice.paidAt", { date: when })
                : t("reseller.subscription.invoice.created", { date: when })}
            </span>
            {i.periodStart ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate font-semibold">
                  {t("reseller.subscription.invoice.period")}:{" "}
                  {formatDateTime(i.periodStart)}
                  {i.periodEnd ? ` → ${formatDateTime(i.periodEnd)}` : ""}
                </span>
              </span>
            ) : null}
          </div>

          <dl className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-advo-border/70 bg-advo-page px-2 py-1">
              <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                {t("reseller.col.reference")}
              </span>
              <span className="font-mono text-[10px] font-bold text-advo-text">
                {i.id.slice(0, 8)}
              </span>
              <button
                aria-label={copied ? t("common.copied") : t("common.copy")}
                className="rounded-md p-0.5 text-advo-muted transition hover:bg-white hover:text-advo-text"
                onClick={onCopy}
                type="button"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </span>
            {err ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-rose-200/70 bg-rose-50/60 px-2 py-1 text-[10px] font-bold text-rose-700">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="truncate" title={err}>
                  {err}
                </span>
              </span>
            ) : null}
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 border-l border-advo-border/60 pl-3 sm:pl-4">
          <p
            className={`text-base font-black tracking-tight tabular-nums sm:text-lg ${
              paid ? "text-emerald-700" : "text-advo-text"
            }`}
          >
            {formatTzs(i.amountTzs)}
          </p>
          <p className="text-[10px] font-semibold text-advo-muted">
            {paid
              ? t("reseller.subscription.invoice.settled")
              : t("reseller.subscription.invoice.open")}
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * The mobile-money checkout for a subscription, as a centred dialog.
 *
 * A reseller pays from a laptop as often as a phone, so the form belongs over the
 * page rather than below a card they have to scroll to find. The dialog owns the
 * whole exchange: collect the details, wait for the wallet approval with a live
 * poll of the invoice, then either celebrate the activation or name the failure.
 */
type CheckoutStage = "form" | "waiting" | "success" | "failed";

function SubscriptionCheckoutDialog({
  plan,
  open,
  onClose,
  onPaid,
  user,
}: {
  plan: Plan | null;
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  user: { name: string; email: string };
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({
    isOpen: open,
    onOpenChange: (next) => (next ? undefined : onClose()),
  });
  const [stage, setStage] = useState<CheckoutStage>("form");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    newIdempotencyKey("sub"),
  );
  const [first, ...rest] = user.name.split(" ");

  // The parent re-creates `onPaid` on every render; polling must not restart
  // because of that, so it is read through a ref inside the effect.
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  // Reopening the dialog starts a fresh checkout: a new plan must not inherit the
  // spinner, the failure or the idempotency key of the last one.
  useEffect(() => {
    if (!open) return;
    setStage("form");
    setInvoiceId(null);
    setFailure(null);
    setPeriodEnd(null);
    setIdempotencyKey(newIdempotencyKey("sub"));
  }, [open, plan?.id]);

  const checkout = useAction(async (form: HTMLFormElement) => {
    if (!plan) return;
    const values = formValues(form);
    const result = await api.post<{
      invoiceId: string;
      payment: { state: string; lastError: string | null };
    }>("/reseller/subscription/checkout", {
      planId: plan.id,
      phone: values.phone,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      idempotencyKey,
    });
    setInvoiceId(result.invoiceId);
    setIdempotencyKey(newIdempotencyKey("sub"));
    if (result.payment.state === "FAILED") {
      setFailure(result.payment.lastError ?? null);
      setStage("failed");
      return;
    }
    setStage("waiting");
  });

  /**
   * Poll the invoice, not the clock: the provider confirms asynchronously, so the
   * success screen is only shown once the invoice itself is PAID.
   */
  useEffect(() => {
    if (stage !== "waiting" || !invoiceId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const next = await api.get<SubscriptionView>("/reseller/subscription");
        if (cancelled) return;
        const invoice = next.invoices.find((item) => item.id === invoiceId);
        if (invoice?.status === "PAID") {
          setPeriodEnd(invoice.periodEnd ?? next.currentPeriodEnd);
          setStage("success");
          onPaidRef.current();
          return;
        }
        const state = invoice?.payment?.state;
        if (
          state === "FAILED" ||
          state === "EXPIRED" ||
          state === "VOIDED" ||
          state === "NEEDS_REVIEW"
        ) {
          setFailure(invoice?.payment?.lastError ?? null);
          setStage("failed");
          onPaidRef.current();
          return;
        }
      } catch {
        // A dropped poll is not a failed payment; the next tick asks again.
      }
      if (!cancelled) timer = setTimeout(() => void check(), 3000);
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, invoiceId]);

  if (!plan) return null;

  const reference = (invoiceId ?? "").slice(0, 12).toUpperCase();

  return (
    <Modal.Root state={overlay}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="overflow-hidden bg-white p-0">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#0b2a63] via-[#12459e] to-[#0b2a63] px-5 pt-6 pb-5 text-white">
              <span
                aria-hidden
                className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.16em] text-white/60 uppercase">
                    {t("reseller.subscription.checkout.eyebrow")}
                  </p>
                  <h2 className="mt-1 truncate text-xl font-black tracking-tight">
                    {plan.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-white/70">
                    {t("reseller.subscription.checkout.period", {
                      days: plan.periodDays,
                    })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xl font-black tracking-tight tabular-nums">
                    {formatTzs(plan.priceTzs)}
                  </p>
                  <p className="text-[10px] font-semibold text-white/60">
                    {t("reseller.subscription.checkout.amountNote")}
                  </p>
                </div>
              </div>
            </div>

            <Modal.Body className="px-5 pb-5">
              {stage === "form" ? (
                <form
                  className="grid gap-3 pt-4 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void checkout.run(event.currentTarget);
                  }}
                >
                  <Field
                    defaultValue={first}
                    label={t("reseller.subscription.checkout.firstName")}
                    name="firstName"
                    required
                  />
                  <Field
                    defaultValue={rest.join(" ") || first}
                    label={t("reseller.subscription.checkout.lastName")}
                    name="lastName"
                    required
                  />
                  <Field
                    label={t("reseller.subscription.checkout.phone")}
                    name="phone"
                    placeholder="0712 345 678"
                    required
                  />
                  <Field
                    defaultValue={user.email}
                    label={t("reseller.subscription.checkout.email")}
                    name="email"
                    required
                    type="email"
                  />
                  <p className="text-[11px] text-advo-muted sm:col-span-2">
                    {t("reseller.subscription.checkout.subtitle")}
                  </p>
                  {checkout.error ? (
                    <div className="sm:col-span-2">
                      <Notice tone="danger">{checkout.error}</Notice>
                    </div>
                  ) : null}
                  <div className="flex flex-col-reverse gap-2 pt-1 sm:col-span-2 sm:flex-row sm:justify-end">
                    <Button onPress={onClose} type="button" variant="ghost">
                      {t("reseller.subscription.checkout.cancel")}
                    </Button>
                    <Button
                      isDisabled={checkout.pending}
                      type="submit"
                      variant="primary"
                    >
                      <Smartphone className="size-4" />
                      {checkout.pending
                        ? t("reseller.subscription.checkout.pending")
                        : t("reseller.subscription.checkout.submit")}
                    </Button>
                  </div>
                </form>
              ) : null}

              {stage === "waiting" ? (
                <div className="pt-6 text-center">
                  <div className="relative mx-auto grid size-24 place-items-center">
                    <span
                      aria-hidden
                      className="absolute inset-0 animate-ping rounded-full bg-advo-blue/15"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-3 animate-ping rounded-full bg-advo-blue/20 [animation-delay:400ms]"
                    />
                    <span className="relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-advo-blue to-[#0b2a63] text-white shadow-lg">
                      <Smartphone className="size-7" />
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-black text-advo-text">
                    {t("reseller.subscription.checkout.waitingTitle")}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-advo-muted">
                    {t("reseller.subscription.checkout.waitingBody")}
                  </p>

                  <div className="mx-auto mt-4 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-advo-page">
                    <div className="advo-checkout-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-advo-gold to-advo-orange" />
                  </div>

                  <dl className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2 text-left">
                    <div className="rounded-xl border border-advo-border/70 bg-advo-page/60 px-3 py-2">
                      <dt className="text-[9px] font-bold tracking-wider text-advo-muted uppercase">
                        {t("reseller.subscription.checkout.summaryPlan")}
                      </dt>
                      <dd className="mt-0.5 truncate text-xs font-bold text-advo-text">
                        {plan.name}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-advo-border/70 bg-advo-page/60 px-3 py-2">
                      <dt className="text-[9px] font-bold tracking-wider text-advo-muted uppercase">
                        {t("reseller.subscription.checkout.summaryAmount")}
                      </dt>
                      <dd className="mt-0.5 text-xs font-bold text-advo-text tabular-nums">
                        {formatTzs(plan.priceTzs)}
                      </dd>
                    </div>
                    {reference ? (
                      <div className="col-span-2 rounded-xl border border-advo-border/70 bg-advo-page/60 px-3 py-2">
                        <dt className="text-[9px] font-bold tracking-wider text-advo-muted uppercase">
                          {t("reseller.subscription.checkout.summaryReference")}
                        </dt>
                        <dd className="mt-0.5 font-mono text-xs font-bold text-advo-text">
                          {reference}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-advo-muted">
                    <Clock className="size-3" />
                    {t("reseller.subscription.checkout.waitingHint")}
                  </p>

                  <div className="mt-5 flex justify-center">
                    <Button onPress={onClose} type="button" variant="ghost">
                      {t("reseller.subscription.checkout.waitingClose")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {stage === "success" ? (
                <div className="pt-6 text-center">
                  <div className="relative mx-auto grid size-24 place-items-center">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-emerald-100"
                    />
                    <span
                      aria-hidden
                      className="advo-checkout-ring absolute inset-0 rounded-full ring-4 ring-emerald-300/70"
                    />
                    <span className="advo-checkout-pop relative grid size-16 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
                      <CheckCircle2 className="size-8" />
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-black text-advo-text">
                    {t("reseller.subscription.checkout.successTitle")}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-advo-muted">
                    {t("reseller.subscription.checkout.successBody", {
                      plan: plan.name,
                    })}
                  </p>

                  {periodEnd ? (
                    <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                      <Sparkles className="size-3" />
                      {t("reseller.subscription.checkout.successUntil", {
                        when: formatDateTime(periodEnd),
                      })}
                    </p>
                  ) : null}

                  <div className="mt-6">
                    <Button
                      className="w-full"
                      onPress={onClose}
                      type="button"
                      variant="primary"
                    >
                      {t("reseller.subscription.checkout.successCta")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {stage === "failed" ? (
                <div className="pt-6 text-center">
                  <div className="mx-auto grid size-16 place-items-center rounded-full bg-rose-50 text-rose-600">
                    <AlertTriangle className="size-7" />
                  </div>
                  <h3 className="mt-4 text-base font-black text-advo-text">
                    {t("reseller.subscription.checkout.failedTitle")}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-advo-muted">
                    {failure
                      ? t("reseller.subscription.checkout.failedBody", {
                          error: failure,
                        })
                      : t("reseller.subscription.checkout.failedBodyGeneric")}
                  </p>
                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                    <Button onPress={onClose} type="button" variant="ghost">
                      {t("reseller.subscription.checkout.cancel")}
                    </Button>
                    <Button
                      onPress={() => {
                        setFailure(null);
                        setStage("form");
                      }}
                      type="button"
                      variant="primary"
                    >
                      {t("reseller.subscription.checkout.retry")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </Modal.Body>

            {stage === "form" ? (
              <Modal.CloseTrigger
                aria-label={t("reseller.subscription.checkout.cancel")}
              />
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: LucideIcon;
  tone: "blue" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    blue: "bg-blue-50 text-advo-blue",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-advo-gold",
    rose: "bg-rose-50 text-rose-600",
  }[tone];
  const valueTone =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-advo-gold"
        : tone === "rose"
          ? "text-rose-600"
          : "text-advo-text";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tones}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div
        className={`mt-2 truncate text-xl font-bold sm:text-2xl ${valueTone}`}
        title={String(value)}
      >
        {value}
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
