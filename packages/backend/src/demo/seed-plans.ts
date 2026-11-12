import {
  applyPlanType,
  commercialPromiseForPlanType,
  PLAN_TIERS,
  planFeaturesWithDefaults,
  planPreset,
  type CommercialPromise,
  type PlanFeatures,
} from "@advo/contracts";
import { prisma } from "@advo/db";
import {
  applyPlanMigration,
  schedulePlanMigration,
} from "../modules/subscriptions/plan-migrations.service.js";
import { upsertPlan } from "../modules/subscriptions/subscriptions.service.js";

/**
 * The five starter plans the platform is sold on.
 *
 * These are the plans a reseller chooses between, so they have to differ on the
 * three axes that actually change what an operator gets: price, capacity and
 * whether the guest portal carries advertising. They are built from the reviewed
 * presets in `@advo/contracts` — never from hand-written feature JSON — so a
 * preset's policy (for example "Ad Free disables every placement") cannot drift
 * from what publishing validates.
 *
 * Only Brand Control is trial-eligible. A trial is an acquisition offer, and
 * giving it to the cheapest plan hands away the Sponsored tier for free; giving
 * it to every plan removes the reason to upgrade at all. Its 7 days are stored
 * on the plan, so Admin changes them in the plan editor without a deploy.
 *
 * Every plan is flagged `isDemo`. The prices below are placeholders for a demo
 * catalog, not a business decision — clearing the flag is what makes them real.
 */
export type StarterPlanSeed = {
  code: string;
  name: string;
  description: string;
  priceTzs: bigint;
  periodDays: number;
  trialEligible: boolean;
  trialDays?: number;
  commercialPromise: CommercialPromise;
  features: PlanFeatures;
};

/** A capacity trio; `null` means unlimited, matching `planLimitsSchema`. */
type Limits = {
  sites: number | null;
  devices: number | null;
  wifi_packages_per_site: number | null;
};

/** Overrides a preset's capacity, which is otherwise unlimited on every starter plan. */
function withLimits(base: PlanFeatures, limits: Limits): PlanFeatures {
  return { ...base, limits };
}

/** Adds an override to the preset's branding block without restating the whole object. */
function withBranding(
  base: PlanFeatures,
  patch: Partial<PlanFeatures["branding"]>,
): PlanFeatures {
  return { ...base, branding: { ...base.branding, ...patch } };
}

const sponsored = planPreset("sponsored")!.features;
const brandControl = planPreset("brand-control")!.features;
const adFree = planPreset("ad-free")!.features;

export const STARTER_PLANS: readonly StarterPlanSeed[] = [
  {
    code: "sponsored",
    name: "Sponsored",
    description:
      "Entry tier. The lowest price in exchange for compulsory banner and Explore advertising.",
    priceTzs: 10_000n,
    periodDays: 30,
    trialEligible: false,
    commercialPromise: "standard",
    // Two placements are REQUIRED: the discount is paid for with the reseller's
    // guests seeing advertising, and no preference can turn it off.
    features: withLimits(sponsored, {
      sites: 1,
      devices: 2,
      wifi_packages_per_site: 2,
    }),
  },
  {
    code: "brand-control",
    name: "Brand Control",
    description:
      "Full branding, every package-card style and optional advertising. The trial tier.",
    priceTzs: 25_000n,
    periodDays: 30,
    trialEligible: true,
    trialDays: 7,
    commercialPromise: "standard",
    features: withLimits(brandControl, {
      sites: 3,
      devices: 6,
      wifi_packages_per_site: 5,
    }),
  },
  {
    code: "ad-free",
    name: "Ad Free",
    description:
      "No advertising anywhere in the guest portal — the promise is enforced at publish time.",
    priceTzs: 40_000n,
    periodDays: 30,
    trialEligible: false,
    // `ad_free` is only publishable when every sponsored and discovery placement
    // is DISABLED; the preset already does that.
    commercialPromise: "ad_free",
    features: withLimits(adFree, {
      sites: 5,
      devices: 12,
      wifi_packages_per_site: 8,
    }),
  },
  {
    code: "business-pro",
    name: "Business Pro",
    description:
      "Higher capacity with advertising left to the reseller, plus badge removal.",
    priceTzs: 75_000n,
    periodDays: 30,
    trialEligible: false,
    commercialPromise: "standard",
    features: withLimits(
      withBranding(brandControl, { platform_badge_removable: true }),
      {
        sites: 10,
        devices: 30,
        wifi_packages_per_site: 15,
      },
    ),
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description:
      "Unlimited sites, devices and packages for multi-site operators.",
    priceTzs: 150_000n,
    periodDays: 30,
    trialEligible: false,
    commercialPromise: "standard",
    // `null` is unlimited. Never `0`, which would read as "none allowed".
    features: withLimits(
      withBranding(brandControl, { platform_badge_removable: true }),
      {
        sites: null,
        devices: null,
        wifi_packages_per_site: null,
      },
    ),
  },
];

export type PlansSeedResult = { created: string[]; skipped: string[] };

/**
 * The two-axis catalog: four capacity tiers, each sold as Advo Partner or Independent.
 *
 * This is the shape the price sheet sells, and it is deliberately built from
 * `PLAN_TIERS` + `applyPlanType` rather than from hand-written JSON:
 *
 * - The capacity numbers come from the tier, so both options of a tier are
 *   guaranteed identical — `validatePlanFeatures` refuses anything else.
 * - The only difference between the two options is the advertising axis. Branding,
 *   package cards, payments and every management tool stay the same, which is what
 *   the sheet promises with "same package, same management tools".
 *
 * Prices are the ones on the proposed sheet and stay `isDemo` until the business
 * confirms them; `priceFrom` marks Enterprise, which is sold on request.
 */
export type CatalogPlanSeed = StarterPlanSeed & {
  tierKey: string;
  planType: "PARTNER" | "INDEPENDENT";
  priceFrom: boolean;
};

/** The management tools every tier shares, before the advertising axis is applied. */
function catalogBase(badgeRemovable: boolean): PlanFeatures {
  // Brand Control grants the full toolset without forcing advertising; the two
  // commercial options are then derived from it, so they differ on nothing else.
  return withBranding(brandControl, {
    platform_badge_removable: badgeRemovable,
    logo_upload: true,
    colors_edit: true,
  });
}

function catalogPlan(input: {
  tier: (typeof PLAN_TIERS)[number];
  planType: "PARTNER" | "INDEPENDENT";
  priceTzs: bigint;
  priceFrom?: boolean;
}): CatalogPlanSeed {
  const { tier, planType } = input;
  const premium = tier.key === "business-pro" || tier.key === "enterprise";
  const features = withLimits(
    applyPlanType(catalogBase(premium), planType),
    tier.limits,
  );
  const typeLabel = planType === "PARTNER" ? "Advo Partner" : "Independent";
  return {
    code: `${tier.key}-${planType.toLowerCase()}`,
    name: `${tier.label} · ${typeLabel}`,
    description:
      planType === "PARTNER"
        ? `${tier.label} capacity with AdvoWiFi advertising and Explore pages, at the lower price.`
        : `${tier.label} capacity with no AdvoWiFi advertising or Explore pages.`,
    priceTzs: input.priceTzs,
    priceFrom: input.priceFrom ?? false,
    periodDays: 30,
    trialEligible: false,
    commercialPromise: commercialPromiseForPlanType(planType),
    features,
    tierKey: tier.key,
    planType,
  };
}

const TIER = (key: string) => PLAN_TIERS.find((tier) => tier.key === key)!;

export const CATALOG_PLANS: readonly CatalogPlanSeed[] = [
  catalogPlan({
    tier: TIER("starter"),
    planType: "PARTNER",
    priceTzs: 20_000n,
  }),
  catalogPlan({
    tier: TIER("starter"),
    planType: "INDEPENDENT",
    priceTzs: 30_000n,
  }),
  catalogPlan({ tier: TIER("growth"), planType: "PARTNER", priceTzs: 40_000n }),
  catalogPlan({
    tier: TIER("growth"),
    planType: "INDEPENDENT",
    priceTzs: 55_000n,
  }),
  catalogPlan({
    tier: TIER("business-pro"),
    planType: "PARTNER",
    priceTzs: 75_000n,
  }),
  catalogPlan({
    tier: TIER("business-pro"),
    planType: "INDEPENDENT",
    priceTzs: 100_000n,
  }),
  catalogPlan({
    tier: TIER("enterprise"),
    planType: "PARTNER",
    priceTzs: 150_000n,
    priceFrom: true,
  }),
  catalogPlan({
    tier: TIER("enterprise"),
    planType: "INDEPENDENT",
    priceTzs: 200_000n,
    priceFrom: true,
  }),
];

/**
 * Creates the eight catalog plans, idempotently.
 *
 * A code that already exists is left untouched, exactly like {@link seedPlans},
 * so re-running never reverts a price an admin has since confirmed.
 */
export async function seedPlanCatalog(): Promise<PlansSeedResult> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin)
    throw new Error(
      "Run `pnpm admin:bootstrap` first — the plans seed never creates an Admin password.",
    );

  const result: PlansSeedResult = { created: [], skipped: [] };
  for (const seed of CATALOG_PLANS) {
    const existing = await prisma.platformPlan.findFirst({
      where: { code: seed.code },
      select: { id: true },
    });
    if (existing) {
      result.skipped.push(`plan ${seed.code} (already exists)`);
      continue;
    }
    await upsertPlan(admin.id, {
      code: seed.code,
      name: seed.name,
      description: seed.description,
      priceTzs: seed.priceTzs,
      priceFrom: seed.priceFrom,
      periodDays: seed.periodDays,
      trialEligible: seed.trialEligible,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: seed.commercialPromise,
      features: seed.features,
      tierKey: seed.tierKey,
      planType: seed.planType,
      isDemo: true,
    });
    result.created.push(
      `plan ${seed.code} (${seed.tierKey} · ${seed.planType}, ${seed.priceTzs} TZS)`,
    );
  }
  return result;
}

/**
 * Retires the pre-matrix plans from sale so the chooser shows only the 4 × 2 grid.
 *
 * Archiving is what this does — never deletion. Subscribers already bound to one
 * of these versions keep their entitlements; they simply stop being offerable to
 * anyone new. Admin can reactivate any of them from the plans screen.
 */
export async function archiveLegacyCatalogPlans(): Promise<{
  archived: string[];
  missing: string[];
}> {
  const legacy = [
    "sponsored",
    "brand-control",
    "ad-free",
    "business-pro",
    "enterprise",
  ];
  const archived: string[] = [];
  const missing: string[] = [];

  for (const code of legacy) {
    const plans = await prisma.platformPlan.findMany({
      where: { code, active: true },
      select: { id: true, version: true },
    });
    if (plans.length === 0) {
      missing.push(code);
      continue;
    }
    await prisma.platformPlan.updateMany({
      where: { code, active: true },
      data: { active: false },
    });
    archived.push(`${code} v${plans.map((plan) => plan.version).join(", v")}`);
  }
  return { archived, missing };
}

/**
 * Creates the five starter plans, idempotently.
 *
 * A code that already has any version is left untouched: an admin who repriced
 * Brand Control must not have that decision reverted by re-running the seed.
 */
export async function seedPlans(): Promise<PlansSeedResult> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin)
    throw new Error(
      "Run `pnpm admin:bootstrap` first — the plans seed never creates an Admin password.",
    );

  const result: PlansSeedResult = { created: [], skipped: [] };

  for (const seed of STARTER_PLANS) {
    const existing = await prisma.platformPlan.findFirst({
      where: { code: seed.code },
      select: { id: true },
    });
    if (existing) {
      result.skipped.push(`plan ${seed.code} (already exists)`);
      continue;
    }

    await upsertPlan(admin.id, {
      code: seed.code,
      name: seed.name,
      description: seed.description,
      priceTzs: seed.priceTzs,
      priceFrom: false,
      periodDays: seed.periodDays,
      trialEligible: seed.trialEligible,
      ...(seed.trialDays === undefined ? {} : { trialDays: seed.trialDays }),
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: seed.commercialPromise,
      features: seed.features,
      isDemo: true,
    });
    result.created.push(
      `plan ${seed.code}${seed.trialEligible ? ` (trial ${seed.trialDays}d)` : ""}`,
    );
  }

  return result;
}

export type PlansRefreshResult = {
  refreshed: Array<{
    code: string;
    from: number;
    to: number;
    migrated: number;
  }>;
  unchanged: string[];
};

/**
 * A stable rendering of a feature snapshot, for "is this plan already current".
 *
 * Both sides are run through `planFeaturesWithDefaults` first, so a stored row
 * that predates a feature key is compared as the default the resolver would
 * actually apply rather than as a missing key. Keys are sorted because a
 * difference in declaration order is not a difference in entitlement.
 */
function featureFingerprint(features: unknown): string {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, sort(nested)]),
      );
    }
    return value;
  };
  return JSON.stringify(sort(planFeaturesWithDefaults(features)));
}

/**
 * Brings the five starter plans onto the **current** presets, explicitly.
 *
 * Why this is separate from {@link seedPlans}
 * -------------------------------------------
 * A published plan version is an immutable snapshot — that is what lets a live
 * subscriber keep the terms they signed up for. So adding a capability to a
 * preset (`bold` card style, the layout axis) does not reach a plan that was
 * published before it existed, and the dashboard correctly keeps offering only
 * what the pinned version grants. `seedPlans` deliberately never touches an
 * existing code, so it cannot close that gap either.
 *
 * This function does, and only when it is asked for:
 *
 * 1. Compares the newest version of each starter code against the preset. Codes
 *    that already match are left alone, so running it twice does nothing the
 *    second time.
 * 2. Publishes a **new version** carrying the preset's features, reusing the
 *    live version's name, price, billing period and trial length — an admin's
 *    own pricing survives, only the feature set is refreshed.
 * 3. Migrates every subscription on an earlier version of that code onto the new
 *    one, via the same recorded migration the Admin screen uses, so the change
 *    is auditable rather than a quiet database edit.
 *
 * It refuses to touch anything that is not one of the starter plan codes, so it
 * can never publish over a plan an admin created.
 */
export async function refreshStarterPlans(): Promise<PlansRefreshResult> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin)
    throw new Error(
      "Run `pnpm admin:bootstrap` first — the plans refresh never creates an Admin password.",
    );

  const result: PlansRefreshResult = { refreshed: [], unchanged: [] };

  for (const seed of STARTER_PLANS) {
    const [live, latest] = await Promise.all([
      prisma.platformPlan.findFirst({
        where: { code: seed.code, active: true },
        orderBy: { version: "desc" },
      }),
      prisma.platformPlan.findFirst({
        where: { code: seed.code },
        orderBy: { version: "desc" },
      }),
    ]);

    if (!latest) {
      result.unchanged.push(
        `plan ${seed.code} (not created yet — run the seed first)`,
      );
      continue;
    }
    if (
      featureFingerprint(latest.features) === featureFingerprint(seed.features)
    ) {
      result.unchanged.push(`plan ${seed.code} (already current)`);
      continue;
    }

    const source = live ?? latest;
    const published = await upsertPlan(admin.id, {
      code: source.code,
      name: source.name,
      description: source.description,
      priceTzs: source.priceTzs,
      priceFrom: source.priceFrom,
      // A refresh republishes features, never the catalog slot: a legacy code
      // stays outside the grid instead of silently gaining a tier.
      tierKey: source.tierKey,
      planType: source.planType as "PARTNER" | "INDEPENDENT" | null,
      periodDays: source.periodDays,
      trialEligible: source.trialEligible,
      ...(source.trialDays === null ? {} : { trialDays: source.trialDays }),
      lifecycle: "PUBLISHED",
      visibility: source.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      // The preset owns the promise as well as the features, so the two stay coherent.
      commercialPromise: seed.commercialPromise,
      features: seed.features,
      isDemo: source.isDemo,
    });

    // Recorded, then applied: the audit trail shows the old → new version and who
    // was moved, exactly as if an admin had done it from the plans screen.
    const migration = await schedulePlanMigration(admin.id, {
      planId: published.id,
      scope: "ALL",
      effectiveAt: new Date(),
      resellerIds: [],
      note: `Starter preset refresh: ${published.code} v${source.version} → v${published.version}`,
    });
    const migrated = await applyPlanMigration(
      migration.id,
      new Date(),
      admin.id,
    );

    result.refreshed.push({
      code: published.code,
      from: source.version,
      to: published.version,
      migrated,
    });
  }

  return result;
}
