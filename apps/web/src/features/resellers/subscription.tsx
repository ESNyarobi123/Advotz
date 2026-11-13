"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatTzs } from "@advo/api-client";
import { Notice, StatusChip } from "@advo/ui";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Layers3,
  MapPin,
  Receipt,
  Router,
  Sparkles,
} from "lucide-react";
import type { MessageKey } from "@advo/i18n";
import { ResourceView } from "@/features/common/components";
import { useSessionUser } from "@/features/shell/DashboardShell";
import { api } from "@/lib/api";
import { useAction, useResource } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import {
  PlanDetailDrawer,
  capacityOf,
  type ResellerPlan as Plan,
} from "./subscription-plan-drawer";
import { PlanCatalog, buildCatalog } from "./plan-catalog";
import {
  SubscriptionCheckoutDialog,
  type PendingCheckout,
} from "./subscription-checkout";
import { SubscriptionHistory } from "./subscription-history";

const mainAction =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f8ba56] px-4 py-2.5 text-sm font-bold text-[#251805] transition hover:bg-[#ffd088] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f8ba56]";
const quietAction =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

function savedCheckouts(userId: string): Record<string, PendingCheckout> {
  try {
    return (
      JSON.parse(
        sessionStorage.getItem(`advo:subscription-checkouts:${userId}`) ?? "{}",
      ) ?? {}
    );
  } catch {
    return {};
  }
}

type Subscription = {
  state: string;
  plan: Plan | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialUsed: boolean;
  asOf: string;
};

function useSubscriptionClock(asOf: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!asOf) return;
    const serverTime = Date.parse(asOf);
    const receivedAt = performance.now();
    const update = () => setNow(serverTime + performance.now() - receivedAt);
    update();
    const timer = setInterval(update, 15_000);
    return () => clearInterval(timer);
  }, [asOf]);
  return now;
}

export function ResellerSubscriptionScreen() {
  const { t } = useI18n();
  const user = useSessionUser();
  const subscription = useResource<Subscription>(
    "/reseller/subscription?view=summary",
  );
  const plans = useResource<Plan[]>("/reseller/plans");
  const current = subscription.data;
  const now = useSubscriptionClock(current?.asOf);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [detail, setDetail] = useState<Plan | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [checkouts, setCheckouts] = useState(() => savedCheckouts(user.id));
  const { reload } = subscription;
  const catalog = useMemo(
    () => (plans.data ? buildCatalog(plans.data) : null),
    [plans.data],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `advo:subscription-checkouts:${user.id}`,
        JSON.stringify(checkouts),
      );
    } catch {
      // Checkout still works if the browser blocks session storage.
    }
  }, [checkouts, user.id]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [reload]);

  const periodEnd = current?.currentPeriodEnd ?? null;
  const crossedEnd = Boolean(
    periodEnd &&
    now >= Date.parse(periodEnd) &&
    current?.asOf &&
    Date.parse(current.asOf) < Date.parse(periodEnd),
  );
  useEffect(() => {
    if (crossedEnd) void reload();
  }, [crossedEnd, reload]);

  const trial = useAction(
    async (planId: string) => {
      await api.post("/reseller/subscription/trial", { planId });
    },
    async () => {
      setDetail(null);
      await reload();
      document
        .getElementById("subscription-overview")
        ?.scrollIntoView({ block: "start" });
    },
  );

  const hasPaidTime =
    current?.state === "ACTIVE" && Boolean(periodEnd) && !crossedEnd;
  const trialAvailable = Boolean(
    current &&
    !current.trialUsed &&
    !["ACTIVE", "TRIALING"].includes(current.state),
  );
  const trialPlan =
    !current?.plan && trialAvailable
      ? plans.data?.find(
          (plan) => plan.trialEligible && (plan.trialDays ?? 0) > 0,
        )
      : undefined;
  const renewal =
    plans.data?.find((plan) => plan.id === current?.plan?.id) ??
    plans.data?.find((plan) => plan.code === current?.plan?.code);

  function choosePlan(plan: Plan) {
    setDetail(null);
    setSelected(plan);
  }

  function actionFor(plan: Plan) {
    if (checkouts[plan.id]?.invoiceId)
      return t("reseller.subscription.checkout.checkPayment");
    if (!current?.plan || current.state === "TRIALING")
      return t("reseller.subscription.plans.select");
    if (plan.code === current.plan.code)
      return t("reseller.subscription.notice.renew");
    const candidate = capacityOf(plan);
    const existing = capacityOf(current.plan);
    const candidateLimits = [candidate.sites, candidate.devices].map(
      (limit) => limit ?? Infinity,
    );
    const existingLimits = [existing.sites, existing.devices].map(
      (limit) => limit ?? Infinity,
    );
    if (candidate.legacyPackages === existing.legacyPackages) {
      candidateLimits.push(candidate.wifiPackagesPerSite ?? Infinity);
      existingLimits.push(existing.wifiPackagesPerSite ?? Infinity);
    }
    if (
      candidateLimits.every(
        (limit, index) => limit >= existingLimits[index]!,
      ) &&
      candidateLimits.some((limit, index) => limit > existingLimits[index]!)
    ) {
      return t("reseller.subscription.plans.upgrade");
    }
    return t("reseller.subscription.plans.switch");
  }

  function refreshPayments() {
    void reload();
    setHistoryRevision((revision) => revision + 1);
  }

  return (
    <div className="mx-auto max-w-[1260px] space-y-9 pb-8 text-advo-text sm:space-y-11">
      <div id="subscription-overview" className="scroll-mt-24">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">
              {t("nav.subscription")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-advo-muted">
              {t("reseller.subscription.overview.subtitle")}
            </p>
          </div>
          <a
            href="#billing"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-advo-border bg-advo-card px-3.5 text-sm font-semibold hover:bg-advo-surface-soft"
          >
            <Receipt aria-hidden="true" className="size-4 text-[#f8ba56]" />
            {t("reseller.subscription.invoices.title")}
          </a>
        </header>

        <ResourceView resource={subscription}>
          {(data) => (
            <MembershipCard
              data={data}
              now={now}
              renewal={renewal}
              choosePlan={choosePlan}
              renewalLabel={renewal ? actionFor(renewal) : undefined}
            />
          )}
        </ResourceView>

        {trialPlan ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-emerald-300/20 bg-emerald-300/[0.06] px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-emerald-300" />
              <div>
                <h2 className="text-sm font-bold">
                  {t("reseller.subscription.trial.title", {
                    days: trialPlan.trialDays ?? 0,
                  })}
                </h2>
                <p className="mt-1 text-sm text-advo-muted">
                  {t("reseller.subscription.trial.body", {
                    plan: trialPlan.name,
                    days: trialPlan.trialDays ?? 0,
                  })}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={trial.pending}
              className="min-h-10 rounded-xl bg-emerald-300 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-60"
              onClick={() => void trial.run(trialPlan.id)}
            >
              {trial.pending
                ? t("reseller.subscription.trial.starting")
                : t("reseller.subscription.trial.cta", {
                    days: trialPlan.trialDays ?? 0,
                  })}
            </button>
          </div>
        ) : null}
        {trial.error ? (
          <div className="mt-4">
            <Notice tone="danger">{trial.error}</Notice>
          </div>
        ) : null}
      </div>

      <section
        id="plans"
        aria-labelledby="plans-title"
        className="scroll-mt-24"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="plans-title" className="text-2xl font-bold tracking-tight">
              {t("reseller.subscription.plans.title")}
            </h2>
            <p className="mt-1 text-sm text-advo-muted">
              {t("reseller.subscription.overview.compare")}
            </p>
          </div>
          {hasPaidTime ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300/[0.07] px-2.5 py-1.5 text-xs font-semibold text-emerald-300">
              <ArrowUpRight className="size-3.5" />
              {t("reseller.subscription.overview.upgradeAnytime")}
            </span>
          ) : null}
        </div>
        <ResourceView resource={plans}>
          {() =>
            catalog && catalog.tiers.length + catalog.other.length > 0 ? (
              <PlanCatalog
                catalog={catalog}
                currentPlan={current?.plan ?? null}
                trialAvailable={trialAvailable}
                trialPending={trial.pending}
                actionFor={actionFor}
                onChoose={choosePlan}
                onDetail={setDetail}
                onTrial={(plan) => void trial.run(plan.id)}
              />
            ) : (
              <Notice tone="default">
                {t("reseller.subscription.plans.empty")}
              </Notice>
            )
          }
        </ResourceView>
      </section>

      <SubscriptionHistory revision={historyRevision} onRefresh={reload} />

      <PlanDetailDrawer
        actionLabel={detail ? actionFor(detail) : undefined}
        onChoose={choosePlan}
        onClose={() => setDetail(null)}
        onTrial={(plan) => void trial.run(plan.id)}
        open={detail !== null}
        plan={detail}
        trialAvailable={trialAvailable}
        trialPending={trial.pending}
        trialUsed={Boolean(current?.trialUsed)}
      />

      {selected ? (
        <SubscriptionCheckoutDialog
          currentPeriodEnd={hasPaidTime ? periodEnd : null}
          isRenewal={selected.code === current?.plan?.code}
          key={selected.id}
          onClose={() => setSelected(null)}
          onUpdate={refreshPayments}
          pendingCheckout={checkouts[selected.id]}
          onCheckout={(checkout) =>
            setCheckouts((keys) => ({ ...keys, [selected.id]: checkout }))
          }
          onComplete={() =>
            setCheckouts(({ [selected.id]: _finished, ...pending }) => pending)
          }
          plan={selected}
          user={user}
        />
      ) : null}
    </div>
  );
}

function MembershipCard({
  data,
  now,
  renewal,
  renewalLabel,
  choosePlan,
}: {
  data: Subscription;
  now: number;
  renewal?: Plan;
  renewalLabel?: string;
  choosePlan: (plan: Plan) => void;
}) {
  const { t, locale } = useI18n();
  const { plan, state, currentPeriodStart, currentPeriodEnd } = data;
  const start = currentPeriodStart ? Date.parse(currentPeriodStart) : null;
  const end = currentPeriodEnd ? Date.parse(currentPeriodEnd) : null;
  const active = state === "ACTIVE" && (end === null || end > now);
  const trialing = state === "TRIALING" && (end === null || end > now);
  const inPeriod = active || trialing;
  const timeLeft = inPeriod && end !== null ? end - now : null;
  const hours =
    timeLeft !== null ? Math.max(1, Math.ceil(timeLeft / 3_600_000)) : 0;
  const days = Math.ceil(hours / 24);
  const percent =
    start !== null && end !== null && end > start
      ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
      : null;
  const chips = active
    ? "success"
    : trialing
      ? "accent"
      : plan
        ? "danger"
        : "default";
  const stateKey = `reseller.subscription.state.${state}` as MessageKey;
  const awaitingStatus =
    (state === "ACTIVE" || state === "TRIALING") && !inPeriod;
  const accessPaused = state === "SUSPENDED" || state === "CANCELLED";
  const capacity = plan ? capacityOf(plan) : null;
  const date = (value: string | null) =>
    formatDateTime(value, locale === "sw" ? "sw-TZ" : "en-GB");

  return (
    <section
      aria-labelledby="membership-title"
      className="overflow-hidden rounded-[24px] border border-white/10 bg-[#171c23] text-white shadow-[0_14px_40px_#00000024]"
    >
      <div className="relative isolate grid gap-6 bg-[radial-gradient(ellipse_at_88%_0%,#26394d_0%,transparent_72%)] p-5 sm:p-7 xl:grid-cols-[1fr_minmax(320px,40%)] xl:gap-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,#ffffff14_1px,transparent_1.5px)] bg-size-[24px_24px] [mask-image:linear-gradient(to_left,black,transparent_60%)]"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl border border-[#f8ba56]/20 bg-[#f8ba56]/10 text-[#ffd08a]">
              <CreditCard className="size-4.5" />
            </span>
            <h2
              id="membership-title"
              className="text-sm font-semibold text-slate-200"
            >
              {t("reseller.subscription.kpi.plan")}
            </h2>
            <StatusChip tone={chips}>
              {t(
                awaitingStatus
                  ? "reseller.subscription.overview.statusLoading"
                  : stateKey,
              )}
            </StatusChip>
          </div>
          <p className="mt-4 text-[clamp(1.65rem,3vw,2.75rem)] leading-[1.1] font-bold tracking-[-0.045em] break-words">
            {plan?.name ?? t("reseller.subscription.noPlan")}
          </p>
          {plan ? (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm text-slate-300">
              <strong className="text-lg font-semibold text-white tabular-nums">
                {formatTzs(trialing ? 0 : plan.priceTzs)}
              </strong>
              {trialing
                ? t("reseller.subscription.overview.freeTrial")
                : t("reseller.subscription.plans.perDays", {
                    days: plan.periodDays,
                  })}
            </p>
          ) : (
            <p className="mt-2 max-w-sm text-sm text-slate-300">
              {t("reseller.subscription.noPlanHint")}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2.5">
            <a href="#plans" className={mainAction}>
              {t(
                active
                  ? "reseller.subscription.overview.upgrade"
                  : "reseller.subscription.overview.browse",
              )}
              {active ? (
                <ArrowUpRight className="size-4" />
              ) : (
                <ArrowDown className="size-4" />
              )}
            </a>
            {renewal && !trialing ? (
              <button
                type="button"
                className={quietAction}
                onClick={() => choosePlan(renewal)}
              >
                {renewalLabel}
                <ArrowRight className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-[18px] border border-white/10 bg-[#111824]/85 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <CalendarDays className="size-4 text-[#f8ba56]" />
            {t("reseller.subscription.period")}
          </div>
          <p className="mt-2.5 text-2xl font-bold tracking-tight tabular-nums sm:text-[1.65rem]">
            {timeLeft !== null
              ? t(
                  hours === 1
                    ? "reseller.subscription.overview.lastHour"
                    : hours < 24
                      ? "reseller.subscription.overview.hoursLeft"
                      : days === 1
                        ? "reseller.subscription.remainingDay"
                        : "reseller.subscription.remainingDays",
                  { count: hours < 24 ? hours : days },
                )
              : t(
                  accessPaused
                    ? "reseller.subscription.overview.accessPaused"
                    : end === null
                      ? "reseller.subscription.notScheduled"
                      : "reseller.subscription.overview.inactive",
                )}
          </p>
          {percent !== null ? (
            <div
              role="progressbar"
              aria-label={t("reseller.subscription.overview.elapsed")}
              aria-valuenow={Math.round(percent)}
              className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
            >
              <div
                className={`h-full rounded-full ${inPeriod ? "bg-[#f8ba56]" : "bg-slate-400"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
          {currentPeriodStart || currentPeriodEnd ? (
            <dl className="mt-3.5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-400">
                  {t("reseller.subscription.overview.started")}
                </dt>
                <dd className="mt-1 font-semibold text-slate-100">
                  {date(currentPeriodStart)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">
                  {t(
                    inPeriod
                      ? "reseller.subscription.overview.validUntil"
                      : "reseller.subscription.overview.periodEnd",
                  )}
                </dt>
                <dd className="mt-1 font-semibold text-slate-100">
                  {date(currentPeriodEnd)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              {t("reseller.subscription.overview.periodEmpty")}
            </p>
          )}
        </div>
      </div>

      {state === "PAST_DUE" || state === "EXPIRED" ? (
        <p className="border-t border-white/10 bg-amber-200/[0.06] px-5 py-3 text-sm text-amber-200 sm:px-7">
          {t(
            state === "PAST_DUE"
              ? "reseller.subscription.notice.pastDue"
              : "reseller.subscription.notice.expired",
          )}
        </p>
      ) : null}

      {capacity ? (
        <dl className="grid grid-cols-3 gap-0 divide-x divide-white/10 border-t border-white/10">
          {(
            [
              [MapPin, "reseller.subscription.plans.sites", capacity.sites],
              [Router, "reseller.subscription.plans.devices", capacity.devices],
              [
                Layers3,
                capacity.legacyPackages
                  ? "reseller.subscription.overview.packagesTotal"
                  : "reseller.subscription.overview.packagesPerSite",
                capacity.wifiPackagesPerSite,
              ],
            ] as const
          ).map(([Icon, label, value]) => (
            <div
              key={label}
              className="flex min-w-0 flex-col items-start gap-2 px-3 py-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-7 sm:py-4"
            >
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-[#f8ba56]"
              />
              <div className="min-w-0">
                <dt className="text-xs text-slate-300">{t(label)}</dt>
                <dd className="mt-0.5 text-sm font-bold break-words tabular-nums">
                  {value ?? t("reseller.subscription.unlimited")}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
