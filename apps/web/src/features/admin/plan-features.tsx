"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AD_MODES,
  HEX_COLOR_REGEX,
  MIN_BRAND_CONTRAST,
  PACKAGE_CARD_STYLES,
  PACKAGE_LAYOUTS,
  PLAN_PRESETS,
  VISIBILITY_KEYS,
  canHideAllSponsored,
  contrastRatio,
  normalizePlanFeatures,
  placementOf,
  planFeaturesWithDefaults,
  resolveVisibility,
  setPlacement,
  validatePlanFeatures,
  type AdMode,
  type CommercialPromise,
  type PackageCardLayout,
  type PackageCardStyle,
  type PlanFeatures,
  type PlanLifecycle,
  type PlanPresetKey,
  type VisibilityKey,
} from "@advo/contracts";
import { AdvoSelect, Notice, StatusChip } from "@advo/ui";
import { Check, Infinity as InfinityIcon, Lock, ShieldAlert, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────────────
 * The editable draft
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Everything the feature editor owns for one plan version.
 *
 * Kept as one object so a preset can replace the whole thing atomically: a preset
 * that changed the promise but not the placements would be a contradiction the
 * publisher would then reject.
 */
export type PlanDraft = {
  features: PlanFeatures;
  commercialPromise: CommercialPromise;
  lifecycle: PlanLifecycle;
  /** Which preset last filled the draft, or `custom` once a value is touched. */
  preset: PlanPresetKey | "custom";
};

/** Reads a stored plan row into an editable draft, filling every missing key. */
export function planDraftFrom(
  plan: { features?: unknown; commercialPromise?: string; lifecycle?: string } | null,
  // A brand-new plan keeps the previous behaviour and goes on sale; the segmented
  // control next to it is what turns it into a draft instead.
  fallbackLifecycle: PlanLifecycle = "PUBLISHED",
): PlanDraft {
  return {
    features: planFeaturesWithDefaults(plan?.features),
    commercialPromise: (plan?.commercialPromise as CommercialPromise) ?? "standard",
    lifecycle: (plan?.lifecycle as PlanLifecycle) ?? fallbackLifecycle,
    // An existing plan was not written by a preset, so it starts as custom.
    preset: "custom",
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Editor
 * ───────────────────────────────────────────────────────────────────────── */

const SPONSORED_KEYS: readonly VisibilityKey[] = ["ads.banner", "ads.explore"];
const DISCOVERY_KEYS: readonly VisibilityKey[] = [
  "discovery.promote_business",
  "discovery.platform_link",
  "discovery.jobs",
];

/**
 * The plan's feature configuration, edited by key rather than by name.
 *
 * Every control patches the `features` JSON directly, so what the admin sees is
 * what `resolveSiteConfig` will read. Publishing validates the same object, and
 * the issue list below is that validator running live — the admin never has to
 * save to discover a contradiction.
 */
export function PlanFeatureEditor({
  draft,
  onChange,
}: {
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
}) {
  const { t } = useI18n();
  const { features, commercialPromise, lifecycle } = draft;

  const issues = validatePlanFeatures(features, { commercialPromise });

  /** Any manual edit leaves the preset behind — the draft is no longer that preset. */
  function patch(next: Partial<PlanDraft> & { features?: PlanFeatures }) {
    onChange({ ...draft, ...next, preset: "custom" });
  }

  function applyPreset(key: PlanPresetKey) {
    const preset = PLAN_PRESETS.find((entry) => entry.key === key);
    if (!preset) return;
    onChange({
      features: preset.features,
      commercialPromise: preset.commercialPromise,
      lifecycle,
      preset: key,
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-advo-muted">{t("admin.plans.form.featuresHint")}</p>

      {/* ── Preset ── */}
      <FeatureSection icon={<Sparkles />} title={t("admin.plans.preset.label")}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PLAN_PRESETS.map((preset) => (
              <button
                aria-pressed={draft.preset === preset.key}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  draft.preset === preset.key
                    ? "bg-advo-blue text-white"
                    : "bg-advo-surface-soft text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
                }`}
                key={preset.key}
                onClick={() => applyPreset(preset.key)}
                title={preset.description}
                type="button"
              >
                {t(`admin.plans.preset.${preset.key}`)}
              </button>
            ))}
            {draft.preset === "custom" ? (
              <span className="rounded-full bg-advo-warning-soft px-3 py-1.5 text-[11px] font-bold text-[#b45309]">
                {t("admin.plans.preset.custom")}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-advo-muted">{t("admin.plans.preset.hint")}</p>
        </div>
      </FeatureSection>

      {/* ── Promise & lifecycle ── */}
      <FeatureSection icon={<ShieldAlert />} title={t("admin.plans.promise.label")}>
        <div className="space-y-4">
          <Segmented
            onChange={(value) => patch({ commercialPromise: value })}
            options={[
              { id: "standard", label: t("admin.plans.promise.standard") },
              { id: "ad_free", label: t("admin.plans.promise.ad_free") },
            ]}
            value={commercialPromise}
          />
          {commercialPromise === "ad_free" ? (
            <Notice tone="warning">{t("admin.plans.promise.adFreeNote")}</Notice>
          ) : null}

          <div>
            <p className="mb-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
              {t("admin.plans.lifecycle.label")}
            </p>
            <Segmented
              onChange={(value) => patch({ lifecycle: value })}
              options={[
                { id: "DRAFT", label: t("admin.plans.lifecycle.DRAFT") },
                { id: "PUBLISHED", label: t("admin.plans.lifecycle.PUBLISHED") },
              ]}
              value={lifecycle === "ARCHIVED" ? "DRAFT" : lifecycle}
            />
            <p className="mt-1.5 text-[11px] text-advo-muted">{t("admin.plans.lifecycleHint")}</p>
          </div>
        </div>
      </FeatureSection>

      {/* ── Placement policy ── */}
      <FeatureSection icon={<Lock />} title={t("admin.plans.visibility.title")}>
        <div className="space-y-3">
          <p className="text-[11px] text-advo-muted">{t("admin.plans.visibility.hint")}</p>
          <PlacementGroup
            keys={SPONSORED_KEYS}
            label={t("admin.plans.placement.group.sponsored")}
            onPatch={patch}
            features={features}
          />
          <PlacementGroup
            keys={DISCOVERY_KEYS}
            label={t("admin.plans.placement.group.discovery")}
            onPatch={patch}
            features={features}
          />
        </div>
      </FeatureSection>

      {/* ── Branding ── */}
      <FeatureSection icon={<Check />} title={t("admin.plans.branding.title")}>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle
              checked={features.branding.logo_upload}
              label={t("admin.plans.branding.logoUpload")}
              onChange={(checked) => patch({ features: { ...features, branding: { ...features.branding, logo_upload: checked } } })}
            />
            <Toggle
              checked={features.branding.colors_edit}
              label={t("admin.plans.branding.colorsEdit")}
              onChange={(checked) => patch({ features: { ...features, branding: { ...features.branding, colors_edit: checked } } })}
            />
            <Toggle
              checked={features.branding.platform_badge_removable}
              label={t("admin.plans.branding.badgeRemovable")}
              onChange={(checked) =>
                patch({ features: { ...features, branding: { ...features.branding, platform_badge_removable: checked } } })
              }
            />
          </div>
          <p className="text-[11px] text-advo-muted">{t("admin.plans.branding.badgeNote")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField
              label={t("admin.plans.branding.primary")}
              onChange={(hex) =>
                patch({ features: { ...features, branding: { ...features.branding, default_primary_color: hex } } })
              }
              value={features.branding.default_primary_color}
            />
            <ColorField
              label={t("admin.plans.branding.accent")}
              onChange={(hex) =>
                patch({ features: { ...features, branding: { ...features.branding, default_accent_color: hex } } })
              }
              value={features.branding.default_accent_color}
            />
          </div>
        </div>
      </FeatureSection>

      {/* ── Package cards & payments ── */}
      <FeatureSection icon={<Check />} title={t("admin.plans.cards.title")}>
        <div className="space-y-3">
          <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
            {t("admin.plans.cards.allowed")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PACKAGE_CARD_STYLES.map((style) => {
              const allowed = features.package_cards.allowed_styles;
              const on = allowed.includes(style);
              return (
                <button
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    on
                      ? "bg-advo-teal text-white"
                      : "bg-advo-surface-soft text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
                  }`}
                  key={style}
                  // The last style cannot be removed: publishing requires at least one.
                  onClick={() => {
                    const next = on ? allowed.filter((s) => s !== style) : [...allowed, style];
                    if (next.length === 0) return;
                    const fallback = next.includes(features.package_cards.default_style)
                      ? features.package_cards.default_style
                      : next[0];
                    patch({
                      features: {
                        ...features,
                        package_cards: {
                          ...features.package_cards,
                          allowed_styles: next,
                          default_style: fallback as PackageCardStyle,
                        },
                      },
                    });
                  }}
                  type="button"
                >
                  {on ? <Check className="size-3" /> : null}
                  {t(`admin.plans.style.${style}`)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                {t("admin.plans.cards.default")}
              </span>
              <AdvoSelect
                className="mt-1"
                onChange={(e) =>
                  patch({ features: { ...features, package_cards: { ...features.package_cards, default_style: e.target.value as PackageCardStyle } } })
                }
                value={features.package_cards.default_style}
              >
                {features.package_cards.allowed_styles.map((style) => (
                  <option key={style} value={style}>
                    {t(`admin.plans.style.${style}`)}
                  </option>
                ))}
              </AdvoSelect>
            </label>
            <div className="flex items-end pb-1">
              <Toggle
                checked={features.packages.order_edit}
                label={t("admin.plans.cards.orderEdit")}
                onChange={(checked) => patch({ features: { ...features, packages: { order_edit: checked } } })}
              />
            </div>
          </div>

          {/* Arrangements are plan-gated exactly like styles: a plan only ever offers
              the layouts it allows, and the default must be one of them. */}
          <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
            {t("admin.plans.layout.title")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PACKAGE_LAYOUTS.map((layout) => {
              const allowed = features.package_cards.allowed_layouts;
              const on = allowed.includes(layout);
              return (
                <button
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    on
                      ? "bg-advo-teal text-white"
                      : "bg-advo-surface-soft text-advo-muted hover:bg-advo-blue-soft hover:text-advo-blue"
                  }`}
                  key={layout}
                  onClick={() => {
                    const next = on ? allowed.filter((l) => l !== layout) : [...allowed, layout];
                    if (next.length === 0) return;
                    const fallback = next.includes(features.package_cards.default_layout)
                      ? features.package_cards.default_layout
                      : next[0];
                    patch({
                      features: {
                        ...features,
                        package_cards: {
                          ...features.package_cards,
                          allowed_layouts: next,
                          default_layout: fallback as PackageCardLayout,
                        },
                      },
                    });
                  }}
                  type="button"
                >
                  {on ? <Check className="size-3" /> : null}
                  {t(`admin.plans.layout.${layout}`)}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">
                {t("admin.plans.layout.default")}
              </span>
              <AdvoSelect
                className="mt-1"
                onChange={(e) =>
                  patch({
                    features: {
                      ...features,
                      package_cards: {
                        ...features.package_cards,
                        default_layout: e.target.value as PackageCardLayout,
                      },
                    },
                  })
                }
                value={features.package_cards.default_layout}
              >
                {features.package_cards.allowed_layouts.map((layout) => (
                  <option key={layout} value={layout}>
                    {t(`admin.plans.layout.${layout}`)}
                  </option>
                ))}
              </AdvoSelect>
            </label>
          </div>

          <div className="border-t border-[var(--advo-border)] pt-3">
            <p className="mb-2 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
              {t("admin.plans.payments.title")}
            </p>
            <Toggle
              checked={features.payments.voucher}
              label={t("admin.plans.payments.voucher")}
              onChange={(checked) => patch({ features: { ...features, payments: { voucher: checked } } })}
            />
          </div>
        </div>
      </FeatureSection>

      {/* ── Limits ── */}
      <FeatureSection icon={<InfinityIcon />} title={t("admin.plans.form.section.limits")}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <LimitField
              label={t("admin.plans.limits.sites")}
              onChange={(value) => patch({ features: { ...features, limits: { ...features.limits, sites: value } } })}
              value={features.limits.sites}
            />
            <LimitField
              label={t("admin.plans.limits.devices")}
              onChange={(value) => patch({ features: { ...features, limits: { ...features.limits, devices: value } } })}
              value={features.limits.devices}
            />
            <LimitField
              label={t("admin.plans.limits.packagesPerSite")}
              onChange={(value) =>
                patch({ features: { ...features, limits: { ...features.limits, wifi_packages_per_site: value } } })
              }
              value={features.limits.wifi_packages_per_site}
            />
          </div>
          <p className="text-[11px] text-advo-muted">{t("admin.plans.limits.note")}</p>
        </div>
      </FeatureSection>

      {/* ── Live validation + preview of the resolved portal ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--advo-border)] p-3.5">
          {issues.length === 0 ? (
            <Notice tone="success">{t("admin.plans.issues.ok")}</Notice>
          ) : (
            <Notice tone="danger">
              <span className="block font-bold">{t("admin.plans.issues.title", { count: issues.length })}</span>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {issues.map((issue) => (
                  <li key={`${issue.key}:${issue.message}`}>
                    <span className="font-mono font-bold">{issue.key}</span> — {issue.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
        <PlanFeaturePreview features={features} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── Preview ─────────────────────────────── */

/**
 * What the plan resolves to for a site that has not chosen anything yet.
 *
 * This runs the same `resolveVisibility` the backend uses, so "Required" reads as
 * "visible and locked" here exactly as it will on the reseller's screen.
 */
export function PlanFeaturePreview({ features }: { features: PlanFeatures }) {
  const { t } = useI18n();
  const normalized = normalizePlanFeatures(features);

  return (
    <div className="rounded-2xl border border-[var(--advo-border)] bg-advo-surface-soft/40 p-3.5">
      <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{t("admin.plans.preview.title")}</p>
      <p className="mt-0.5 mb-2.5 text-[11px] text-advo-muted">{t("admin.plans.preview.hint")}</p>
      <ul className="space-y-1.5">
        {VISIBILITY_KEYS.map((key) => {
          const policy = placementOf(normalized, key);
          const decision = resolveVisibility(policy.mode, undefined, policy.default_visible);
          return (
            <li className="flex items-center justify-between gap-2 text-[11px]" key={key}>
              <span className="truncate font-semibold text-advo-text">{t(`admin.plans.placement.${key}`)}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <StatusChip tone={decision.visible ? "success" : "default"}>
                  {decision.visible ? t("admin.plans.preview.visible") : t("admin.plans.preview.hidden")}
                </StatusChip>
                {decision.lock ? (
                  <StatusChip tone={decision.lock === "REQUIRED" ? "accent" : "default"}>
                    {t(`admin.plans.mode.${decision.lock}`)}
                  </StatusChip>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[var(--advo-border)] pt-2.5">
        <StatusChip tone={normalized.payments.voucher ? "success" : "default"}>
          {normalized.payments.voucher ? t("admin.plans.preview.voucherOn") : t("admin.plans.preview.voucherOff")}
        </StatusChip>
        <StatusChip tone="accent">
          {t("admin.plans.preview.styles", { count: normalized.package_cards.allowed_styles.length })}
        </StatusChip>
        <StatusChip tone={canHideAllSponsored(normalized) ? "success" : "warning"}>
          {canHideAllSponsored(normalized) ? t("admin.plans.preview.hideAll") : t("admin.plans.preview.hideAllNo")}
        </StatusChip>
      </div>
    </div>
  );
}

/** The live validation list on its own, so a card can show it without the editor. */
export function planIssues(features: PlanFeatures, commercialPromise: CommercialPromise) {
  return validatePlanFeatures(features, { commercialPromise });
}

/* ─────────────────────────────── Pieces ─────────────────────────────── */

/** One placement row: a mode selector plus the optional default switch. */
function PlacementRow({
  placementKey,
  features,
  onPatch,
}: {
  placementKey: VisibilityKey;
  features: PlanFeatures;
  onPatch: (next: { features: PlanFeatures }) => void;
}) {
  const { t } = useI18n();
  const policy = placementOf(features, placementKey);
  const locked = policy.mode !== "OPTIONAL";

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--advo-border)] bg-white/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-advo-text">{t(`admin.plans.placement.${placementKey}`)}</p>
        <p className="text-[10px] text-advo-muted">{t(`admin.plans.mode.${policy.mode}.hint`)}</p>
      </div>
      <AdvoSelect
        aria-label={t(`admin.plans.placement.${placementKey}`)}
        className="w-32 shrink-0 py-1.5 text-[11px]"
        onChange={(e) => onPatch({ features: setPlacement(features, placementKey, { mode: e.target.value as AdMode }) })}
        value={policy.mode}
      >
        {AD_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {t(`admin.plans.mode.${mode}`)}
          </option>
        ))}
      </AdvoSelect>
      <label className={`flex shrink-0 items-center gap-1.5 text-[11px] ${locked ? "opacity-50" : ""}`}>
        <input
          checked={policy.default_visible}
          className="h-3.5 w-3.5 accent-[var(--advo-blue)]"
          disabled={locked}
          onChange={(e) => onPatch({ features: setPlacement(features, placementKey, { default_visible: e.target.checked }) })}
          type="checkbox"
        />
        {t("admin.plans.visibility.default")}
      </label>
    </li>
  );
}

/** A titled group of placements. */
function PlacementGroup({
  label,
  keys,
  features,
  onPatch,
}: {
  label: string;
  keys: readonly VisibilityKey[];
  features: PlanFeatures;
  onPatch: (next: { features: PlanFeatures }) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <ul className="space-y-1.5">
        {keys.map((key) => (
          <PlacementRow features={features} key={key} onPatch={onPatch} placementKey={key} />
        ))}
      </ul>
    </div>
  );
}

/** Two-or-more option pills; used for the promise and the lifecycle. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full bg-advo-surface-soft p-1">
      {options.map((option) => (
        <button
          aria-pressed={value === option.id}
          className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
            value === option.id ? "bg-white text-advo-blue shadow-advo-card" : "text-advo-muted hover:text-advo-blue"
          }`}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Checkbox with the label wrapping the input, matching the plans screen. */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-[var(--advo-border)] bg-white/60 px-3 py-2 text-xs font-semibold text-advo-text">
      <input
        checked={checked}
        className="h-4 w-4 accent-[var(--advo-blue)]"
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

/**
 * A reviewed hex colour with a live contrast verdict.
 *
 * Portals render white text on the brand colour, so a colour failing the 3:1 floor
 * would ship an unreadable "Buy" button. The swatch and the text field stay in
 * step, and only a complete hex is committed — half-typed values never reach the
 * plan, which is why the backend can trust the stored colour.
 */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  const ratio = contrastRatio(value, "#ffffff");
  const ok = ratio >= MIN_BRAND_CONTRAST;

  return (
    <div>
      <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          aria-label={label}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-[var(--advo-border)] bg-white p-0.5"
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          type="color"
          value={value}
        />
        <input
          aria-label={`${label} hex`}
          className="w-full rounded-field bg-field px-2.5 py-1.5 font-mono text-xs text-field-foreground shadow-field outline-none"
          onChange={(e) => {
            const next = e.target.value.trim();
            setText(next);
            if (HEX_COLOR_REGEX.test(next)) onChange(next.toUpperCase());
          }}
          spellCheck={false}
          value={text}
        />
      </div>
      <p className={`mt-1 text-[11px] font-semibold ${ok ? "text-emerald-700" : "text-[#b45309]"}`}>
        {ok
          ? t("admin.plans.branding.contrast", { ratio: ratio.toFixed(1) })
          : t("admin.plans.branding.contrastFail", { min: MIN_BRAND_CONTRAST })}
      </p>
    </div>
  );
}

/**
 * A numeric cap with an explicit Unlimited switch.
 *
 * `null` is the only representation of unlimited, so the UI is what keeps a `0`
 * from ever meaning "none allowed" to the backend.
 */
function LimitField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const { t } = useI18n();
  const unlimited = value === null;

  return (
    <div className="rounded-xl border border-[var(--advo-border)] bg-white/60 px-3 py-2">
      <p className="text-[10px] font-bold tracking-wider text-advo-muted uppercase">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          aria-label={label}
          className="w-20 rounded-field bg-field px-2 py-1 text-sm text-field-foreground shadow-field outline-none disabled:opacity-40"
          disabled={unlimited}
          min={1}
          max={100000}
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10);
            onChange(Number.isNaN(next) ? 1 : Math.min(Math.max(next, 1), 100000));
          }}
          type="number"
          value={unlimited ? "" : value}
        />
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-advo-muted">
          <input
            checked={unlimited}
            className="h-3.5 w-3.5 accent-[var(--advo-blue)]"
            onChange={(e) => onChange(e.target.checked ? null : 50)}
            type="checkbox"
          />
          {t("admin.plans.limits.unlimited")}
        </label>
      </div>
    </div>
  );
}

/** A titled group of controls inside the plan modal. */
function FeatureSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-[var(--advo-border)] p-4">
      <legend className="flex items-center gap-1.5 px-1.5 text-[10px] font-bold tracking-wider text-advo-muted uppercase">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
