import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLAN_PRESETS, normalizePlanFeatures, planFeaturesWithDefaults, type PlanFeatures } from "@advo/contracts";
import { prisma } from "@advo/db";
import { resetTestDatabase } from "../test/db.js";
import { AuthService } from "./auth/auth.service.js";
import { upsertPlan } from "./subscriptions/subscriptions.service.js";
import { listPublicPlans } from "./marketing/marketing.service.js";

/**
 * The public pricing catalog.
 *
 * The marketing page quotes these numbers to people who have not signed up, so
 * the cases here are about what must *never* appear: a draft Admin is still
 * editing, a private plan assigned to one tenant, and a trial that the plan is
 * not eligible for. Each plan is created with a deliberately meaningless name so
 * a passing case can only come from the stored flags, never from the label.
 */

const auth = new AuthService();
let adminId = "";
let seq = 0;

function presetFeatures(key: "sponsored" | "brand-control" | "ad-free"): PlanFeatures {
  const preset = PLAN_PRESETS.find((p) => p.key === key);
  if (!preset) throw new Error(`missing preset ${key}`);
  return normalizePlanFeatures(planFeaturesWithDefaults(preset.features));
}

/** The Brand Control preset with individual keys overridden by the case. */
function features(overrides: Partial<PlanFeatures> = {}): PlanFeatures {
  return { ...presetFeatures("brand-control"), ...overrides };
}

/** Creates a plan version with the visibility/lifecycle the case needs. */
async function makePlan(
  options: {
    name?: string;
    priceTzs?: bigint;
    lifecycle?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    visibility?: "PUBLIC" | "PRIVATE";
    trialEligible?: boolean;
    trialDays?: number;
    promise?: "standard" | "ad_free";
    features?: PlanFeatures;
    isDemo?: boolean;
  } = {},
) {
  seq += 1;
  return upsertPlan(adminId, {
    code: `pub-${seq}`,
    name: options.name ?? `Plan ${seq}`,
    description: `Catalog plan ${seq}`,
    priceTzs: options.priceTzs ?? 20_000n,
    periodDays: 30,
    trialEligible: options.trialEligible ?? false,
    ...(options.trialDays === undefined ? {} : { trialDays: options.trialDays }),
    lifecycle: options.lifecycle ?? "PUBLISHED",
    visibility: options.visibility ?? "PUBLIC",
    commercialPromise: options.promise ?? "standard",
    features: options.features ?? features(),
    isDemo: options.isDemo ?? false,
  });
}

describe("public plan catalog", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    const admin = await auth.bootstrapAdmin({
      email: "admin@marketing.test",
      password: "AdminSecurePass1",
      name: "Admin",
    });
    adminId = admin.userId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("publishes only active, published, public plans", async () => {
    await makePlan({ name: "Visible" });
    await makePlan({ name: "Still a draft", lifecycle: "DRAFT" });
    await makePlan({ name: "Private deal", visibility: "PRIVATE" });
    const retired = await makePlan({ name: "Retired" });
    await prisma.platformPlan.update({
      where: { id: retired.id },
      data: { active: false },
    });

    const codes = (await listPublicPlans()).map((p) => p.name);
    expect(codes).toContain("Visible");
    expect(codes).not.toContain("Still a draft");
    expect(codes).not.toContain("Private deal");
    expect(codes).not.toContain("Retired");
  });

  it("orders the catalog cheapest first so the entry tier leads the grid", async () => {
    const prices = (await listPublicPlans()).map((p) => Number(p.priceTzs));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("serialises the price as a decimal string, never a JSON number", async () => {
    const plan = (await listPublicPlans()).find((p) => p.name === "Visible");
    expect(plan?.priceTzs).toBe("20000");
    expect(typeof plan?.priceTzs).toBe("string");
  });

  it("reports unlimited capacity as null rather than zero", async () => {
    await makePlan({
      name: "Unlimited",
      features: features({
        limits: { sites: null, devices: null, wifi_packages_per_site: null },
      }),
    });
    const plan = (await listPublicPlans()).find((p) => p.name === "Unlimited");
    expect(plan?.capacity).toEqual({
      sites: null,
      devices: null,
      packagesPerSite: null,
    });
  });

  it("hides a trial the plan is not eligible for, even when a length is stored", async () => {
    // `trialDays` can survive an Admin toggling eligibility off; the card must not
    // advertise a trial the subscription service would refuse to start.
    await makePlan({ name: "No trial", trialEligible: false, trialDays: 14 });
    await makePlan({ name: "Trial", trialEligible: true, trialDays: 7 });

    const plans = await listPublicPlans();
    expect(plans.find((p) => p.name === "No trial")?.trialDays).toBeNull();
    expect(plans.find((p) => p.name === "Trial")?.trialDays).toBe(7);
  });

  it("summarises advertising from the placements and surfaces the Ad Free promise", async () => {
    await makePlan({
      name: "Ads required",
      features: presetFeatures("sponsored"),
    });
    await makePlan({
      name: "Ads optional",
      features: presetFeatures("brand-control"),
    });
    await makePlan({
      name: "Ads off",
      features: presetFeatures("ad-free"),
      promise: "ad_free",
    });

    const plans = await listPublicPlans();
    expect(plans.find((p) => p.name === "Ads required")?.advertising).toBe("required");
    expect(plans.find((p) => p.name === "Ads optional")?.advertising).toBe("optional");
    const adFree = plans.find((p) => p.name === "Ads off");
    expect(adFree?.advertising).toBe("none");
    expect(adFree?.commercialPromise).toBe("ad_free");
  });

  it("never leaks the raw entitlement JSON or internal fields", async () => {
    const plan = (await listPublicPlans())[0]!;
    expect(Object.keys(plan).sort()).toEqual([
      "advertising",
      "capacity",
      "code",
      "commercialPromise",
      "description",
      "flags",
      "id",
      "isDemo",
      "name",
      "periodDays",
      "priceTzs",
      "trialDays",
    ]);
  });
});
