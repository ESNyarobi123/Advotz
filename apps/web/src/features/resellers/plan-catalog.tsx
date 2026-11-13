"use client";

import { useState } from "react";
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
  ArrowUpRight,
  Check,
  Info,
  Minus,
  Package,
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
  options: Plan[];
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
      options: [],
    };
    // First option of a tier defines the capacity shown; the publish validator has
    // already guaranteed both options carry the same numbers.
    if (tier.options.some((option) => option.planType === plan.planType)) {
      other.push(plan);
      continue;
    }
    tier.options.push(plan);
    byTier.set(plan.tierKey, tier);
  }

  const tiers = [...byTier.values()]
    .sort((a, b) => {
      const rank = tierRank(a.key) - tierRank(b.key);
      return rank !== 0 ? rank : a.key.localeCompare(b.key);
    })
    .map((tier) => {
      const option =
        tier.options.find((plan) => plan.planType === "PARTNER") ??
        tier.options[0];
      return { ...tier, capacity: option ? capacityOf(option) : tier.capacity };
    });

  return { tiers, other };
}

function capacityLine(t: I18n["t"], capacity: PlanCapacity): string {
  const label = (value: number | null) =>
    value ?? t("reseller.subscription.unlimited");
  if (
    capacity.sites === null &&
    capacity.devices === null &&
    capacity.wifiPackagesPerSite === null
  ) {
    return t("reseller.subscription.catalog.capacityUnlimited");
  }
  return t(
    capacity.legacyPackages
      ? "reseller.subscription.catalog.capacityLegacy"
      : "reseller.subscription.catalog.capacity",
    {
      sites: label(capacity.sites),
      devices: label(capacity.devices),
      packages: label(capacity.wifiPackagesPerSite),
    },
  );
}

export function PlanCatalog({
  catalog,
  currentPlan,
  trialAvailable,
  trialPending,
  actionFor,
  onChoose,
  onDetail,
  onTrial,
}: {
  catalog: Catalog;
  currentPlan: Plan | null;
  trialAvailable: boolean;
  trialPending: boolean;
  actionFor: (plan: Plan) => string;
  onChoose: (plan: Plan) => void;
  onDetail: (plan: Plan) => void;
  onTrial: (plan: Plan) => void;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<string | null>(null);
  const activeTier =
    catalog.tiers.find(
      (tier) => tier.key === (picked ?? currentPlan?.tierKey),
    ) ?? catalog.tiers[0];
  const actions = {
    actionFor,
    trialAvailable,
    trialPending,
    onChoose,
    onDetail,
    onTrial,
  };

  return (
    <div className="space-y-4">
      {activeTier ? (
        <div className="overflow-hidden rounded-[20px] border border-advo-border bg-advo-card">
          <div
            role="group"
            aria-label={t("reseller.subscription.catalog.title")}
            className="grid grid-cols-2 gap-2 border-b border-advo-border p-3 sm:gap-3 sm:p-4 xl:grid-cols-4"
          >
            {catalog.tiers.map((tier) => {
              const active = tier.key === activeTier.key;
              const cheapest = tier.options.reduce((low, plan) =>
                BigInt(plan.priceTzs) < BigInt(low.priceTzs) ? plan : low,
              );
              return (
                <button
                  key={tier.key}
                  type="button"
                  aria-pressed={active}
                  aria-controls="subscription-plan-options"
                  onClick={() => setPicked(tier.key)}
                  className="flex min-w-0 flex-col rounded-xl border border-advo-border bg-advo-page p-3 text-left transition hover:border-[#f8ba56]/50 focus-visible:outline-2 focus-visible:outline-[#f8ba56] aria-pressed:border-[#f8ba56]/70 aria-pressed:bg-[#f8ba56]/10 sm:p-3.5"
                >
                  <span className="flex w-full items-start justify-between gap-2 text-sm font-bold text-advo-text">
                    {tierLabel(t, tier.key)}
                    {active ? (
                      <Check className="size-4 shrink-0 text-[#f8ba56]" />
                    ) : null}
                  </span>
                  <span className="mt-1.5 text-xs leading-relaxed text-advo-muted">
                    {capacityLine(t, tier.capacity)}
                  </span>
                  <span className="mt-auto pt-2 text-xs font-semibold text-advo-text tabular-nums">
                    {tier.options.length > 1 || cheapest.priceFrom
                      ? `${t("reseller.subscription.catalog.from")} `
                      : ""}
                    {formatTzs(cheapest.priceTzs)}
                    <span className="ml-1 text-advo-muted">
                      {t("reseller.subscription.plans.perDays", {
                        days: cheapest.periodDays,
                      })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div id="subscription-plan-options" className="p-3.5 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-advo-text">
              {t("reseller.subscription.catalog.optionsFor", {
                tier: tierLabel(t, activeTier.key),
              })}
            </h3>
            <div
              className={`grid gap-3.5 ${activeTier.options.length > 1 ? "md:grid-cols-2" : ""}`}
            >
              {activeTier.options.map((plan) => (
                <CatalogOptionCard
                  key={plan.id}
                  plan={plan}
                  current={plan.id === currentPlan?.id}
                  {...actions}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {catalog.other.length ? (
        <div>
          {activeTier ? (
            <h3 className="mb-3 text-sm font-semibold text-advo-text">
              {t("reseller.subscription.catalog.other")}
            </h3>
          ) : null}
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.other.map((plan) => (
              <CatalogOptionCard
                key={plan.id}
                plan={plan}
                current={plan.id === currentPlan?.id}
                {...actions}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
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
  current,
  actionFor,
  trialAvailable,
  trialPending,
  onChoose,
  onDetail,
  onTrial,
}: {
  plan: Plan;
  current: boolean;
  actionFor: (plan: Plan) => string;
  trialAvailable: boolean;
  trialPending: boolean;
  onChoose: (plan: Plan) => void;
  onDetail: (plan: Plan) => void;
  onTrial: (plan: Plan) => void;
}) {
  const { t } = useI18n();
  const features = planFeaturesWithDefaults(plan.features);
  const banner = placementOf(features, "ads.banner");
  const explore = placementOf(features, "ads.explore");
  const adsOn = banner.mode !== "DISABLED";
  const exploreOn = explore.mode !== "DISABLED";
  const type = plan.planType;
  const copy = isOptionType(type) ? OPTION_COPY[type] : null;
  const Icon =
    type === "PARTNER" ? Users : type === "INDEPENDENT" ? UserRound : Package;
  const canTrial =
    plan.trialEligible && (plan.trialDays ?? 0) > 0 && trialAvailable;
  // A plan whose placements disagree with its tag is flagged, not silently
  // re-labelled: the tag is what the reseller is agreeing to.
  const mismatched = copy && plan.planType !== planTypeOf(features);

  return (
    <Card
      className={`flex flex-col rounded-[16px] border bg-advo-page p-4 sm:p-5 ${
        current
          ? "border-[#f8ba56]/50"
          : "border-advo-border hover:shadow-advo-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${type === "PARTNER" ? "bg-[#f8ba56]/10 text-[#f8ba56]" : "bg-sky-300/10 text-sky-200"}`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-bold tracking-tight text-advo-text">
              {copy ? t(copy.title) : plan.name}
            </h3>
            {current ? (
              <span className="rounded-full bg-[#f8ba56]/10 px-2 py-0.5 text-xs font-semibold text-[#f8ba56]">
                {t("reseller.subscription.kpi.plan")}
              </span>
            ) : null}
            {plan.isDemo ? (
              <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                DEMO
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs font-medium text-advo-muted">
            {copy ? t(copy.subtitle) : capacityLine(t, capacityOf(plan))}
          </p>
        </div>
      </div>

      {copy || plan.description ? (
        <p className="mt-3 text-sm leading-relaxed text-advo-muted">
          {copy ? t(copy.body) : plan.description}
        </p>
      ) : null}

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
          {t("reseller.subscription.plans.perDays", { days: plan.periodDays })}
        </span>
      </div>

      <ul className="mt-3 flex-1 space-y-2 border-t border-advo-border pt-3 text-xs">
        <Bullet
          on={adsOn}
          label={t(
            banner.mode === "OPTIONAL"
              ? "reseller.subscription.catalog.bullet.adsOptional"
              : adsOn
                ? "reseller.subscription.catalog.bullet.adsOn"
                : "reseller.subscription.catalog.bullet.adsOff",
          )}
        />
        <Bullet
          on={exploreOn}
          label={t(
            explore.mode === "OPTIONAL"
              ? "reseller.subscription.catalog.bullet.exploreOptional"
              : exploreOn
                ? "reseller.subscription.catalog.bullet.exploreOn"
                : "reseller.subscription.catalog.bullet.exploreOff",
          )}
        />
        {copy ? (
          <Bullet
            on={features.branding.colors_edit && features.branding.logo_upload}
            label={t("reseller.subscription.catalog.bullet.branding")}
          />
        ) : null}
      </ul>

      {mismatched ? (
        <p className="mt-2 rounded-lg bg-amber-300/10 px-2 py-1.5 text-xs font-semibold text-amber-200">
          {t("reseller.subscription.catalog.mismatch")}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-advo-border pt-3.5">
        <button
          type="button"
          onClick={() => onChoose(plan)}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f8ba56] px-3 py-2 text-sm font-bold text-[#251805] hover:bg-[#ffd088]"
        >
          {current ? (
            <Smartphone className="size-4 shrink-0" />
          ) : (
            <ArrowUpRight className="size-4 shrink-0" />
          )}
          {actionFor(plan)}
        </button>
        <button
          type="button"
          onClick={() => onDetail(plan)}
          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-advo-border px-3 py-2 text-sm font-semibold text-advo-text hover:bg-advo-surface-soft"
        >
          <Info className="size-4 shrink-0" />
          {t("reseller.subscription.plans.viewFeatures")}
        </button>
        {canTrial ? (
          <button
            type="button"
            disabled={trialPending}
            onClick={() => onTrial(plan)}
            className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-advo-border py-2 text-sm font-semibold text-advo-text hover:bg-advo-surface-soft disabled:opacity-60"
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
