"use client";

import type { ReactNode } from "react";
import { formatTzs } from "@advo/api-client";
import type { MessageKey } from "@advo/i18n";
import {
  PACKAGE_CARD_STYLES,
  VISIBILITY_KEYS,
  planFeaturesWithDefaults,
  placementOf,
  resolveVisibility,
  type AdMode,
  type PackageCardStyle,
  type VisibilityKey,
} from "@advo/contracts";
import { Button, Drawer, useOverlayState } from "@heroui/react";
import { StatusChip } from "@advo/ui";
import { useI18n } from "@/lib/i18n";
import {
  Check,
  Infinity as InfinityIcon,
  Lock,
  Sparkles,
  X,
} from "lucide-react";

/**
 * A plan as `GET /reseller/plans` returns it.
 *
 * `features` is the raw JSON snapshot, so every screen that reads it goes through
 * `planFeaturesWithDefaults` rather than trusting the shape.
 */
export type ResellerPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  priceTzs: string;
  /** Enterprise is sold "from" a price; the card must say so. */
  priceFrom: boolean;
  periodDays: number;
  trialEligible: boolean;
  trialDays: number | null;
  maxSites: number | null;
  maxDevices: number | null;
  maxPackages: number | null;
  isDemo: boolean;
  commercialPromise: string;
  lifecycle: string;
  /** Capacity tier of the two-axis catalog; `null` for plans outside the matrix. */
  tierKey: string | null;
  /** `PARTNER` or `INDEPENDENT`; `null` when the plan is not part of the matrix. */
  planType: string | null;
  /** The feature catalog values this version grants. */
  features: unknown;
};

/** A capacity trio; `null` means unlimited, never "none". */
export type PlanCapacity = {
  sites: number | null;
  devices: number | null;
  wifiPackagesPerSite: number | null;
  legacyPackages: boolean;
};

/**
 * The caps a plan version grants, read the same way the backend reads them.
 *
 * A plan written by the feature editor owns its limits outright — including an
 * explicit "unlimited" — so the presence of the `limits` key is what decides.
 * Rows predating the feature catalog fall back to the legacy columns. Mirroring
 * `planLimitsOf` here is what keeps the card from claiming a cap the runtime
 * does not actually enforce.
 */
export function capacityOf(plan: ResellerPlan): PlanCapacity {
  const raw = plan.features;
  const stored = Boolean(
    raw &&
    typeof raw === "object" &&
    "limits" in (raw as Record<string, unknown>),
  );
  if (stored) {
    const limits = planFeaturesWithDefaults(raw).limits;
    return {
      sites: limits.sites,
      devices: limits.devices,
      wifiPackagesPerSite: limits.wifi_packages_per_site,
      legacyPackages: false,
    };
  }
  return {
    sites: plan.maxSites,
    devices: plan.maxDevices,
    wifiPackagesPerSite: plan.maxPackages,
    legacyPackages: true,
  };
}

const PLACEMENT_LABEL: Record<VisibilityKey, MessageKey> = {
  "ads.banner": "reseller.subscription.detail.display.banner",
  "ads.explore": "reseller.subscription.detail.display.explore",
  "discovery.promote_business": "reseller.subscription.detail.display.promote",
  "discovery.platform_link": "reseller.subscription.detail.display.platform",
  "discovery.jobs": "reseller.subscription.detail.display.jobs",
};

const MODE_LABEL: Record<AdMode, MessageKey> = {
  REQUIRED: "reseller.subscription.detail.required",
  OPTIONAL: "reseller.subscription.detail.optional",
  DISABLED: "reseller.subscription.detail.disabled",
};

const STYLE_LABEL: Record<PackageCardStyle, string> = {
  classic: "Classic",
  compact: "Compact",
  soft: "Soft",
  outlined: "Outlined",
  bold: "Bold",
};

export function PlanDetailDrawer({
  plan,
  open,
  onClose,
  onChoose,
  onTrial,
  trialAvailable,
  trialUsed,
  trialPending,
  actionLabel,
}: {
  plan: ResellerPlan | null;
  open: boolean;
  onClose: () => void;
  onChoose: (plan: ResellerPlan) => void;
  onTrial: (plan: ResellerPlan) => void;
  trialAvailable: boolean;
  trialUsed: boolean;
  trialPending: boolean;
  actionLabel?: string;
}) {
  const { t } = useI18n();
  const overlay = useOverlayState({
    isOpen: open,
    onOpenChange: (next) => (!next ? onClose() : undefined),
  });

  if (!plan) return null;

  const features = planFeaturesWithDefaults(plan.features);
  const capacity = capacityOf(plan);
  const canTrial =
    plan.trialEligible && (plan.trialDays ?? 0) > 0 && trialAvailable;

  return (
    <Drawer.Root state={overlay}>
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="bg-advo-card">
            <Drawer.Header>
              <Drawer.Heading className="text-base font-black text-advo-text">
                {plan.name}
              </Drawer.Heading>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-advo-muted">
                <span>
                  {t("reseller.subscription.checkout.period", {
                    days: plan.periodDays,
                  })}
                </span>
                {plan.isDemo ? (
                  <>
                    <span>·</span>
                    <span className="font-bold text-amber-200">Demo</span>
                  </>
                ) : null}
              </p>
            </Drawer.Header>

            <Drawer.Body className="space-y-5">
              {/* Price */}
              <div className="rounded-2xl border border-[var(--advo-border)] bg-linear-to-br from-advo-surface-soft to-advo-page px-4 py-3.5">
                <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                  {t("reseller.subscription.checkout.summaryAmount")}
                </p>
                <p className="mt-0.5 flex items-baseline gap-1">
                  {plan.priceFrom ? (
                    <span className="text-[10px] font-bold tracking-wide text-advo-muted uppercase">
                      {t("reseller.subscription.catalog.from")}
                    </span>
                  ) : null}
                  <span className="text-2xl font-black tracking-tight text-advo-text tabular-nums">
                    {formatTzs(plan.priceTzs)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {t("reseller.subscription.plans.perDays", {
                      days: plan.periodDays,
                    })}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusChip
                    tone={
                      plan.commercialPromise === "ad_free"
                        ? "accent"
                        : "default"
                    }
                  >
                    {plan.commercialPromise === "ad_free"
                      ? t("reseller.subscription.detail.adFree")
                      : t("reseller.subscription.detail.standard")}
                  </StatusChip>
                  {plan.trialEligible && plan.trialDays ? (
                    <StatusChip tone="success">
                      {t("reseller.subscription.plans.trialBadge", {
                        days: plan.trialDays,
                      })}
                    </StatusChip>
                  ) : null}
                </div>
              </div>

              {plan.description ? (
                <p className="text-xs text-slate-600">{plan.description}</p>
              ) : null}

              {/* Capacity */}
              <Section
                icon={<InfinityIcon />}
                title={t("reseller.subscription.detail.capacity")}
              >
                <div className="grid grid-cols-3 gap-2 text-center">
                  <CapacityTile
                    label={t("reseller.subscription.plans.sites")}
                    value={capacity.sites}
                  />
                  <CapacityTile
                    label={t("reseller.subscription.plans.devices")}
                    value={capacity.devices}
                  />
                  <CapacityTile
                    label={t(
                      capacity.legacyPackages
                        ? "reseller.subscription.overview.packagesTotal"
                        : "reseller.subscription.overview.packagesPerSite",
                    )}
                    value={capacity.wifiPackagesPerSite}
                  />
                </div>
              </Section>

              {/* Advertising & discovery */}
              <Section
                icon={<Sparkles />}
                title={t("reseller.subscription.detail.discovery")}
              >
                <ul className="space-y-1.5">
                  {VISIBILITY_KEYS.map((key) => {
                    const policy = placementOf(features, key);
                    const decision = resolveVisibility(
                      policy.mode,
                      undefined,
                      policy.default_visible,
                    );
                    return (
                      <li
                        className="flex items-center justify-between gap-3 rounded-xl border border-[var(--advo-border)] bg-advo-page px-3 py-2"
                        key={key}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {decision.lock ? (
                            <Lock className="size-3 shrink-0 text-advo-muted" />
                          ) : (
                            <Sparkles className="size-3 shrink-0 text-advo-muted" />
                          )}
                          <span className="truncate text-xs font-semibold text-advo-text">
                            {t(PLACEMENT_LABEL[key])}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <StatusChip
                            tone={decision.visible ? "success" : "default"}
                          >
                            {t(
                              decision.visible
                                ? "reseller.subscription.detail.visible"
                                : "reseller.subscription.detail.hidden",
                            )}
                          </StatusChip>
                          <span className="text-[10px] font-semibold text-advo-muted">
                            {t(MODE_LABEL[policy.mode])}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Section>

              {/* Branding & appearance */}
              <Section
                icon={<Check />}
                title={t("reseller.subscription.detail.branding")}
              >
                <ul className="space-y-1.5">
                  <FlagRow
                    label={t("reseller.subscription.detail.logo")}
                    on={features.branding.logo_upload}
                  />
                  <FlagRow
                    label={t("reseller.subscription.detail.colors")}
                    on={features.branding.colors_edit}
                  />
                  <FlagRow
                    label={t("reseller.subscription.detail.badge")}
                    on={features.branding.platform_badge_removable}
                  />
                  <FlagRow
                    label={t("reseller.subscription.detail.order")}
                    on={features.packages.order_edit}
                  />
                </ul>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PACKAGE_CARD_STYLES.map((style) => {
                    const allowed =
                      features.package_cards.allowed_styles.includes(style);
                    const isDefault =
                      features.package_cards.default_style === style;
                    return (
                      <StatusChip
                        key={style}
                        tone={allowed ? "success" : "default"}
                      >
                        {!allowed
                          ? t("reseller.subscription.detail.styleUnavailable", {
                              style: STYLE_LABEL[style],
                            })
                          : isDefault
                            ? t("reseller.subscription.detail.styleDefault", {
                                style: STYLE_LABEL[style],
                              })
                            : STYLE_LABEL[style]}
                      </StatusChip>
                    );
                  })}
                </div>
              </Section>

              {/* Payments */}
              <Section icon={<Check />} title={t("nav.payments")}>
                <FlagRow
                  label={t("reseller.subscription.detail.voucher")}
                  on={features.payments.voucher}
                />
              </Section>
            </Drawer.Body>

            <Drawer.Footer className="flex flex-col gap-2 border-t border-advo-border">
              <Button
                className="w-full"
                onPress={() => onChoose(plan)}
                type="button"
                variant="primary"
              >
                {actionLabel ?? t("reseller.subscription.plans.select")}
              </Button>
              {canTrial ? (
                <Button
                  className="w-full"
                  isDisabled={trialPending}
                  onPress={() => onTrial(plan)}
                  type="button"
                  variant="outline"
                >
                  <Sparkles className="size-3.5" />
                  {t("reseller.subscription.plans.startTrial", {
                    days: plan.trialDays ?? 0,
                  })}
                </Button>
              ) : null}
              {plan.trialEligible && trialUsed ? (
                <p className="text-center text-[10px] text-slate-400">
                  {t("reseller.subscription.trial.used")}
                </p>
              ) : null}
            </Drawer.Footer>

            <Drawer.CloseTrigger aria-label={t("common.close")} />
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer.Root>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function CapacityTile({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-2 py-2">
      <p className="truncate text-sm font-black text-advo-text tabular-nums">
        {value ?? t("reseller.subscription.unlimited")}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold text-advo-muted">
        {label}
      </p>
    </div>
  );
}

function FlagRow({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {on ? (
        <Check className="size-3.5 shrink-0 text-emerald-600" />
      ) : (
        <X className="size-3.5 shrink-0 text-slate-400" />
      )}
      <span className={on ? "font-semibold text-slate-700" : "text-slate-400"}>
        {label}
      </span>
    </li>
  );
}
