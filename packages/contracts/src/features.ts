import { z } from "zod";

/**
 * The plan feature catalog.
 *
 * Every capability a reseller plan can grant is named here once, keyed by a
 * stable feature key, and nothing in the system is allowed to branch on a plan
 * *name*. Admin renames a plan, changes a mode or reprices it and behaviour
 * follows the keys; no code path needs to know the plan is called "Sponsored".
 *
 * Three things are deliberately kept apart, because conflating them is how
 * feature switches turn into decoration:
 *
 * - **Plan entitlement** — what the plan grants (`PlanFeatures`).
 * - **Reseller preference** — what the reseller chose inside that grant.
 * - **Effective config** — the resolved answer the dashboard and the guest
 *   portal actually obey (`resolveVisibility`).
 *
 * The API returns the effective config; the raw entitlement never reaches a
 * guest, and a preference can never widen it.
 */

/* ─────────────────────────────────────────────────────────────────────────
 * Modes, styles and lifecycle primitives
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * How a plan treats one sponsored placement.
 *
 * A plain ON/OFF switch cannot tell "compulsory advertising" apart from "the
 * reseller decides", so each placement carries its own mode.
 *
 * - `REQUIRED` — part of the commercial agreement. Always visible, never editable.
 * - `OPTIONAL` — the reseller switches it on or off.
 * - `DISABLED` — removed from the plan; the placement is hidden and its
 *   creatives are not even returned by the public API.
 */
export const AD_MODES = ["REQUIRED", "OPTIONAL", "DISABLED"] as const;
export type AdMode = (typeof AD_MODES)[number];
export const adModeSchema = z.enum(AD_MODES);

/**
 * The five reviewed package-card looks. A reseller picks a look, never logic.
 *
 * `bold` is the filled look: the card takes the brand colour and white text, so a
 * single "best value" package can be made to lead the eye without an admin
 * touching a layout. It is a style, not a featured flag — the ribbon is separate.
 */
export const PACKAGE_CARD_STYLES = ["classic", "compact", "soft", "outlined", "bold"] as const;
export type PackageCardStyle = (typeof PACKAGE_CARD_STYLES)[number];
export const packageCardStyleSchema = z.enum(PACKAGE_CARD_STYLES);

/**
 * How the package cards are arranged on the guest's screen.
 *
 * A separate axis from the card *look* on purpose: a reseller with one flagship
 * package wants a full-width `list`, one with six wants a `grid-3`, and both
 * should be able to use any card style. Storing them in one field would make
 * "look" and "arrangement" inseparable and force a new style for every layout.
 */
export const PACKAGE_LAYOUTS = ["list", "grid-2", "grid-3", "featured", "compact", "carousel"] as const;
export type PackageCardLayout = (typeof PACKAGE_LAYOUTS)[number];
export const packageCardLayoutSchema = z.enum(PACKAGE_LAYOUTS);

/**
 * Reviewed colour combinations for the portal.
 *
 * A reseller is not a designer, and a hex picker alone is how a portal ends up
 * with an unreadable button. Each preset is a combination that has been checked
 * against the same 3:1 contrast floor the validator enforces, so choosing one is
 * always safe and the picker is a starting point rather than the only control.
 *
 * `name` is a design name rather than an i18n key, exactly like plan names: the
 * admin catalog and this list stay editable without a translation change.
 */
export type PortalColorPreset = {
  key: string;
  name: string;
  primary: string;
  accent: string;
  background: string;
};

export const PORTAL_COLOR_PRESETS: readonly PortalColorPreset[] = [
  { key: "classic", name: "Classic navy", primary: "#172D43", accent: "#D1500F", background: "#F5F7FB" },
  { key: "ocean", name: "Ocean blue", primary: "#0B4F6C", accent: "#0E7490", background: "#F1F7FA" },
  { key: "forest", name: "Forest green", primary: "#14532D", accent: "#3F6212", background: "#F4F8F3" },
  { key: "royal", name: "Royal purple", primary: "#3B0764", accent: "#7E22CE", background: "#F7F4FB" },
  { key: "sunset", name: "Sunset", primary: "#7C2D12", accent: "#B45309", background: "#FDF6F1" },
  { key: "graphite", name: "Graphite", primary: "#111827", accent: "#374151", background: "#F3F4F6" },
];

export function portalColorPreset(key: string): PortalColorPreset | undefined {
  return PORTAL_COLOR_PRESETS.find((preset) => preset.key === key);
}

/**
 * The commercial promise a plan is sold under.
 *
 * `ad_free` is a contract, not a label: a plan may only be published with it
 * when every sponsored placement is `DISABLED`, so an "Ad Free" reseller can
 * never be served an advert through a switch someone forgot to flip. It is
 * independent of the platform badge — removing advertising does not remove
 * attribution, which stays a separate permission.
 */
export const COMMERCIAL_PROMISES = ["standard", "ad_free"] as const;
export type CommercialPromise = (typeof COMMERCIAL_PROMISES)[number];
export const commercialPromiseSchema = z.enum(COMMERCIAL_PROMISES);

/** Draft plans never affect live subscribers; only a published version is served. */
export const PLAN_LIFECYCLES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PlanLifecycle = (typeof PLAN_LIFECYCLES)[number];
export const planLifecycleSchema = z.enum(PLAN_LIFECYCLES);

/** Public plans appear in the reseller catalog; private ones are assigned by admin. */
export const PLAN_VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;
export type PlanVisibility = (typeof PLAN_VISIBILITIES)[number];
export const planVisibilitySchema = z.enum(PLAN_VISIBILITIES);

/** Strict 6-digit hex; the portal templates only accept reviewed colours. */
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
export const hexColorSchema = z.string().trim().regex(HEX_COLOR_REGEX, "Use a hex color like #1b5ea4");

/* ─────────────────────────────────────────────────────────────────────────
 * The five visibility-governed placements
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Placements whose visibility a plan can govern.
 *
 * Banner and Explore are the campaign placements; the three `discovery.*` keys
 * govern the shortcuts under the connected page. A new sponsored surface added
 * later must get a key here — otherwise it has no policy and cannot ship.
 */
export const VISIBILITY_KEYS = [
  "ads.banner",
  "ads.explore",
  "discovery.promote_business",
  "discovery.platform_link",
  "discovery.jobs",
] as const;
export type VisibilityKey = (typeof VISIBILITY_KEYS)[number];
export const visibilityKeySchema = z.enum(VISIBILITY_KEYS);

/** The two keys that are backed by ad campaigns rather than by a static link. */
export const SPONSORED_VISIBILITY_KEYS = ["ads.banner", "ads.explore"] as const satisfies readonly VisibilityKey[];
export type SponsoredVisibilityKey = (typeof SPONSORED_VISIBILITY_KEYS)[number];

/** The three `discovery.*` shortcuts. */
export const DISCOVERY_VISIBILITY_KEYS = [
  "discovery.promote_business",
  "discovery.platform_link",
  "discovery.jobs",
] as const satisfies readonly VisibilityKey[];
export type DiscoveryVisibilityKey = (typeof DISCOVERY_VISIBILITY_KEYS)[number];

/**
 * Whether a visible placement still has a campaign to show.
 * `renderPlacement = effectiveVisibility AND eligibleCampaigns.length > 0`,
 * so a `REQUIRED` placement collapses instead of rendering an empty card.
 */
export function renderPlacement(visible: boolean, eligibleCampaignCount: number): boolean {
  return visible && eligibleCampaignCount > 0;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Plan features (the entitlement half)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * One placement's policy inside a plan.
 *
 * `default_visible` only means something for `OPTIONAL`; for `REQUIRED` it is
 * forced true and for `DISABLED` forced false, so a stored plan can never hold
 * a contradictory pair. `normalizePlacement` is what enforces that.
 */
export const placementPolicySchema = z
  .object({
    mode: adModeSchema.default("OPTIONAL"),
    default_visible: z.boolean().default(true),
  })
  .strict();

export type PlacementPolicy = z.infer<typeof placementPolicySchema>;

/** Applies the mode's non-negotiable default so REQUIRED/DISABLED cannot contradict. */
export function normalizePlacement(input: { mode?: AdMode; default_visible?: boolean } | undefined): PlacementPolicy {
  const mode: AdMode = input?.mode ?? "OPTIONAL";
  if (mode === "REQUIRED") return { mode, default_visible: true };
  if (mode === "DISABLED") return { mode, default_visible: false };
  return { mode, default_visible: input?.default_visible ?? true };
}

/**
 * Limits are optional numeric caps.
 *
 * `null` means unlimited — never `0`, which would silently mean "none allowed"
 * to a reader who assumed the usual "zero is unlimited" convention.
 */
export const limitValueSchema = z.number().int().min(1).max(100_000).nullable();

export const planLimitsSchema = z
  .object({
    sites: limitValueSchema.default(null),
    devices: limitValueSchema.default(null),
    wifi_packages_per_site: limitValueSchema.default(null),
  })
  .strict();

export type PlanLimits = z.infer<typeof planLimitsSchema>;

/** `{}`-free default: Zod's `.default()` wants the fully-defaulted output shape. */
export const DEFAULT_PLAN_LIMITS: PlanLimits = { sites: null, devices: null, wifi_packages_per_site: null };

/** Convenience alias: "unlimited" reads better than `null` at every call site. */
export const UNLIMITED = null;

/**
 * The complete feature configuration of one plan version.
 *
 * Every leaf has a default so a plan stored before a key existed still parses
 * to a complete, predictable shape. The nested defaults are written out in full
 * rather than `{}`: Zod's `.default()` must be handed the fully-defaulted output
 * shape, which also keeps the default one visible literal instead of a merge.
 */
export const DEFAULT_PLACEMENT: PlacementPolicy = { mode: "OPTIONAL", default_visible: true };

export const planFeaturesSchema = z
  .object({
    branding: z
      .object({
        logo_upload: z.boolean().default(true),
        colors_edit: z.boolean().default(true),
        /** Whether the reseller may upload a full-page background image. */
        background_upload: z.boolean().default(true),
        platform_badge_removable: z.boolean().default(false),
        default_primary_color: hexColorSchema.default("#172D43"),
        default_accent_color: hexColorSchema.default("#F06638"),
      })
      .strict()
      .default({
        logo_upload: true,
        colors_edit: true,
        background_upload: true,
        platform_badge_removable: false,
        default_primary_color: "#172D43",
        default_accent_color: "#F06638",
      }),
    package_cards: z
      .object({
        allowed_styles: z.array(packageCardStyleSchema).min(1).max(PACKAGE_CARD_STYLES.length).default([...PACKAGE_CARD_STYLES]),
        default_style: packageCardStyleSchema.default("classic"),
        allowed_layouts: z.array(packageCardLayoutSchema).min(1).max(PACKAGE_LAYOUTS.length).default([...PACKAGE_LAYOUTS]),
        default_layout: packageCardLayoutSchema.default("list"),
      })
      .strict()
      .default({
        allowed_styles: [...PACKAGE_CARD_STYLES],
        default_style: "classic",
        allowed_layouts: [...PACKAGE_LAYOUTS],
        default_layout: "list",
      }),
    packages: z
      .object({
        order_edit: z.boolean().default(false),
      })
      .strict()
      .default({ order_edit: false }),
    ads: z
      .object({
        banner: placementPolicySchema.default({ mode: "OPTIONAL", default_visible: true }),
        explore: placementPolicySchema.default({ mode: "OPTIONAL", default_visible: true }),
      })
      .strict()
      .default({
        banner: { mode: "OPTIONAL", default_visible: true },
        explore: { mode: "OPTIONAL", default_visible: true },
      }),
    discovery: z
      .object({
        promote_business: placementPolicySchema.default({ mode: "OPTIONAL", default_visible: true }),
        platform_link: placementPolicySchema.default({ mode: "OPTIONAL", default_visible: true }),
        jobs: placementPolicySchema.default({ mode: "OPTIONAL", default_visible: true }),
      })
      .strict()
      .default({
        promote_business: { mode: "OPTIONAL", default_visible: true },
        platform_link: { mode: "OPTIONAL", default_visible: true },
        jobs: { mode: "OPTIONAL", default_visible: true },
      }),
    payments: z
      .object({
        voucher: z.boolean().default(true),
      })
      .strict()
      .default({ voucher: true }),
    limits: planLimitsSchema.default({ sites: null, devices: null, wifi_packages_per_site: null }),
  })
  .strict();

export type PlanFeatures = z.infer<typeof planFeaturesSchema>;

/** The shape of a fully-resolved features object, before any admin overrides. */
export const DEFAULT_PLAN_FEATURES: PlanFeatures = planFeaturesSchema.parse({});

/**
 * Coerces stored or partial JSON into complete features.
 *
 * Lenient by design: reading a plan must never throw because a key was added
 * later. Unknown keys are stripped here — publishing is what rejects them.
 */
export function planFeaturesWithDefaults(raw: unknown): PlanFeatures {
  const parsed = planFeaturesSchema.safeParse(raw ?? {});
  return parsed.success ? normalizePlanFeatures(parsed.data) : DEFAULT_PLAN_FEATURES;
}

/** Re-applies the mode rules after a parse, so a hand-written row cannot contradict itself. */
export function normalizePlanFeatures(features: PlanFeatures): PlanFeatures {
  return {
    ...features,
    ads: {
      banner: normalizePlacement(features.ads.banner),
      explore: normalizePlacement(features.ads.explore),
    },
    discovery: {
      promote_business: normalizePlacement(features.discovery.promote_business),
      platform_link: normalizePlacement(features.discovery.platform_link),
      jobs: normalizePlacement(features.discovery.jobs),
    },
  };
}

/** Every placement policy in a plan, keyed by its visibility key. */
export function placementOf(features: PlanFeatures, key: VisibilityKey): PlacementPolicy {
  switch (key) {
    case "ads.banner":
      return features.ads.banner;
    case "ads.explore":
      return features.ads.explore;
    case "discovery.promote_business":
      return features.discovery.promote_business;
    case "discovery.platform_link":
      return features.discovery.platform_link;
    case "discovery.jobs":
      return features.discovery.jobs;
  }
}

function withPlacement(features: PlanFeatures, key: VisibilityKey, policy: PlacementPolicy): PlanFeatures {
  switch (key) {
    case "ads.banner":
      return { ...features, ads: { ...features.ads, banner: policy } };
    case "ads.explore":
      return { ...features, ads: { ...features.ads, explore: policy } };
    case "discovery.promote_business":
      return { ...features, discovery: { ...features.discovery, promote_business: policy } };
    case "discovery.platform_link":
      return { ...features, discovery: { ...features.discovery, platform_link: policy } };
    case "discovery.jobs":
      return { ...features, discovery: { ...features.discovery, jobs: policy } };
  }
}

/** Replaces one placement's policy, keeping the rest of the plan intact. */
export function setPlacement(
  features: PlanFeatures,
  key: VisibilityKey,
  policy: { mode?: AdMode; default_visible?: boolean },
): PlanFeatures {
  return normalizePlanFeatures(withPlacement(features, key, normalizePlacement(policy)));
}

/* ─────────────────────────────────────────────────────────────────────────
 * The catalog registry
 * ───────────────────────────────────────────────────────────────────────── */

export type FeatureKind = "boolean" | "visibility" | "allowlist" | "enum" | "limit";
export type FeatureGroup = "branding" | "package_cards" | "packages" | "ads" | "discovery" | "payments" | "limits";

/**
 * One catalogued capability.
 *
 * `implemented` is the honesty flag the spec asks for: admin selects from
 * features that already exist, and a key with no runtime cannot be published —
 * otherwise a switch would appear to work while nothing honours it.
 */
export type FeatureDescriptor = {
  key: string;
  kind: FeatureKind;
  group: FeatureGroup;
  /** Path into the features JSON, e.g. `["ads","banner","mode"]`. */
  path: readonly string[];
  /** Permitted values for `enum`/`allowlist`/`visibility` kinds. */
  allowedValues?: readonly string[];
  /** Whether the backend actually enforces this key today. */
  implemented: boolean;
  /** Module that enforces it, so an unimplemented key names its missing owner. */
  handler: string;
};

export const FEATURE_CATALOG: readonly FeatureDescriptor[] = [
  // Branding
  { key: "branding.logo_upload", kind: "boolean", group: "branding", path: ["branding", "logo_upload"], implemented: true, handler: "reseller.portal-preferences" },
  { key: "branding.colors_edit", kind: "boolean", group: "branding", path: ["branding", "colors_edit"], implemented: true, handler: "reseller.portal-preferences" },
  { key: "branding.platform_badge_removable", kind: "boolean", group: "branding", path: ["branding", "platform_badge_removable"], implemented: true, handler: "portal.public-config" },
  { key: "branding.background_upload", kind: "boolean", group: "branding", path: ["branding", "background_upload"], implemented: true, handler: "media.background-upload" },
  // Package appearance
  { key: "package_cards.allowed_styles", kind: "allowlist", group: "package_cards", path: ["package_cards", "allowed_styles"], allowedValues: PACKAGE_CARD_STYLES, implemented: true, handler: "portal.public-config" },
  { key: "package_cards.default_style", kind: "enum", group: "package_cards", path: ["package_cards", "default_style"], allowedValues: PACKAGE_CARD_STYLES, implemented: true, handler: "portal.public-config" },
  { key: "package_cards.allowed_layouts", kind: "allowlist", group: "package_cards", path: ["package_cards", "allowed_layouts"], allowedValues: PACKAGE_LAYOUTS, implemented: true, handler: "portal.public-config" },
  { key: "package_cards.default_layout", kind: "enum", group: "package_cards", path: ["package_cards", "default_layout"], allowedValues: PACKAGE_LAYOUTS, implemented: true, handler: "portal.public-config" },
  { key: "packages.order_edit", kind: "boolean", group: "packages", path: ["packages", "order_edit"], implemented: true, handler: "reseller.portal-preferences" },
  // Ads
  { key: "ads.banner", kind: "visibility", group: "ads", path: ["ads", "banner", "mode"], allowedValues: AD_MODES, implemented: true, handler: "portal.ads" },
  { key: "ads.explore", kind: "visibility", group: "ads", path: ["ads", "explore", "mode"], allowedValues: AD_MODES, implemented: true, handler: "portal.ads" },
  // Discovery shortcuts
  { key: "discovery.promote_business", kind: "visibility", group: "discovery", path: ["discovery", "promote_business", "mode"], allowedValues: AD_MODES, implemented: true, handler: "portal.public-config" },
  { key: "discovery.platform_link", kind: "visibility", group: "discovery", path: ["discovery", "platform_link", "mode"], allowedValues: AD_MODES, implemented: true, handler: "portal.public-config" },
  { key: "discovery.jobs", kind: "visibility", group: "discovery", path: ["discovery", "jobs", "mode"], allowedValues: AD_MODES, implemented: true, handler: "portal.public-config" },
  // Payments
  { key: "payments.voucher", kind: "boolean", group: "payments", path: ["payments", "voucher"], implemented: true, handler: "portal.redeem" },
  // Limits
  { key: "limits.sites", kind: "limit", group: "limits", path: ["limits", "sites"], implemented: true, handler: "network.sites" },
  { key: "limits.devices", kind: "limit", group: "limits", path: ["limits", "devices"], implemented: true, handler: "network.sites" },
  { key: "limits.wifi_packages_per_site", kind: "limit", group: "limits", path: ["limits", "wifi_packages_per_site"], implemented: true, handler: "catalog.packages" },
];

export const FEATURE_KEYS: readonly string[] = FEATURE_CATALOG.map((entry) => entry.key);

export function featureDescriptor(key: string): FeatureDescriptor | undefined {
  return FEATURE_CATALOG.find((entry) => entry.key === key);
}

/** Features the runtime does not honour yet, surfaced in the admin editor as "Planned". */
export const PLANNED_FEATURE_KEYS: readonly string[] = FEATURE_CATALOG.filter((entry) => !entry.implemented).map((entry) => entry.key);

/* ─────────────────────────────────────────────────────────────────────────
 * Publish-time validation
 * ───────────────────────────────────────────────────────────────────────── */

export type PlanFeatureIssue = { key: string; message: string };

/**
 * Validates a plan version before it is published.
 *
 * Rejects unknown keys (so a typo cannot masquerade as a working switch),
 * contradictory Ad Free configurations, card styles that disagree, and any
 * selected feature the runtime does not implement.
 */
export function validatePlanFeatures(raw: unknown, options: { commercialPromise?: CommercialPromise } = {}): PlanFeatureIssue[] {
  const issues: PlanFeatureIssue[] = [];

  // Reject unknown keys explicitly: a stripped key would look saved but do nothing.
  const strict = planFeaturesSchema.safeParse(raw ?? {});
  if (!strict.success) {
    for (const issue of strict.error.issues) {
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) issues.push({ key, message: `Unknown feature key "${key}"` });
      } else {
        issues.push({ key: issue.path.join(".") || "features", message: issue.message });
      }
    }
    // The lenient parse still gives us enough to report the semantic problems below.
  }

  const features = planFeaturesWithDefaults(raw);

  for (const key of VISIBILITY_KEYS) {
    const policy = placementOf(features, key);
    if (policy.mode === "REQUIRED" && !policy.default_visible) {
      issues.push({ key, message: "A REQUIRED placement is always visible; its default cannot be off" });
    }
    if (policy.mode === "DISABLED" && policy.default_visible) {
      issues.push({ key, message: "A DISABLED placement is never visible; its default cannot be on" });
    }
  }

  if (options.commercialPromise === "ad_free") {
    for (const key of [...SPONSORED_VISIBILITY_KEYS, ...DISCOVERY_VISIBILITY_KEYS]) {
      if (placementOf(features, key).mode !== "DISABLED") {
        issues.push({ key, message: "An Ad Free plan must disable every sponsored and discovery placement" });
      }
    }
  }

  const { allowed_styles, default_style, allowed_layouts, default_layout } = features.package_cards;
  if (allowed_styles.length === 0) {
    issues.push({ key: "package_cards.allowed_styles", message: "Allow at least one package card style" });
  }
  if (!allowed_styles.includes(default_style)) {
    issues.push({ key: "package_cards.default_style", message: `Default style "${default_style}" must be one of the allowed styles` });
  }
  if (allowed_layouts.length === 0) {
    issues.push({ key: "package_cards.allowed_layouts", message: "Allow at least one package layout" });
  }
  if (!allowed_layouts.includes(default_layout)) {
    issues.push({ key: "package_cards.default_layout", message: `Default layout "${default_layout}" must be one of the allowed layouts` });
  }

  return issues;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Resolution — the effective configuration
 * ───────────────────────────────────────────────────────────────────────── */

/** Why a control cannot be edited, when it cannot. */
export type PlacementLock = "REQUIRED" | "DISABLED" | null;

export type VisibilityDecision = {
  mode: AdMode;
  visible: boolean;
  canEdit: boolean;
  lock: PlacementLock;
};

/** A decision bound to the placement it belongs to. */
export type VisibilityResolution = VisibilityDecision & { key: VisibilityKey };

/**
 * The single rule that turns a mode plus a reseller preference into a decision.
 *
 * ```
 * REQUIRED -> visible = true,  canEdit = false
 * DISABLED -> visible = false, canEdit = false
 * OPTIONAL -> visible = resellerPreference ?? optionalDefault, canEdit = true
 * ```
 *
 * A stored `false` is a real choice, not a missing value: it must not be
 * widened back to the default by a `??`-style fallback.
 */
export function resolveVisibility(mode: AdMode, resellerPreference: boolean | undefined, optionalDefault: boolean): VisibilityDecision {
  if (mode === "REQUIRED") return { mode, visible: true, canEdit: false, lock: "REQUIRED" };
  if (mode === "DISABLED") return { mode, visible: false, canEdit: false, lock: "DISABLED" };
  return {
    mode,
    visible: resellerPreference === undefined ? optionalDefault : resellerPreference,
    canEdit: true,
    lock: null,
  };
}

/** Reseller-stored visibility choices, one optional boolean per placement. */
export const visibilityPreferencesSchema = z
  .object({
    banner: z.boolean().optional(),
    explore: z.boolean().optional(),
    promote_business: z.boolean().optional(),
    platform_link: z.boolean().optional(),
    jobs: z.boolean().optional(),
  })
  .strict();

export type VisibilityPreferences = z.infer<typeof visibilityPreferencesSchema>;

/** Reading a preference for a placement key, keeping "not chosen" distinct from `false`. */
export function preferenceOf(preferences: VisibilityPreferences, key: VisibilityKey): boolean | undefined {
  switch (key) {
    case "ads.banner":
      return preferences.banner;
    case "ads.explore":
      return preferences.explore;
    case "discovery.promote_business":
      return preferences.promote_business;
    case "discovery.platform_link":
      return preferences.platform_link;
    case "discovery.jobs":
      return preferences.jobs;
  }
}

/** Resolves every placement for one plan + preference pair. */
export function resolveAllVisibility(
  features: PlanFeatures,
  preferences: VisibilityPreferences = {},
): Record<VisibilityKey, VisibilityResolution> {
  const entries = VISIBILITY_KEYS.map((key) => {
    const policy = placementOf(features, key);
    const resolution = resolveVisibility(policy.mode, preferenceOf(preferences, key), policy.default_visible);
    return [key, { ...resolution, key }] as const;
  });
  return Object.fromEntries(entries) as Record<VisibilityKey, VisibilityResolution>;
}

/**
 * True when a single "Hide ads & discovery" action can honestly hide everything.
 *
 * Only when all five placements are hideable; if any is `REQUIRED`, no button
 * may promise to remove them all.
 */
export function canHideAllSponsored(features: PlanFeatures): boolean {
  return VISIBILITY_KEYS.every((key) => placementOf(features, key).mode !== "REQUIRED");
}

/* ─────────────────────────────────────────────────────────────────────────
 * Reseller preference (the choices half)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * `""` means "clear this", and is not a value in its own right.
 *
 * A reseller editing their portal needs a way back to the template's own colour
 * or asset, and an *absent* key already means "leave whatever is stored alone".
 * Clearing therefore needs its own representation, and `""` is it — the designer
 * sends the field trimmed, so an emptied input arrives as `""` rather than as a
 * missing key.
 *
 * Trimming happens before the branch so that a field holding only whitespace is
 * treated as cleared rather than as an invalid colour or URL.
 */
const clearableHexColorSchema = z
  .string()
  .trim()
  .pipe(z.union([hexColorSchema, z.literal("")], { error: "Use a hex color like #1b5ea4, or leave empty to use the template" }));

const clearableUrlSchema = z
  .string()
  .trim()
  .max(500)
  .pipe(z.union([z.string().url(), z.literal("")], { error: "Enter a full URL like https://example.com/asset.png, or leave empty to clear it" }));

export const resellerBrandingPreferenceSchema = z
  .object({
    primary_color: hexColorSchema.optional(),
    accent_color: hexColorSchema.optional(),
    /**
     * Page background colour. Kept apart from the primary so a reseller can tint
     * the paper without also discolouring every button.
     */
    background_color: clearableHexColorSchema.optional(),
    /** Reviewed combination the colours started from; a label, not a style. */
    theme_preset: z.string().trim().max(32).optional(),
    /** Reviewed logo asset; only meaningful when `branding.logo_upload` is on. */
    logo_url: clearableUrlSchema.optional(),
    /** Reviewed full-page background asset; gated by `branding.background_upload`. */
    background_url: clearableUrlSchema.optional(),
    show_platform_badge: z.boolean().optional(),
    default_locale: z.enum(["en", "sw"]).optional(),
  })
  .strict();

export type ResellerBrandingPreference = z.infer<typeof resellerBrandingPreferenceSchema>;

/**
 * Everything a reseller may persist for one site.
 *
 * Stored separately from the plan so a downgrade can keep it: the preference
 * outlives the entitlement, and only its *effect* narrows.
 */
export const sitePortalPreferenceSchema = z
  .object({
    branding: resellerBrandingPreferenceSchema.default({}),
    package_cards: z
      .object({
        style: packageCardStyleSchema.optional(),
        layout: packageCardLayoutSchema.optional(),
      })
      .strict()
      .default({}),
    /** Ordered package ids; ignored when `packages.order_edit` is off. */
    package_order: z.array(z.string().uuid()).max(500).default([]),
    visibility: visibilityPreferencesSchema.default({}),
  })
  .strict();

export type SitePortalPreference = z.infer<typeof sitePortalPreferenceSchema>;

export const DEFAULT_SITE_PORTAL_PREFERENCE: SitePortalPreference = sitePortalPreferenceSchema.parse({});

/** Coerces stored JSON into complete preferences, falling back to a clean slate. */
export function sitePortalPreferenceWithDefaults(raw: unknown): SitePortalPreference {
  const parsed = sitePortalPreferenceSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_SITE_PORTAL_PREFERENCE;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Effective public portal configuration
 * ───────────────────────────────────────────────────────────────────────── */

export type EffectivePortalBranding = {
  primaryColor: string;
  accentColor: string;
  /** Page background colour the portal paints behind the cards. */
  backgroundColor: string;
  /** Resolved logo URL, or `null` when the plan has no logo upload or none was set. */
  logoUrl: string | null;
  /** Resolved background image URL, or `null` when none applies. */
  backgroundUrl: string | null;
  showPlatformBadge: boolean;
  defaultLocale: "en" | "sw";
  /** Whether the reseller may change the logo at all. */
  logoUploadAllowed: boolean;
  colorsEditAllowed: boolean;
  /** Whether the reseller may upload a background image at all. */
  backgroundUploadAllowed: boolean;
};

export type EffectivePackageCards = {
  allowedStyles: PackageCardStyle[];
  style: PackageCardStyle;
  allowedLayouts: PackageCardLayout[];
  layout: PackageCardLayout;
  orderEditable: boolean;
};

export type EffectiveLimits = {
  sites: number | null;
  devices: number | null;
  wifiPackagesPerSite: number | null;
};

/**
 * The validated answer both dashboards and the guest portal obey.
 *
 * `configRevision` changes whenever anything that can alter this object changes
 * (plan migration, subscription change, portal preference change), which is what
 * lets caches invalidate instead of serving permissions from a previous plan.
 */
export type EffectivePortalConfig = {
  configRevision: string;
  planCode: string;
  planVersion: number;
  commercialPromise: CommercialPromise;
  branding: EffectivePortalBranding;
  packageCards: EffectivePackageCards;
  voucherEnabled: boolean;
  limits: EffectiveLimits;
  visibility: Record<VisibilityKey, VisibilityResolution>;
  /** Whether a single "hide all" preference is honest for this plan. */
  canHideAllSponsored: boolean;
};

/* ─────────────────────────────────────────────────────────────────────────
 * Starter presets
 * ───────────────────────────────────────────────────────────────────────── */

export const PLAN_PRESET_KEYS = ["sponsored", "brand-control", "ad-free"] as const;
export type PlanPresetKey = (typeof PLAN_PRESET_KEYS)[number];

export type PlanPreset = {
  key: PlanPresetKey;
  /** Design name, kept out of i18n because admins rename plans freely. */
  name: string;
  description: string;
  commercialPromise: CommercialPromise;
  features: PlanFeatures;
};

/**
 * The three starting points from the specification.
 *
 * These are presets, not plans: admin can create more, rename them and change
 * any value without touching code.
 */
export const PLAN_PRESETS: readonly PlanPreset[] = [
  {
    key: "sponsored",
    name: "Sponsored",
    description: "Lower price in exchange for compulsory banner and Explore advertising.",
    commercialPromise: "standard",
    features: planFeaturesWithDefaults({
      ads: {
        banner: { mode: "REQUIRED", default_visible: true },
        explore: { mode: "REQUIRED", default_visible: true },
      },
      discovery: {
        promote_business: { mode: "OPTIONAL", default_visible: true },
        platform_link: { mode: "OPTIONAL", default_visible: true },
        jobs: { mode: "OPTIONAL", default_visible: true },
      },
      package_cards: { allowed_styles: ["classic", "compact"], default_style: "classic" },
      packages: { order_edit: false },
    }),
  },
  {
    key: "brand-control",
    name: "Brand Control",
    description: "Full control over branding, package appearance and sponsored placements.",
    commercialPromise: "standard",
    features: planFeaturesWithDefaults({
      ads: {
        banner: { mode: "OPTIONAL", default_visible: true },
        explore: { mode: "OPTIONAL", default_visible: true },
      },
      discovery: {
        promote_business: { mode: "OPTIONAL", default_visible: true },
        platform_link: { mode: "OPTIONAL", default_visible: true },
        jobs: { mode: "OPTIONAL", default_visible: true },
      },
      package_cards: { allowed_styles: [...PACKAGE_CARD_STYLES], default_style: "classic" },
      packages: { order_edit: true },
    }),
  },
  {
    key: "ad-free",
    name: "Ad Free",
    description: "No advertising anywhere in the guest portal.",
    commercialPromise: "ad_free",
    features: planFeaturesWithDefaults({
      ads: {
        banner: { mode: "DISABLED", default_visible: false },
        explore: { mode: "DISABLED", default_visible: false },
      },
      discovery: {
        promote_business: { mode: "DISABLED", default_visible: false },
        platform_link: { mode: "DISABLED", default_visible: false },
        jobs: { mode: "DISABLED", default_visible: false },
      },
      package_cards: { allowed_styles: [...PACKAGE_CARD_STYLES], default_style: "classic" },
      packages: { order_edit: true },
    }),
  },
];

export function planPreset(key: string): PlanPreset | undefined {
  return PLAN_PRESETS.find((preset) => preset.key === key);
}

/* ─────────────────────────────────────────────────────────────────────────
 * Preference updates (the reseller write path)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * A reseller's portal-preference patch.
 *
 * Identity fields (name, description, location, support) are edited through the
 * site endpoint and validated there; this payload carries only the plan-governed
 * appearance choices, so a reseller cannot smuggle in a plan change.
 */
export const sitePortalPreferenceInputSchema = z
  .object({
    branding: resellerBrandingPreferenceSchema.partial().optional(),
    package_cards: z.object({ style: packageCardStyleSchema.optional(), layout: packageCardLayoutSchema.optional() }).strict().optional(),
    package_order: z.array(z.string().uuid()).max(500).optional(),
    visibility: visibilityPreferencesSchema.partial().optional(),
    /** The bulk "Hide ads & discovery" action, applied atomically server-side. */
    hide_all_sponsored: z.boolean().optional(),
  })
  .strict();

export type SitePortalPreferenceInput = z.infer<typeof sitePortalPreferenceInputSchema>;

/**
 * The reason code a rejected preference update returns.
 *
 * The frontend shows locked controls before the request is ever made; this code
 * is the backend refusing to take the reseller's word for it.
 */
export const FEATURE_LOCKED_BY_PLAN = "FEATURE_LOCKED_BY_PLAN" as const;

/** Plan feature keys, used by the admin editor and the entitlements payload. */
export const BRANDING_FEATURE_KEYS = ["branding.logo_upload", "branding.colors_edit", "branding.background_upload", "branding.platform_badge_removable"] as const;
export const PACKAGE_FEATURE_KEYS = [
  "package_cards.allowed_styles",
  "package_cards.default_style",
  "package_cards.allowed_layouts",
  "package_cards.default_layout",
  "packages.order_edit",
] as const;
export const PAYMENT_FEATURE_KEYS = ["payments.voucher"] as const;
export const LIMIT_FEATURE_KEYS = ["limits.sites", "limits.devices", "limits.wifi_packages_per_site"] as const;
export type PlanLimitKey = (typeof LIMIT_FEATURE_KEYS)[number];

/**
 * The minimum contrast a brand colour must reach against white button text.
 *
 * Portals put white text on the brand colour, so a colour that fails this would
 * ship an unreadable "Buy" button. WCAG's 3:1 for UI components is strict enough
 * to catch the real mistakes without banning the palette resellers actually use.
 * Shared by the backend validator and the dashboard's live check so the two
 * cannot disagree about which colour is allowed.
 */
export const MIN_BRAND_CONTRAST = 3;

/** WCAG relative luminance for a `#rrggbb` colour. */
function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const c = Number.parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** Contrast ratio between two hex colours; 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/**
 * One placement as the reseller dashboard renders it: the decision plus the
 * reason a control is locked, so the UI can explain itself before the request.
 */
export type EntitlementPlacementView = VisibilityResolution & {
  defaultVisible: boolean;
};

/**
 * The entitlements payload the reseller dashboard reads.
 *
 * `plan: null` means nothing grants permission: the screen renders read-only and
 * every write is refused by the backend. `overLimit` names the limits a
 * non-destructive downgrade left exceeded — nothing was deleted to fit.
 */
export type ResellerEntitlementsView = {
  plan: { code: string; name: string; version: number; commercialPromise: CommercialPromise; lifecycle: string } | null;
  state: string;
  features: PlanFeatures;
  branding: {
    logoUpload: boolean;
    colorsEdit: boolean;
    backgroundUpload: boolean;
    platformBadgeRemovable: boolean;
    defaultPrimaryColor: string;
    defaultAccentColor: string;
  };
  packageCards: {
    allowedStyles: PackageCardStyle[];
    defaultStyle: PackageCardStyle;
    allowedLayouts: PackageCardLayout[];
    defaultLayout: PackageCardLayout;
  };
  packages: { orderEdit: boolean };
  payments: { voucher: boolean };
  limits: { sites: number | null; devices: number | null; wifiPackagesPerSite: number | null };
  usage: { sites: number; devices: number; packages: number };
  overLimit: PlanLimitKey[];
  visibility: Record<VisibilityKey, EntitlementPlacementView>;
  canHideAllSponsored: boolean;
  configRevision: string;
};

/** The Captive Portal designer's read model for one site. */
export type SitePortalStateView = {
  preference: {
    branding: SitePortalPreference["branding"];
    packageStyle?: PackageCardStyle;
    packageLayout?: PackageCardLayout;
    packageOrder: string[];
    visibility: VisibilityPreferences;
    updatedAt?: string;
  };
  config: EffectivePortalConfig | null;
  entitlements: ResellerEntitlementsView;
};

/* ─────────────────────────────────────────────────────────────────────────
 * Plan version migration
 *
 * Publishing a version changes what is *sold*, never what someone already bought.
 * Moving live subscribers is a separate, explicitly scoped operation with a date
 * and an audit record, so no subscription ever changes its published feature
 * snapshot silently.
 * ───────────────────────────────────────────────────────────────────────── */

export const PLAN_MIGRATION_SCOPES = ["NEW_ONLY", "ON_RENEWAL", "SELECTED", "ALL"] as const;
export type PlanMigrationScope = (typeof PLAN_MIGRATION_SCOPES)[number];
export const planMigrationScopeSchema = z.enum(PLAN_MIGRATION_SCOPES);

export const PLAN_MIGRATION_STATUSES = ["SCHEDULED", "PARTIAL", "APPLIED", "CANCELLED"] as const;
export type PlanMigrationStatus = (typeof PLAN_MIGRATION_STATUSES)[number];

/**
 * A scheduled move of live subscriptions onto a plan version.
 *
 * - `NEW_ONLY` — the publish already switched what new subscribers get; nothing
 *   is moved and the record documents that choice.
 * - `ON_RENEWAL` — each targeted subscription moves when its paid period ends,
 *   never mid-period.
 * - `SELECTED` — only the named resellers.
 * - `ALL` — every subscription bound to an earlier version of this plan code.
 */
export const planMigrationInputSchema = z
  .object({
    /** The published version subscriptions should move *to*. */
    planId: z.string().uuid(),
    scope: planMigrationScopeSchema,
    effectiveAt: z.coerce.date(),
    resellerIds: z.array(z.string().uuid()).max(2000).default([]),
    note: z.string().trim().max(240).default(""),
  })
  .strict()
  .refine((value) => value.scope !== "SELECTED" || value.resellerIds.length > 0, {
    message: "Choose at least one reseller for a selected-scope migration",
    path: ["resellerIds"],
  });

export type PlanMigrationInput = z.infer<typeof planMigrationInputSchema>;

/** One subscription the migration will (or did) move, with both sides named. */
export type PlanMigrationTarget = {
  resellerId: string;
  businessName: string;
  from: { planId: string; code: string; version: number } | null;
  to: { planId: string; code: string; version: number };
  /** `true` once the subscription has been moved. */
  applied: boolean;
  appliedAt: string | null;
};

/** Admin-facing read of a migration, including the old → new preview. */
export type PlanMigrationView = {
  id: string;
  scope: PlanMigrationScope;
  status: PlanMigrationStatus;
  effectiveAt: string;
  note: string;
  createdAt: string;
  appliedAt: string | null;
  plan: { id: string; code: string; version: number; lifecycle: string };
  targets: PlanMigrationTarget[];
  appliedCount: number;
  pendingCount: number;
};
