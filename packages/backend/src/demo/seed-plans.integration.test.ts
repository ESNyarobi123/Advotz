import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PACKAGE_CARD_STYLES, PACKAGE_LAYOUTS, planFeaturesWithDefaults, type PlanFeatures } from "@advo/contracts";
import { prisma } from "@advo/db";
import { FakeOmadaAdapter } from "@advo/omada";
import { resetTestDatabase } from "../test/db.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { saveController } from "../modules/network/controllers.service.js";
import { startTrial, upsertPlan } from "../modules/subscriptions/subscriptions.service.js";
import { refreshStarterPlans, STARTER_PLANS, seedPlans } from "./seed-plans.js";

/**
 * The starter-catalog refresh, against the real database.
 *
 * The behaviour this pins is the one that is easy to get wrong and invisible when
 * it is: a published plan version is an immutable snapshot, so a capability added
 * to a preset later (`bold` cards, the layout axis) never reaches a plan that was
 * published before it existed. `refreshStarterPlans` is the deliberate escape
 * hatch, and it must be:
 *
 * - **idempotent** — a catalog already on the current presets is left alone, so
 *   running it on a schedule cannot version a plan every night;
 * - **non-destructive** — an admin's own price, name and billing period survive,
 *   because only the feature set is refreshed;
 * - **narrow** — a plan an admin created under their own code is never touched;
 * - **recorded** — subscribers move through a real `PlanMigration`, not a quiet
 *   `planId` update, so the old → new version is auditable.
 */

const auth = new AuthService();

/** A starter preset with the two capabilities that post-date the first publish. */
function staleBrandControl(): PlanFeatures {
  const current = planFeaturesWithDefaults(STARTER_PLANS.find((p) => p.code === "brand-control")!.features);
  return {
    ...current,
    package_cards: {
      allowed_styles: ["classic", "compact", "soft", "outlined"],
      default_style: "classic",
      // Absent from the stored payload on purpose: this is what a v1 row looks
      // like after `bold` and the layout axis were added to the catalog.
      allowed_layouts: ["list", "grid-2"],
      default_layout: "grid-2",
    },
  };
}

describe("starter plan refresh", () => {
  let adminId: string;
  let seq = 100;

  /** A reseller invited through the real Agent flow, so nothing is hand-inserted. */
  async function newReseller(): Promise<{ resellerId: string; ownerUserId: string }> {
    seq += 1;
    const referralCode = `RFRSH${seq}`;
    await auth.createAgent(adminId, {
      name: `Agent ${referralCode}`,
      email: `agent${referralCode}@advo.test`,
      phone: `+25576${String(seq).padStart(7, "0")}`,
      password: "AgentSecure123!",
      referralCode,
    });
    const agent = await prisma.user.findFirstOrThrow({ where: { agent: { referralCode } }, include: { agent: true } });
    const actor = {
      id: agent.id,
      role: "AGENT" as const,
      email: agent.email,
      name: agent.name,
      status: "ACTIVE" as const,
      emailVerifiedAt: null,
      resellerId: null,
      agentId: agent.agent!.id,
      mfaEnabled: false,
      mfaPassed: false,
      sessionId: "test",
    };
    const invite = await auth.createInvitation(actor, {
      businessName: `Refresh Tenant ${seq}`,
      contactName: `Owner ${seq}`,
      email: `refresh${seq}@advo.test`,
      phone: `+25577${String(seq).padStart(7, "0")}`,
      consentConfirmed: true,
    });
    const token = (invite as { devInvitationToken?: string }).devInvitationToken!;
    await auth.acceptInvitation({ token, ownerName: `Owner ${seq}`, password: "OwnerSecure123!", acceptTerms: true });
    const reseller = await prisma.reseller.findFirstOrThrow({ where: { owner: { email: `refresh${seq}@advo.test` } } });
    return { resellerId: reseller.id, ownerUserId: reseller.ownerUserId };
  }

  beforeAll(async () => {
    await resetTestDatabase();
    FakeOmadaAdapter.resetSharedState();
    const admin = await auth.bootstrapAdmin({ email: "admin@refresh.test", password: "AdminSecurePass1", name: "Admin" });
    adminId = admin.userId;
    await saveController(adminId, { name: "Simulated", mode: "FAKE", isDefault: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("publishes a new starter version with the current presets, keeping the price and moving subscribers", async () => {
    // A stale v1 of a starter code at a price an admin chose themselves.
    const stale = await upsertPlan(adminId, {
      code: "brand-control",
      name: "Brand Control",
      description: "Published before the fifth card style existed.",
      priceTzs: 31_500n,
      periodDays: 45,
      trialEligible: true,
      trialDays: 9,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: staleBrandControl(),
      isDemo: true,
    });
    expect((stale.features as { package_cards: { allowed_styles: string[] } }).package_cards.allowed_styles).not.toContain("bold");

    const subscriber = await newReseller();
    await startTrial(subscriber.resellerId, stale.id, subscriber.ownerUserId);

    // Something an admin built under their own code, which the refresh must not see.
    const bespoke = await upsertPlan(adminId, {
      code: "acme-bespoke",
      name: "Acme Bespoke",
      description: "An admin's own plan.",
      priceTzs: 9_900n,
      periodDays: 30,
      trialEligible: false,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: staleBrandControl(),
      isDemo: false,
    });

    const result = await refreshStarterPlans();

    const refreshed = result.refreshed.find((row) => row.code === "brand-control");
    expect(refreshed).toBeDefined();
    expect(refreshed!.from).toBe(stale.version);
    expect(refreshed!.to).toBe(stale.version + 1);
    expect(refreshed!.migrated).toBe(1);

    // Exactly one sellable version per code, and it carries the current presets.
    const live = await prisma.platformPlan.findFirstOrThrow({ where: { code: "brand-control", active: true } });
    expect(live.version).toBe(stale.version + 1);
    const features = live.features as { package_cards: { allowed_styles: string[]; allowed_layouts: string[] } };
    expect(features.package_cards.allowed_styles).toEqual([...PACKAGE_CARD_STYLES]);
    expect(features.package_cards.allowed_layouts).toEqual([...PACKAGE_LAYOUTS]);

    // The admin's price, period and trial length survived: only features refresh.
    expect(live.priceTzs).toBe(31_500n);
    expect(live.periodDays).toBe(45);
    expect(live.trialDays).toBe(9);
    expect(live.name).toBe("Brand Control");

    // The subscriber was moved, and by a recorded migration rather than a silent edit.
    const subscription = await prisma.subscription.findUniqueOrThrow({ where: { resellerId: subscriber.resellerId } });
    expect(subscription.planId).toBe(live.id);
    const migration = await prisma.planMigration.findFirstOrThrow({ where: { planId: live.id } });
    expect(["APPLIED", "PARTIAL"]).toContain(migration.status);
    const target = await prisma.planMigrationTarget.findFirstOrThrow({ where: { migrationId: migration.id } });
    expect(target.resellerId).toBe(subscriber.resellerId);
    expect(target.fromVersion).toBe(stale.version);

    // The admin's own plan was not refreshed, repriced or versioned.
    const untouched = await prisma.platformPlan.findUniqueOrThrow({ where: { id: bespoke.id } });
    expect(untouched.version).toBe(bespoke.version);
    expect(untouched.features).toEqual(bespoke.features);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const before = await prisma.platformPlan.findMany({ where: { code: "brand-control" }, orderBy: { version: "asc" } });

    const second = await refreshStarterPlans();

    expect(second.refreshed).toEqual([]);
    expect(second.unchanged).toContain("plan brand-control (already current)");

    const after = await prisma.platformPlan.findMany({ where: { code: "brand-control" }, orderBy: { version: "asc" } });
    expect(after.map((row) => row.version)).toEqual(before.map((row) => row.version));
  });

  it("does nothing when a starter code has never been created", async () => {
    const result = await refreshStarterPlans();
    // Nothing was refreshed, and the missing codes are reported rather than invented.
    expect(result.refreshed).toEqual([]);
    const missing = STARTER_PLANS.map((plan) => plan.code).filter((code) => code !== "brand-control");
    for (const code of missing) {
      expect(result.unchanged).toContain(`plan ${code} (not created yet — run the seed first)`);
    }
  });

  it("creates the catalog the refresh then has nothing to do", async () => {
    // The plain seed fills in the codes the refresh declined to invent.
    await seedPlans();
    const result = await refreshStarterPlans();
    expect(result.refreshed).toEqual([]);
    expect(result.unchanged).not.toContain("plan sponsored (not created yet — run the seed first)");

    // And the seeded catalog is complete on both new axes from the first publish.
    const sponsored = await prisma.platformPlan.findFirstOrThrow({ where: { code: "sponsored", active: true } });
    const features = sponsored.features as { package_cards: { allowed_styles: string[]; allowed_layouts: string[] } };
    expect(features.package_cards.allowed_styles).toEqual(["classic", "compact"]);
    expect(features.package_cards.allowed_layouts).toEqual([...PACKAGE_LAYOUTS]);
  });
});
