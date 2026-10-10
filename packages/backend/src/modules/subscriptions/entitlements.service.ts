import { createHash } from "node:crypto";
import {
  FEATURE_LOCKED_BY_PLAN,
  MIN_BRAND_CONTRAST,
  canHideAllSponsored,
  contrastRatio,
  eligibleCampaigns,
  planFeaturesWithDefaults,
  placementOf,
  resolveAllVisibility,
  sitePortalPreferenceWithDefaults,
  visibilityPreferencesSchema,
  type AdCampaignStatus,
  type AdCreative,
  type AdTargeting,
  type CommercialPromise,
  type DeliveredAdCampaign,
  type EffectivePortalConfig,
  type PackageCardLayout,
  type PackageCardStyle,
  type PlanFeatures,
  type PlanLimitKey,
  type ResellerEntitlementsView,
  type SitePortalPreference,
  type SitePortalPreferenceInput,
  type SitePortalStateView,
  type VisibilityKey,
  type VisibilityPreferences,
} from "@advo/contracts";
import { prisma, type AdCampaign, type PlatformPlan, type Prisma, type Site, type SitePortalPreference as SitePortalPreferenceRow, type Subscription } from "@advo/db";
import { audit } from "../../common/events.js";
import { badRequest, forbidden, tenantDenied } from "../../common/errors.js";
import { invalidatePortalCache } from "./portal-cache.js";
import { planLimitsOf } from "./subscriptions.service.js";

/**
 * The entitlement resolver.
 *
 * Everything that needs to know "what is this reseller actually allowed to do,
 * right now" comes through here. Three inputs are kept strictly apart:
 *
 * 1. **Plan entitlement** — the published `PlanFeatures` snapshot on the plan
 *    version the subscription points at.
 * 2. **Reseller preference** — what the reseller chose for one site.
 * 3. **Effective config** — the resolved answer, which is the only thing a
 *    dashboard or the guest portal is allowed to act on.
 *
 * A preference can never widen an entitlement: every write goes through
 * {@link assertPreferenceAllowed}, and every read through `resolveVisibility`.
 */

/** Usage counts a plan limit is measured against. */
export type ResellerUsage = {
  sites: number;
  devices: number;
  packages: number;
};

export type ResolvedPlan = {
  plan: PlatformPlan;
  subscription: Subscription;
  features: PlanFeatures;
  commercialPromise: CommercialPromise;
};

/**
 * The plan version a subscription is actually bound by.
 *
 * A subscription is bound to the version it accepted, and that version keeps
 * granting until a migration moves the subscription — archiving a superseded
 * version retires it from *sale*, it does not retroactively strip the people
 * already paying for it. That is what makes "publish a new version" safe: live
 * subscribers are unaffected until an admin schedules a migration.
 *
 * A `DRAFT` version is different: it was never published, so nothing may be
 * bound to it, and it grants nothing.
 */
export async function resolvedPlanFor(resellerId: string): Promise<ResolvedPlan | null> {
  const subscription = await prisma.subscription.findUnique({ where: { resellerId } });
  if (!subscription?.planId) return null;
  const usable = subscription.state === "ACTIVE" || subscription.state === "TRIALING";
  if (!usable) return null;
  if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < new Date()) return null;

  const plan = await prisma.platformPlan.findUnique({ where: { id: subscription.planId } });
  if (!plan) return null;
  if (plan.lifecycle === "DRAFT") return null;
  return {
    plan,
    subscription,
    features: planFeaturesWithDefaults(plan.features),
    commercialPromise: plan.commercialPromise as CommercialPromise,
  };
}

/** Counts the three things a plan limit can cap. */
export async function resellerUsage(resellerId: string): Promise<ResellerUsage> {
  const [sites, devices, packages] = await Promise.all([
    prisma.site.count({ where: { resellerId, archivedAt: null } }),
    prisma.device.count({ where: { resellerId } }),
    prisma.wifiPackage.count({ where: { resellerId, status: "ACTIVE" } }),
  ]);
  return { sites, devices, packages };
}

/**
 * Which limits the reseller is currently over.
 *
 * Reported, never enforced by deleting: an over-limit reseller keeps every site,
 * device and package they already have and simply cannot add more until they are
 * back inside the plan or they upgrade.
 */
export function overLimitKeys(limits: { sites: number | null; devices: number | null; wifiPackagesPerSite: number | null }, usage: ResellerUsage): PlanLimitKey[] {
  const over: PlanLimitKey[] = [];
  if (limits.sites !== null && usage.sites > limits.sites) over.push("limits.sites");
  if (limits.devices !== null && usage.devices > limits.devices) over.push("limits.devices");
  return over;
}

/**
 * A short, stable token for the whole permission surface of one reseller.
 *
 * Anything that can change what a site is allowed to show feeds into it — the
 * bound plan version, a fingerprint of its features, the commercial promise, the
 * subscription state and timestamps, and the account's usage against its limits.
 * The portal cache compares this against the revision an entry was stamped with,
 * so a plan migration, a renewal, a feature edit or a preference change is a
 * cache miss by construction: there is no stale-serving window to reason about.
 */
function configRevision(parts: Array<string | number | null | undefined>): string {
  return createHash("sha1").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex").slice(0, 16);
}

/**
 * The plan's feature configuration as a stable string.
 *
 * The revision must change on *any* edit that can alter what a site may show —
 * including an edit made in place on the same plan row, which a version number
 * would not catch. Hashing the resolved features (not the raw JSON) means a
 * semantically identical edit does not needlessly evict every cache entry.
 */
function featuresFingerprint(features: PlanFeatures): string {
  return JSON.stringify(features);
}

export type ResellerEntitlements = ResellerEntitlementsView;

/**
 * Everything the reseller dashboard needs to render its controls and their locks.
 *
 * With no usable plan the features default to the permissive catalog defaults,
 * but `plan` is `null` and the caller must treat the screen as read-only — the
 * backend still refuses every write.
 */
export async function resolveResellerEntitlements(resellerId: string): Promise<ResellerEntitlements> {
  const resolved = await resolvedPlanFor(resellerId);
  const subscription = await prisma.subscription.findUnique({ where: { resellerId } });
  const features = resolved?.features ?? planFeaturesWithDefaults({});
  const limits = resolved ? planLimitsOf(resolved.plan) : { sites: null, devices: null, packagesPerSite: null, packagesTotal: null };
  const usage = await resellerUsage(resellerId);
  const normalizedLimits = { sites: limits.sites, devices: limits.devices, wifiPackagesPerSite: limits.packagesPerSite };

  const resolvedVisibility = resolveAllVisibility(features);
  const visibility = Object.fromEntries(
    Object.entries(resolvedVisibility).map(([key, decision]) => [
      key,
      { mode: decision.mode, defaultVisible: decision.visible, canEdit: decision.canEdit, lock: decision.lock },
    ]),
  ) as ResellerEntitlements["visibility"];

  return {
    plan: resolved
      ? {
          code: resolved.plan.code,
          name: resolved.plan.name,
          version: resolved.plan.version,
          commercialPromise: resolved.commercialPromise,
          lifecycle: resolved.plan.lifecycle,
        }
      : null,
    state: subscription?.state ?? "NONE",
    features,
    branding: {
      logoUpload: features.branding.logo_upload,
      colorsEdit: features.branding.colors_edit,
      backgroundUpload: features.branding.background_upload,
      platformBadgeRemovable: features.branding.platform_badge_removable,
      defaultPrimaryColor: features.branding.default_primary_color,
      defaultAccentColor: features.branding.default_accent_color,
    },
    packageCards: {
      allowedStyles: features.package_cards.allowed_styles,
      defaultStyle: features.package_cards.default_style,
      allowedLayouts: features.package_cards.allowed_layouts,
      defaultLayout: features.package_cards.default_layout,
    },
    packages: { orderEdit: features.packages.order_edit },
    payments: { voucher: features.payments.voucher },
    limits: normalizedLimits,
    usage,
    overLimit: overLimitKeys(normalizedLimits, usage),
    visibility,
    canHideAllSponsored: canHideAllSponsored(features),
    configRevision: configRevision([
      resolved?.plan.id,
      resolved?.plan.version,
      resolved ? featuresFingerprint(resolved.features) : null,
      subscription?.state,
      subscription?.updatedAt?.toISOString(),
      usage.sites,
      usage.devices,
      usage.packages,
    ]),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Per-site effective configuration
 * ───────────────────────────────────────────────────────────────────────── */

export type SitePreferenceRecord = {
  branding: SitePortalPreference["branding"];
  packageStyle?: PackageCardStyle;
  packageLayout?: PackageCardLayout;
  packageOrder: string[];
  visibility: VisibilityPreferences;
  updatedAt?: Date;
};

/** Reads a site's stored preference rows into the contract's shape. */
export function preferenceFromRow(row: SitePortalPreferenceRow | null): SitePreferenceRecord {
  if (!row) {
    const empty = sitePortalPreferenceWithDefaults({});
    return { branding: empty.branding, packageStyle: undefined, packageLayout: undefined, packageOrder: [], visibility: {} };
  }
  const branding = sitePortalPreferenceWithDefaults({ branding: row.branding }).branding;
  const visibility = visibilityPreferencesSchema.safeParse(row.visibility ?? {});
  return {
    branding,
    packageStyle: (row.packageStyle as PackageCardStyle | null) ?? undefined,
    packageLayout: (row.packageLayout as PackageCardLayout | null) ?? undefined,
    packageOrder: Array.isArray(row.packageOrder) ? (row.packageOrder as string[]) : [],
    visibility: visibility.success ? visibility.data : {},
    updatedAt: row.updatedAt,
  };
}

export type EffectiveLimitsInput = { sites: number | null; devices: number | null; wifiPackagesPerSite: number | null };

/**
 * Resolves a plan + stored preference into the effective portal configuration.
 *
 * This is the only place that decides what a guest sees, so the ordering rule is
 * kept in one readable place: entitlement first, preference second, and the
 * Ad Free promise as a hard floor that a stale preference cannot cross.
 */
export function resolveEffectiveConfig(
  features: PlanFeatures,
  commercialPromise: CommercialPromise,
  preference: SitePreferenceRecord,
  planIdentity: { code: string; version: number },
  revision: string,
  limits: EffectiveLimitsInput,
): EffectivePortalConfig {
  const visibility = resolveAllVisibility(features, preference.visibility);

  const colorsEditAllowed = features.branding.colors_edit;
  const requestedStyle = preference.packageStyle;
  const allowedStyles = features.package_cards.allowed_styles;
  // A downgrade keeps the stored style but stops applying it if the new plan does
  // not allow it; the preference itself is never deleted.
  const style = requestedStyle && allowedStyles.includes(requestedStyle) ? requestedStyle : features.package_cards.default_style;

  const requestedLayout = preference.packageLayout;
  const allowedLayouts = features.package_cards.allowed_layouts;
  const layout = requestedLayout && allowedLayouts.includes(requestedLayout) ? requestedLayout : features.package_cards.default_layout;

  return {
    configRevision: revision,
    planCode: planIdentity.code,
    planVersion: planIdentity.version,
    commercialPromise,
    branding: {
      primaryColor: colorsEditAllowed ? (preference.branding.primary_color ?? features.branding.default_primary_color) : features.branding.default_primary_color,
      accentColor: colorsEditAllowed ? (preference.branding.accent_color ?? features.branding.default_accent_color) : features.branding.default_accent_color,
      // An unset background stays empty rather than inventing a tint, so the
      // portal keeps its own paper colour until the reseller picks one.
      backgroundColor: colorsEditAllowed ? (preference.branding.background_color ?? "") : "",
      // A stored logo survives a downgrade but stops applying when the plan
      // does not include logo upload: the preference is never deleted.
      logoUrl: features.branding.logo_upload ? (preference.branding.logo_url ?? null) : null,
      backgroundUrl: features.branding.background_upload ? (preference.branding.background_url ?? null) : null,
      // The badge is shown unless the plan allows removing it *and* the reseller hid it.
      showPlatformBadge: features.branding.platform_badge_removable ? (preference.branding.show_platform_badge ?? true) : true,
      defaultLocale: preference.branding.default_locale ?? "en",
      logoUploadAllowed: features.branding.logo_upload,
      colorsEditAllowed,
      backgroundUploadAllowed: features.branding.background_upload,
    },
    packageCards: {
      allowedStyles: [...allowedStyles],
      style,
      allowedLayouts: [...allowedLayouts],
      layout,
      orderEditable: features.packages.order_edit,
    },
    voucherEnabled: features.payments.voucher,
    limits,
    visibility,
    canHideAllSponsored: canHideAllSponsored(features),
  };
}

export type SiteResolution = {
  site: Site;
  resolved: ResolvedPlan | null;
  preference: SitePreferenceRecord;
  config: EffectivePortalConfig;
};

/**
 * The effective configuration for one site, or `null` when the site has no plan
 * granting permission.
 *
 * The revision folds in the plan version, the subscription and the preference row
 * so that a migration, a renewal or a preference change all invalidate a cache
 * built on it.
 */
export async function resolveSiteConfig(siteId: string): Promise<SiteResolution | null> {
  const site = await prisma.site.findUnique({ where: { id: siteId }, include: { portalPreference: true } });
  if (!site || site.archivedAt) return null;
  const resolved = await resolvedPlanFor(site.resellerId);
  const preference = preferenceFromRow(site.portalPreference);
  const revision = configRevision([
    resolved?.plan.id,
    resolved?.plan.version,
    // A feature edit in place keeps the version number but must still be seen.
    resolved ? featuresFingerprint(resolved.features) : null,
    resolved?.commercialPromise,
    resolved?.subscription.state,
    resolved?.subscription.updatedAt?.toISOString(),
    site.updatedAt.toISOString(),
    preference.updatedAt?.toISOString(),
  ]);
  const limits = resolved ? planLimitsOf(resolved.plan) : { sites: null, devices: null, packagesPerSite: null, packagesTotal: null };
  const effectiveLimits: EffectiveLimitsInput = { sites: limits.sites, devices: limits.devices, wifiPackagesPerSite: limits.packagesPerSite };
  if (!resolved) {
    // No entitlement means no branding to apply either: fall back to the catalog
    // defaults rather than to whatever the reseller once chose.
    const config = resolveEffectiveConfig(
      planFeaturesWithDefaults({}),
      "standard",
      { branding: {}, packageOrder: [], visibility: {} },
      { code: "none", version: 0 },
      revision,
      effectiveLimits,
    );
    return { site, resolved: null, preference, config };
  }
  return {
    site,
    resolved,
    preference,
    config: resolveEffectiveConfig(
      resolved.features,
      resolved.commercialPromise,
      preference,
      { code: resolved.plan.code, version: resolved.plan.version },
      revision,
      effectiveLimits,
    ),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Preference writes (the guarded reseller path)
 * ───────────────────────────────────────────────────────────────────────── */

/** A rejected preference update carries every violation, not just the first. */
export class PreferenceRejected extends Error {
  readonly code = FEATURE_LOCKED_BY_PLAN;
  constructor(readonly violations: Array<{ key: string; message: string }>) {
    super(violations.map((violation) => violation.message).join("; "));
  }
}

/**
 * Validates and stores a reseller's portal-preference patch.
 *
 * Every field is checked against the published plan *before* anything is written,
 * so a request that is partly allowed is rejected whole rather than silently
 * half-applied. This is the backend half of the spec's rule that hiding a control
 * in the UI is not the same as enforcing it.
 */
export async function updateSitePortalPreferences(
  resellerId: string,
  actorUserId: string,
  siteId: string,
  input: SitePortalPreferenceInput,
): Promise<{ preference: SitePreferenceRecord; config: EffectivePortalConfig }> {
  const site = await prisma.site.findFirst({ where: { id: siteId, resellerId, archivedAt: null }, include: { portalPreference: true } });
  if (!site) tenantDenied();

  const resolved = await resolvedPlanFor(resellerId);
  if (!resolved) forbidden("An active subscription is required to change portal appearance", FEATURE_LOCKED_BY_PLAN);
  const features = resolved.features;

  const current = preferenceFromRow(site.portalPreference);
  const violations: Array<{ key: string; message: string }> = [];

  // ── Branding ──
  const branding = { ...current.branding };
  if (input.branding) {
    // `""` is the clear sentinel, so it asks to *drop* a colour rather than set
    // one. Only an actual colour is something the plan has to permit.
    const setsColor = (value: string | undefined) => value !== undefined && value !== "";
    if (!features.branding.colors_edit && (setsColor(input.branding.primary_color) || setsColor(input.branding.accent_color) || setsColor(input.branding.background_color))) {
      violations.push({ key: "branding.colors_edit", message: "Custom colours are not included in your current plan" });
    }
    if (input.branding.logo_url !== undefined) {
      // Clearing comes first on purpose: dropping the custom logo is always
      // allowed, so a reseller on a plan without logo upload can still undo one
      // they uploaded on an earlier, higher plan.
      if (input.branding.logo_url === "") {
        delete branding.logo_url;
      } else if (!features.branding.logo_upload) {
        violations.push({ key: "branding.logo_upload", message: "A custom logo is not included in your current plan" });
      } else {
        branding.logo_url = input.branding.logo_url;
      }
    }
    if (input.branding.background_url !== undefined) {
      // Same order, same reason: clearing is always allowed.
      if (input.branding.background_url === "") {
        delete branding.background_url;
      } else if (!features.branding.background_upload) {
        violations.push({ key: "branding.background_upload", message: "A background image is not included in your current plan" });
      } else {
        branding.background_url = input.branding.background_url;
      }
    }
    if (input.branding.primary_color) {
      if (contrastRatio(input.branding.primary_color, "#ffffff") < MIN_BRAND_CONTRAST) {
        violations.push({ key: "branding.primary_color", message: "Choose a darker brand colour so white button text stays readable" });
      } else {
        branding.primary_color = input.branding.primary_color;
      }
    }
    if (input.branding.accent_color) {
      if (contrastRatio(input.branding.accent_color, "#ffffff") < MIN_BRAND_CONTRAST) {
        violations.push({ key: "branding.accent_color", message: "Choose a darker accent colour so white button text stays readable" });
      } else {
        branding.accent_color = input.branding.accent_color;
      }
    }
    // The background carries body text in the darker of the two inks, so it is
    // checked against the portal's own ink rather than against white.
    if (input.branding.background_color !== undefined) {
      if (input.branding.background_color === "") {
        // Back to the template's own paper. This is the only way a reseller who
        // tinted their background can undo it, so it must not be a no-op: an
        // empty value used to fall through the contrast check below and leave
        // the stored colour in place.
        delete branding.background_color;
      } else if (contrastRatio(input.branding.background_color, "#0f172a") < MIN_BRAND_CONTRAST) {
        violations.push({ key: "branding.background_color", message: "Choose a lighter background so the portal text stays readable" });
      } else {
        branding.background_color = input.branding.background_color;
      }
    }
    if (input.branding.theme_preset !== undefined) {
      branding.theme_preset = input.branding.theme_preset || undefined;
    }
    if (input.branding.show_platform_badge !== undefined) {
      // Hiding the badge needs the permission; showing it is always allowed.
      if (!input.branding.show_platform_badge && !features.branding.platform_badge_removable) {
        violations.push({ key: "branding.platform_badge_removable", message: "The AdvoWiFi badge cannot be removed on your current plan" });
      } else {
        branding.show_platform_badge = input.branding.show_platform_badge;
      }
    }
    if (input.branding.default_locale !== undefined) {
      branding.default_locale = input.branding.default_locale;
    }
  }

  // ── Package card style ──
  let packageStyle = current.packageStyle;
  if (input.package_cards?.style) {
    if (!features.package_cards.allowed_styles.includes(input.package_cards.style)) {
      violations.push({ key: "package_cards.allowed_styles", message: `The "${input.package_cards.style}" card style is not included in your current plan` });
    } else {
      packageStyle = input.package_cards.style;
    }
  }

  // ── Package layout ──
  let packageLayout = current.packageLayout;
  if (input.package_cards?.layout) {
    if (!features.package_cards.allowed_layouts.includes(input.package_cards.layout)) {
      violations.push({ key: "package_cards.allowed_layouts", message: `The "${input.package_cards.layout}" layout is not included in your current plan` });
    } else {
      packageLayout = input.package_cards.layout;
    }
  }

  // ── Package order ──
  if (input.package_order && !features.packages.order_edit) {
    violations.push({ key: "packages.order_edit", message: "Package ordering is not included in your current plan" });
  }

  // ── Visibility, one placement at a time ──
  const visibility: VisibilityPreferences = { ...current.visibility };
  const requested: VisibilityPreferences = input.visibility ?? {};
  for (const key of Object.keys(requested) as Array<keyof VisibilityPreferences>) {
    const value = requested[key];
    if (value === undefined) continue;
    const placementKey = preferenceKeyToVisibilityKey(key);
    const policy = placementOf(features, placementKey);
    if (policy.mode === "REQUIRED" && value === false) {
      violations.push({ key: placementKey, message: `${placementKey} is included in your current plan and cannot be turned off` });
    } else if (policy.mode === "DISABLED") {
      violations.push({ key: placementKey, message: `${placementKey} is not available on your current plan` });
    } else {
      visibility[key] = value;
    }
  }

  // ── "Hide ads & discovery" as one atomic action ──
  if (input.hide_all_sponsored) {
    if (!canHideAllSponsored(features)) {
      violations.push({ key: "visibility", message: "Some placements are part of your current plan and cannot be hidden" });
    } else {
      for (const key of Object.keys(visibility) as Array<keyof VisibilityPreferences>) {
        const placementKey = preferenceKeyToVisibilityKey(key);
        if (placementOf(features, placementKey).mode === "OPTIONAL") visibility[key] = false;
      }
      // Every optional placement, including ones the reseller never chose, goes off.
      for (const key of OPTIONAL_PREFERENCE_KEYS) {
        const placementKey = preferenceKeyToVisibilityKey(key);
        if (placementOf(features, placementKey).mode === "OPTIONAL") visibility[key] = false;
      }
    }
  }

  if (violations.length > 0) throw new PreferenceRejected(violations);

  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.sitePortalPreference.upsert({
      where: { siteId },
      create: {
        siteId,
        branding: branding as object,
        packageStyle: packageStyle ?? null,
        packageLayout: packageLayout ?? null,
        packageOrder: (input.package_order ?? current.packageOrder) as object,
        visibility: visibility as object,
      },
      update: {
        branding: branding as object,
        packageStyle: packageStyle ?? null,
        packageLayout: packageLayout ?? null,
        packageOrder: (input.package_order ?? current.packageOrder) as object,
        visibility: visibility as object,
      },
    });
    await audit(tx, {
      actorUserId,
      action: "portal_preferences.updated",
      targetType: "Site",
      targetId: siteId,
      resellerId,
      metadata: { keys: Object.keys(input), configRevision: row.updatedAt.toISOString() },
    });
    return row;
  });

  // The stored preference changed, so every cached public payload for this site
  // is dropped rather than waiting for its TTL.
  invalidatePortalCache(siteId);

  const preference = preferenceFromRow(saved);
  const revision = configRevision([
    resolved.plan.id,
    resolved.plan.version,
    featuresFingerprint(resolved.features),
    resolved.commercialPromise,
    resolved.subscription.state,
    resolved.subscription.updatedAt?.toISOString(),
    site.updatedAt.toISOString(),
    saved.updatedAt.toISOString(),
  ]);
  const limits = planLimitsOf(resolved.plan);
  return {
    preference,
    config: resolveEffectiveConfig(
      features,
      resolved.commercialPromise,
      preference,
      { code: resolved.plan.code, version: resolved.plan.version },
      revision,
      { sites: limits.sites, devices: limits.devices, wifiPackagesPerSite: limits.packagesPerSite },
    ),
  };
}

/**
 * Read model for the Captive Portal designer: the site's stored preference, the
 * resolved config it currently produces, and the reseller entitlements the UI
 * needs to draw locked controls with their reasons.
 */
export async function sitePortalState(resellerId: string, siteId: string): Promise<SitePortalStateView> {
  const site = await prisma.site.findFirst({ where: { id: siteId, resellerId, archivedAt: null }, include: { portalPreference: true } });
  if (!site) tenantDenied();
  const [entitlements, resolution] = await Promise.all([resolveResellerEntitlements(resellerId), resolveSiteConfig(siteId)]);
  const preference = resolution?.preference ?? preferenceFromRow(site.portalPreference);
  return {
    preference: {
      branding: preference.branding,
      packageStyle: preference.packageStyle,
      packageLayout: preference.packageLayout,
      packageOrder: preference.packageOrder,
      visibility: preference.visibility,
      updatedAt: preference.updatedAt?.toISOString(),
    },
    config: resolution?.config ?? null,
    entitlements,
  };
}

const OPTIONAL_PREFERENCE_KEYS = ["banner", "explore", "promote_business", "platform_link", "jobs"] as const;

/** Maps a stored preference field to the visibility key it governs. */
export function preferenceKeyToVisibilityKey(key: keyof VisibilityPreferences): VisibilityKey {
  switch (key) {
    case "banner":
      return "ads.banner";
    case "explore":
      return "ads.explore";
    case "promote_business":
      return "discovery.promote_business";
    case "platform_link":
      return "discovery.platform_link";
    case "jobs":
      return "discovery.jobs";
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Ads delivery
 * ───────────────────────────────────────────────────────────────────────── */

export type DeliveredCampaign = DeliveredAdCampaign;

/**
 * The answer to "what may this site show for this placement right now".
 *
 * `nextBoundaryAt` is the earliest instant this answer can change on its own — a
 * scheduled campaign starting or ending. Cache lifetimes are capped by it so a
 * campaign that starts in two minutes is not hidden for fifteen.
 */
export type EligibleCampaigns = {
  campaigns: DeliveredCampaign[];
  /** `false` when the placement itself is hidden or `DISABLED` for this plan. */
  visible: boolean;
  /** When this answer next changes by the clock alone; `null` when nothing is scheduled. */
  nextBoundaryAt: Date | null;
  /** The site config revision the answer was resolved against. */
  configRevision: string;
};

/**
 * Campaigns eligible for one placement at one site — and only when the placement
 * is visible at all.
 *
 * Returning an empty list for a hidden placement is deliberate: a `DISABLED`
 * placement's creatives must not reach the guest's browser and be hidden there.
 */
export async function eligibleCampaignsForSite(siteId: string, placement: VisibilityKey): Promise<EligibleCampaigns> {
  const resolution = await resolveSiteConfig(siteId);
  if (!resolution) return { campaigns: [], visible: false, nextBoundaryAt: null, configRevision: "none" };

  const configRevision = resolution.config.configRevision;
  if (!resolution.config.visibility[placement]?.visible) {
    return { campaigns: [], visible: false, nextBoundaryAt: null, configRevision };
  }

  const campaigns = await prisma.adCampaign.findMany({
    where: { status: "ACTIVE", placements: { has: placement } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const audience = { resellerId: resolution.site.resellerId, siteId };
  const eligible = eligibleCampaigns(
    campaigns.map((row) => ({
      ...row,
      targeting: (row.targeting ?? { resellerIds: [], siteIds: [] }) as AdTargeting,
    })),
    placement,
    audience,
  );
  return {
    campaigns: eligible.map((row) => ({
      id: row.id,
      placement,
      creative: row.creative as AdCreative,
    })),
    visible: true,
    nextBoundaryAt: nextCampaignBoundary(eligible),
    configRevision,
  };
}

/**
 * The soonest future start/end among the campaigns that were considered.
 *
 * Only campaigns that could still become eligible matter: a campaign that ends
 * after it started is skipped, and one whose start is in the future bounds the
 * cache so it appears on time.
 */
function nextCampaignBoundary(campaigns: ReadonlyArray<{ startsAt?: Date | null; endsAt?: Date | null }>, now: Date = new Date()): Date | null {
  const boundaries = campaigns
    .flatMap((campaign) => [campaign.startsAt, campaign.endsAt])
    .filter((value): value is Date => Boolean(value) && (value as Date) > now);
  if (boundaries.length === 0) return null;
  return boundaries.reduce((soonest, value) => (value < soonest ? value : soonest));
}

/** Admin-facing read, with JSON columns narrowed to their contract types. */
export function campaignView(row: AdCampaign) {
  return {
    id: row.id,
    name: row.name,
    status: row.status as AdCampaignStatus,
    placements: row.placements,
    creative: row.creative as AdCreative,
    targeting: (row.targeting ?? { resellerIds: [], siteIds: [] }) as AdTargeting,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
  };
}

/** Guard for the admin campaign editor: at least one placement, valid creative. */
export function assertCampaignPlacements(placements: string[]): void {
  if (placements.length === 0) badRequest("Choose at least one placement for this campaign");
}
