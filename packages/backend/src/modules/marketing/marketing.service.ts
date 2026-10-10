import { prisma } from "@advo/db";
import {
  normalizePlanFeatures,
  placementOf,
  planFeaturesWithDefaults,
  type AdvertisingLevel,
  type CommercialPromise,
  type PlanFeatures,
  type PublicPlan,
} from "@advo/contracts";

/**
 * One plan as the public marketing site shows it.
 *
 * The shape is {@link PublicPlan} from `@advo/contracts`, shared with the page
 * that renders it. It is deliberately *structured facts*, never pre-rendered
 * prose: the site is bilingual, so the copy is chosen by the translator on the
 * client of the request rather than baked into the API. The raw entitlement JSON
 * never leaves the server, which keeps the response stable if a new feature key
 * is added later.
 */
export type PublicPlanView = PublicPlan;

/** Whether the plan makes advertising compulsory, optional, or absent. */
function advertisingLevel(features: PlanFeatures): AdvertisingLevel {
  const modes = (["ads.banner", "ads.explore"] as const).map((key) => placementOf(features, key).mode);
  if (modes.every((mode) => mode === "DISABLED")) return "none";
  if (modes.some((mode) => mode === "REQUIRED")) return "required";
  return "optional";
}

/** Projects a stored plan row into the public view. */
function toPublicPlanView(plan: {
  id: string;
  code: string;
  name: string;
  description: string;
  priceTzs: bigint;
  periodDays: number;
  trialEligible: boolean;
  trialDays: number | null;
  isDemo: boolean;
  commercialPromise: string;
  features: unknown;
}): PublicPlanView {
  const features = normalizePlanFeatures(planFeaturesWithDefaults(plan.features));
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceTzs: plan.priceTzs.toString(),
    periodDays: plan.periodDays,
    trialDays: plan.trialEligible ? (plan.trialDays ?? null) : null,
    isDemo: plan.isDemo,
    commercialPromise: plan.commercialPromise as CommercialPromise,
    capacity: {
      sites: features.limits.sites,
      devices: features.limits.devices,
      packagesPerSite: features.limits.wifi_packages_per_site,
    },
    advertising: advertisingLevel(features),
    flags: {
      logoUpload: features.branding.logo_upload,
      colorsEdit: features.branding.colors_edit,
      badgeRemovable: features.branding.platform_badge_removable,
      voucher: features.payments.voucher,
      orderEdit: features.packages.order_edit,
      cardStyles: features.package_cards.allowed_styles,
      defaultCardStyle: features.package_cards.default_style,
    },
  };
}

/**
 * The sellable plan catalog for the public pricing page.
 *
 * Only `PUBLISHED` + `PUBLIC` versions are returned, ordered cheapest first so
 * the page can treat the first plan as the entry tier without guessing. Private
 * plans are assigned by Admin and must never appear in marketing.
 */
export async function listPublicPlans(): Promise<PublicPlanView[]> {
  const plans = await prisma.platformPlan.findMany({
    where: { active: true, lifecycle: "PUBLISHED", visibility: "PUBLIC" },
    orderBy: [{ priceTzs: "asc" }, { code: "asc" }],
  });
  return plans.map(toPublicPlanView);
}
