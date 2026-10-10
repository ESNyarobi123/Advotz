"use client";

import type { ReactNode } from "react";
import { formatTzs } from "@advo/api-client";
import {
  PACKAGE_CARD_STYLES,
  VISIBILITY_KEYS,
  normalizePlanFeatures,
  planFeaturesWithDefaults,
  placementOf,
  resolveVisibility,
  type AdMode,
  type PackageCardStyle,
  type PlanFeatures,
  type VisibilityKey,
} from "@advo/contracts";
import { Button, Drawer, useOverlayState } from "@heroui/react";
import { StatusChip } from "@advo/ui";
import { Check, Infinity as InfinityIcon, Lock, Sparkles, X } from "lucide-react";

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
  periodDays: number;
  trialEligible: boolean;
  trialDays: number | null;
  maxSites: number | null;
  maxDevices: number | null;
  maxPackages: number | null;
  isDemo: boolean;
  commercialPromise: string;
  lifecycle: string;
  /** The feature catalog values this version grants. */
  features: unknown;
};

/** A capacity trio; `null` means unlimited, never "none". */
export type PlanCapacity = { sites: number | null; devices: number | null; wifiPackagesPerSite: number | null };

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
  const stored = Boolean(raw && typeof raw === "object" && "limits" in (raw as Record<string, unknown>));
  if (stored) {
    const limits = planFeaturesWithDefaults(raw).limits;
    return { sites: limits.sites, devices: limits.devices, wifiPackagesPerSite: limits.wifi_packages_per_site };
  }
  return { sites: plan.maxSites, devices: plan.maxDevices, wifiPackagesPerSite: plan.maxPackages };
}

/** `null` is unlimited — rendering a bare `null` would read as "none allowed". */
export function formatCapacity(value: number | null): string {
  return value === null ? "Unlimited" : String(value);
}

const PLACEMENT_LABEL: Record<VisibilityKey, string> = {
  "ads.banner": "Sponsored banner",
  "ads.explore": "Explore carousel",
  "discovery.promote_business": "Promote your business",
  "discovery.platform_link": "Advo platform link",
  "discovery.jobs": "Jobs board",
};

const MODE_LABEL: Record<AdMode, string> = {
  REQUIRED: "Always on",
  OPTIONAL: "Your choice",
  DISABLED: "Not in this plan",
};

const STYLE_LABEL: Record<PackageCardStyle, string> = {
  classic: "Classic",
  compact: "Compact",
  soft: "Soft",
  outlined: "Outlined",
  bold: "Bold",
};

/** A short, honest one-liner for what the two campaign placements add up to. */
export function advertisingSummary(features: PlanFeatures): string {
  const modes = VISIBILITY_KEYS.slice(0, 2).map((key) => placementOf(features, key).mode);
  if (modes.every((mode) => mode === "DISABLED")) return "No advertising";
  if (modes.some((mode) => mode === "REQUIRED")) return "Sponsored ads required";
  return "Advertising can be switched off";
}

/**
 * The features worth naming on a plan card, in the order a reseller cares about.
 *
 * Every line is read from the same key the portal obeys, so a bullet can never
 * advertise a capability the plan does not actually grant.
 */
export function planHighlights(features: PlanFeatures): string[] {
  const out: string[] = [advertisingSummary(features)];

  if (features.branding.colors_edit) out.push("Your own brand colours & logo");
  if (features.branding.platform_badge_removable) out.push("Remove the Advo badge");
  if (features.payments.voucher) out.push("Voucher redemption");
  if (features.packages.order_edit) out.push("Reorder WiFi packages");
  out.push(`${features.package_cards.allowed_styles.length} package card styles`);
  if (features.limits.sites === null && features.limits.devices === null) out.push("Unlimited sites & devices");

  return out;
}

/**
 * The full plan, opened from a card.
 *
 * The card can only carry a summary; capacity, every placement's policy and the
 * branding switches are what a reseller actually chooses between, so they get a
 * panel rather than being hidden behind a buy button.
 */
export function PlanDetailDrawer({
  plan,
  open,
  onClose,
  onChoose,
  onTrial,
  trialUsed,
  trialPending,
}: {
  plan: ResellerPlan | null;
  open: boolean;
  onClose: () => void;
  onChoose: (plan: ResellerPlan) => void;
  onTrial: (plan: ResellerPlan) => void;
  trialUsed: boolean;
  trialPending: boolean;
}) {
  const overlay = useOverlayState({ isOpen: open, onOpenChange: (next) => (!next ? onClose() : undefined) });

  if (!plan) return null;

  const features = normalizePlanFeatures(planFeaturesWithDefaults(plan.features));
  const capacity = capacityOf(plan);
  const canTrial = plan.trialEligible && (plan.trialDays ?? 0) > 0 && !trialUsed;

  return (
    <Drawer.Root state={overlay}>
      <Drawer.Backdrop>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="bg-white">
            <Drawer.Header>
              <Drawer.Heading className="text-base font-black text-advo-text">{plan.name}</Drawer.Heading>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-advo-muted">
                <span className="font-mono font-bold">{plan.code}</span>
                <span>·</span>
                <span>{plan.periodDays} days</span>
                {plan.isDemo ? (
                  <>
                    <span>·</span>
                    <span className="font-bold text-amber-600">DEMO PRICE</span>
                  </>
                ) : null}
              </p>
            </Drawer.Header>

            <Drawer.Body className="space-y-5">
              {/* Price */}
              <div className="rounded-2xl border border-[var(--advo-border)] bg-gradient-to-br from-white to-[var(--advo-blue-soft)] px-4 py-3.5">
                <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">Price</p>
                <p className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-2xl font-black tracking-tight text-advo-text tabular-nums">
                    {formatTzs(plan.priceTzs)}
                  </span>
                  <span className="text-xs text-slate-500">/ {plan.periodDays} days</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusChip tone={plan.commercialPromise === "ad_free" ? "accent" : "default"}>
                    {plan.commercialPromise === "ad_free" ? "Ad Free promise" : "Standard"}
                  </StatusChip>
                  {plan.trialEligible && plan.trialDays ? (
                    <StatusChip tone="success">{plan.trialDays}-day free trial</StatusChip>
                  ) : (
                    <StatusChip tone="default">No trial</StatusChip>
                  )}
                </div>
              </div>

              {plan.description ? <p className="text-xs text-slate-600">{plan.description}</p> : null}

              {/* Capacity */}
              <Section icon={<InfinityIcon />} title="Capacity">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <CapacityTile label="Sites" value={capacity.sites} />
                  <CapacityTile label="Access points" value={capacity.devices} />
                  <CapacityTile label="Packages / site" value={capacity.wifiPackagesPerSite} />
                </div>
              </Section>

              {/* Advertising & discovery */}
              <Section icon={<Sparkles />} title="Advertising & discovery">
                <ul className="space-y-1.5">
                  {VISIBILITY_KEYS.map((key) => {
                    const policy = placementOf(features, key);
                    const decision = resolveVisibility(policy.mode, undefined, policy.default_visible);
                    return (
                      <li
                        className="flex items-center justify-between gap-3 rounded-xl border border-[var(--advo-border)] bg-white/60 px-3 py-2"
                        key={key}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {decision.lock ? (
                            <Lock className="size-3 shrink-0 text-advo-muted" />
                          ) : (
                            <Sparkles className="size-3 shrink-0 text-advo-muted" />
                          )}
                          <span className="truncate text-xs font-semibold text-advo-text">{PLACEMENT_LABEL[key]}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <StatusChip tone={decision.visible ? "success" : "default"}>
                            {decision.visible ? "Visible" : "Hidden"}
                          </StatusChip>
                          <span className="text-[10px] font-semibold text-advo-muted">{MODE_LABEL[policy.mode]}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Section>

              {/* Branding & appearance */}
              <Section icon={<Check />} title="Branding & appearance">
                <ul className="space-y-1.5">
                  <FlagRow label="Upload your own logo" on={features.branding.logo_upload} />
                  <FlagRow label="Edit portal colours" on={features.branding.colors_edit} />
                  <FlagRow label="Remove the Advo badge" on={features.branding.platform_badge_removable} />
                  <FlagRow label="Reorder WiFi packages" on={features.packages.order_edit} />
                </ul>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PACKAGE_CARD_STYLES.map((style) => {
                    const allowed = features.package_cards.allowed_styles.includes(style);
                    const isDefault = features.package_cards.default_style === style;
                    return (
                      <StatusChip key={style} tone={allowed ? "success" : "default"}>
                        {allowed ? `${STYLE_LABEL[style]}${isDefault ? " (default)" : ""}` : `${STYLE_LABEL[style]}: no`}
                      </StatusChip>
                    );
                  })}
                </div>
              </Section>

              {/* Payments */}
              <Section icon={<Check />} title="Payments">
                <FlagRow label="Voucher redemption" on={features.payments.voucher} />
              </Section>

              {/* Summary */}
              <Section icon={<Sparkles />} title="In short">
                <ul className="space-y-1">
                  {planHighlights(features).map((line) => (
                    <li className="flex items-start gap-2 text-xs text-slate-700" key={line}>
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </Drawer.Body>

            <Drawer.Footer className="flex flex-col gap-2 border-t border-slate-100">
              <Button className="w-full" onPress={() => onChoose(plan)} type="button" variant="primary">
                Pay with Mobile Money
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
                  Start {plan.trialDays}-day free trial
                </Button>
              ) : null}
              {plan.trialEligible && trialUsed ? (
                <p className="text-center text-[10px] text-slate-400">Trial already used on this business.</p>
              ) : null}
            </Drawer.Footer>

            <Drawer.CloseTrigger aria-label="Close" />
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer.Root>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
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

function CapacityTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-advo-surface-soft/60 px-2 py-2">
      <p className="truncate text-sm font-black text-advo-text tabular-nums">{formatCapacity(value)}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-advo-muted">{label}</p>
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
      <span className={on ? "font-semibold text-slate-700" : "text-slate-400"}>{label}</span>
    </li>
  );
}
