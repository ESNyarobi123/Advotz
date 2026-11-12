"use client";

import { useMemo, useState } from "react";
import { formatTzs } from "@advo/api-client";
import {
  PLAN_TIERS,
  placementOf,
  planFeaturesWithDefaults,
  planTypeOf,
  tierRank,
} from "@advo/contracts";
import { Card } from "@heroui/react";
import {
  Check,
  Info,
  Minus,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import type { MessageKey } from "@advo/i18n";
import { useI18n, type I18n } from "@/lib/i18n";
import {
  capacityOf,
  type PlanCapacity,
  type ResellerPlan as Plan,
} from "./subscription-plan-drawer";

/**
 * The catalog as it is actually sold: a capacity tier, then a commercial type.
 *
 * Two axes, not eight separate plans. `tierKey` groups the versions and
 * `planType` names the option inside the group. The server refuses to publish a
 * tier with two Partner options or with mismatched capacity, so this grouping is
 * a rendering of the same rule the API enforces — not a second opinion.
 */
export type CatalogOptionType = "PARTNER" | "INDEPENDENT";

export type CatalogTier = {
  key: string;
  capacity: PlanCapacity;
  options: Partial<Record<CatalogOptionType, Plan>>;
};

/** Known tiers keep the order they are sold in; unknown keys come after them. */
export type Catalog = { tiers: CatalogTier[]; other: Plan[] };

function tierLabel(t: I18n["t"], key: string): string {
  const known = `reseller.subscription.catalog.tier.${key}` as MessageKey;
  const translated = t(known);
  if (translated !== known) return translated;
  return PLAN_TIERS.find((tier) => tier.key === key)?.label ?? key;
}

function isOptionType(value: string | null): value is CatalogOptionType {
  return value === "PARTNER" || value === "INDEPENDENT";
}

export function buildCatalog(plans: Plan[]): Catalog {
  const byTier = new Map<string, CatalogTier>();
  const other: Plan[] = [];

  for (const plan of plans) {
    if (!plan.tierKey || !isOptionType(plan.planType)) {
      other.push(plan);
      continue;
    }
    const tier = byTier.get(plan.tierKey) ?? {
      key: plan.tierKey,
      capacity: capacityOf(plan),
      options: {},
    };
    // First option of a tier defines the capacity shown; the publish validator has
    // already guaranteed both options carry the same numbers.
    tier.options[plan.planType] = plan;
    byTier.set(plan.tierKey, tier);
  }

  const tiers = [...byTier.values()]
    .sort((a, b) => {
      const rank = tierRank(a.key) - tierRank(b.key);
      return rank !== 0 ? rank : a.key.localeCompare(b.key);
    })
    .map((tier) => {
      const option = tier.options.PARTNER ?? tier.options.INDEPENDENT;
      return { ...tier, capacity: option ? capacityOf(option) : tier.capacity };
    });

  return { tiers, other };
}

/** `null` is unlimited — a bare `null` would read as "none allowed". */
function capacityValue(t: I18n["t"], value: number | null): string {
  return value === null ? t("reseller.subscription.unlimited") : String(value);
}

function capacityLine(t: I18n["t"], capacity: PlanCapacity): string {
  if (
    capacity.sites === null &&
    capacity.devices === null &&
    capacity.wifiPackagesPerSite === null
  ) {
    return t("reseller.subscription.catalog.capacityUnlimited");
  }
  return t("reseller.subscription.catalog.capacity", {
    sites: capacityValue(t, capacity.sites),
    devices: capacityValue(t, capacity.devices),
    packages: capacityValue(t, capacity.wifiPackagesPerSite),
  });
}

function cheapest(plans: Array<Plan | undefined>): Plan | undefined {
  return plans
    .filter((plan): plan is Plan => Boolean(plan))
    .sort((a, b) => (BigInt(a.priceTzs) < BigInt(b.priceTzs) ? -1 : 1))[0];
}

/**
 * The two-axis chooser: pick a package, then pick how the guest portal looks.
 *
 * The order is deliberate — capacity is the decision a reseller can reason about
 * (how many sites and access points), while the Partner/Independent choice is a
 * content decision that only matters once the package is settled. Presenting all
 * eight at once is what the old flat grid did, and it hid the fact that both
 * options of a tier are the same package.
 */
export function PlanCatalog({
  plans,
  currentPlanId,
  trialUsed,
  trialPending,
  onChoose,
  onDetail,
  onTrial,
}: {
  plans: Plan[];
  currentPlanId: string | null;
  trialUsed: boolean;
  trialPending: boolean;
  onChoose: (plan: Plan) => void;
  onDetail: (plan: Plan) => void;
  onTrial: (plan: Plan) => void;
}) {
  const { t } = useI18n();
  const catalog = useMemo(() => buildCatalog(plans), [plans]);
  const [picked, setPicked] = useState<string | null>(null);

  // The subscription's own tier opens first, so renewing does not start the
  // reseller on a tier they are not on.
  const currentTierKey =
    plans.find((plan) => plan.id === currentPlanId)?.tierKey ?? null;
  const activeTierKey =
    picked ?? currentTierKey ?? catalog.tiers[0]?.key ?? null;
  const activeTier =
    catalog.tiers.find((tier) => tier.key === activeTierKey) ??
    catalog.tiers[0] ??
    null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-black tracking-tight text-advo-text">
          {t("reseller.subscription.catalog.title")}
        </h2>
        <p className="text-xs text-advo-muted">
          {t("reseller.subscription.catalog.subtitle")}
        </p>
      </div>

      {/* ── Axis 1: the package ── */}
      <div>
        <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">
          {t("reseller.subscription.catalog.stepPackage")}
        </p>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {catalog.tiers.map((tier) => {
            const active = tier.key === activeTier?.key;
            const from = cheapest([
              tier.options.PARTNER,
              tier.options.INDEPENDENT,
            ]);
            return (
              <button
                key={tier.key}
                type="button"
                aria-pressed={active}
                onClick={() => setPicked(tier.key)}
                className={`group relative overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition ${
                  active
                    ? "border-advo-blue bg-advo-blue/[0.04] ring-2 ring-advo-blue/20"
                    : "border-advo-border bg-white hover:-translate-y-0.5 hover:border-advo-blue/40 hover:shadow-advo-card"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-0.5 ${active ? "bg-advo-blue" : "bg-slate-200 group-hover:bg-advo-gold/60"}`}
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-black tracking-tight text-advo-text">
                    {tierLabel(t, tier.key)}
                  </span>
                  {active ? (
                    <Check className="size-3.5 shrink-0 text-advo-blue" />
                  ) : null}
                </span>
                <span className="mt-1 block text-[10px] leading-snug font-semibold text-advo-muted">
                  {capacityLine(t, tier.capacity)}
                </span>
                {from ? (
                  <span className="mt-2 block truncate text-[11px] font-bold text-advo-text tabular-nums">
                    {from.priceFrom
                      ? `${t("reseller.subscription.catalog.from")} `
                      : ""}
                    {formatTzs(from.priceTzs)}
                    <span className="font-medium text-slate-400">
                      {" "}
                      {t("reseller.subscription.catalog.perMonth")}
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Axis 2: the commercial option ── */}
      {activeTier ? (
        <div className="rounded-3xl border border-advo-border bg-gradient-to-b from-advo-page/60 to-white p-3.5 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">
              {t("reseller.subscription.catalog.stepOption")}
            </p>
            <p className="text-[11px] font-semibold text-advo-muted">
              {capacityLine(t, activeTier.capacity)}
            </p>
          </div>

          <div
            className={`grid gap-3.5 ${Object.keys(activeTier.options).length > 1 ? "md:grid-cols-2" : ""}`}
          >
            {(Object.keys(activeTier.options) as CatalogOptionType[]).map(
              (type) => {
                const plan = activeTier.options[type];
                if (!plan) return null;
                return (
                  <CatalogOptionCard
                    key={plan.id}
                    plan={plan}
                    type={type}
                    current={plan.id === currentPlanId}
                    trialUsed={trialUsed}
                    trialPending={trialPending}
                    onChoose={onChoose}
                    onDetail={onDetail}
                    onTrial={onTrial}
                  />
                );
              },
            )}
          </div>

          <p className="mt-3.5 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-snug font-semibold text-slate-600">
            <Info className="mt-0.5 size-3.5 shrink-0 text-advo-blue" />
            {t("reseller.subscription.catalog.sameTools")}
          </p>
        </div>
      ) : null}
    </section>
  );
}

const OPTION_COPY: Record<
  CatalogOptionType,
  { title: MessageKey; subtitle: MessageKey; body: MessageKey }
> = {
  PARTNER: {
    title: "reseller.subscription.catalog.partner.title",
    subtitle: "reseller.subscription.catalog.partner.subtitle",
    body: "reseller.subscription.catalog.partner.body",
  },
  INDEPENDENT: {
    title: "reseller.subscription.catalog.independent.title",
    subtitle: "reseller.subscription.catalog.independent.subtitle",
    body: "reseller.subscription.catalog.independent.body",
  },
};

/**
 * One commercial option inside a tier.
 *
 * The three bullets are read off the plan's own placement policy rather than off
 * its type label, so a card can never claim the ads are gone while the portal
 * still serves them. "Keep your logo and brand colours" is listed for both,
 * because both genuinely grant it.
 */
function CatalogOptionCard({
  plan,
  type,
  current,
  trialUsed,
  trialPending,
  onChoose,
  onDetail,
  onTrial,
}: {
  plan: Plan;
  type: CatalogOptionType;
  current: boolean;
  trialUsed: boolean;
  trialPending: boolean;
  onChoose: (plan: Plan) => void;
  onDetail: (plan: Plan) => void;
  onTrial: (plan: Plan) => void;
}) {
  const { t } = useI18n();
  const features = planFeaturesWithDefaults(plan.features);
  const adsOn = placementOf(features, "ads.banner").mode !== "DISABLED";
  const exploreOn = placementOf(features, "ads.explore").mode !== "DISABLED";
  const copy = OPTION_COPY[type];
  const Icon = type === "PARTNER" ? Users : UserRound;
  const canTrial =
    plan.trialEligible && (plan.trialDays ?? 0) > 0 && !trialUsed;
  // A plan whose placements disagree with its tag is flagged, not silently
  // re-labelled: the tag is what the reseller is agreeing to.
  const mismatched = plan.planType !== planTypeOf(features);

  return (
    <Card
      className={`flex flex-col p-4 transition sm:p-5 ${
        current
          ? "border-advo-blue ring-2 ring-advo-blue/15"
          : "border-advo-border hover:shadow-advo-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-2xl ${
            type === "PARTNER"
              ? "bg-amber-50 text-advo-gold"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-black tracking-tight text-advo-text">
              {t(copy.title)}
            </h3>
            {current ? (
              <span className="rounded-full bg-advo-blue/10 px-1.5 py-0.5 text-[9px] font-bold text-advo-blue">
                {t("reseller.subscription.state.ACTIVE")}
              </span>
            ) : null}
            {plan.isDemo ? (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-advo-gold">
                DEMO
              </span>
            ) : null}
          </div>
          <p className="text-[11px] font-semibold text-advo-muted">
            {t(copy.subtitle)}
          </p>
        </div>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
        {t(copy.body)}
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        {plan.priceFrom ? (
          <span className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
            {t("reseller.subscription.catalog.from")}
          </span>
        ) : null}
        <span className="text-2xl font-black tracking-tight text-advo-text tabular-nums">
          {formatTzs(plan.priceTzs)}
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {t("reseller.subscription.catalog.perMonth")}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-advo-border/60 pt-3 text-[11px]">
        <Bullet
          on={adsOn}
          label={t(
            adsOn
              ? "reseller.subscription.catalog.bullet.adsOn"
              : "reseller.subscription.catalog.bullet.adsOff",
          )}
        />
        <Bullet
          on={exploreOn}
          label={t(
            exploreOn
              ? "reseller.subscription.catalog.bullet.exploreOn"
              : "reseller.subscription.catalog.bullet.exploreOff",
          )}
        />
        <Bullet on label={t("reseller.subscription.catalog.bullet.branding")} />
      </ul>

      {mismatched ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
          {t("reseller.subscription.catalog.mismatch")}
        </p>
      ) : null}

      <div className="mt-3.5 space-y-1.5 border-t border-advo-border/60 pt-3">
        <button
          type="button"
          onClick={() => onChoose(plan)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-advo-blue py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-advo-blue/90"
        >
          <Smartphone className="size-3.5" />
          {t("reseller.subscription.plans.select")}
        </button>
        <button
          type="button"
          onClick={() => onDetail(plan)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-advo-border bg-white py-2 text-[11px] font-semibold text-slate-700 hover:bg-advo-page"
        >
          <Info className="size-3.5" />
          {t("reseller.subscription.plans.viewFeatures")}
        </button>
        {canTrial ? (
          <button
            type="button"
            disabled={trialPending}
            onClick={() => onTrial(plan)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-advo-border bg-white py-2 text-[11px] font-semibold text-slate-700 hover:bg-advo-page"
          >
            <Sparkles className="size-3.5 text-advo-gold" />
            {t("reseller.subscription.plans.startTrial", {
              days: plan.trialDays ?? 0,
            })}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

function Bullet({ on, label }: { on: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${
          on ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
        }`}
      >
        {on ? (
          <Check className="size-2.5" strokeWidth={3} />
        ) : (
          <Minus className="size-2.5" strokeWidth={3} />
        )}
      </span>
      <span className={on ? "text-slate-700" : "text-slate-400"}>{label}</span>
    </li>
  );
}
