import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PLAN_PRESETS,
  planFeaturesWithDefaults,
  type CommercialPromise,
  type PlanFeatures,
} from "@advo/contracts";
import { prisma } from "@advo/db";
import { FakeOmadaAdapter } from "@advo/omada";
import { resetTestDatabase } from "../test/db.js";
import { AuthService } from "./auth/auth.service.js";
import { drainOutbox } from "./outbox/outbox.dispatcher.js";
import { saveController } from "./network/controllers.service.js";
import { createSite } from "./network/sites.service.js";
import { createPackage } from "./catalog/packages.service.js";
import { createVoucherGroup, listVouchers } from "./catalog/vouchers.service.js";
import { listActivePlans, publishPlan, startTrial, upsertPlan } from "./subscriptions/subscriptions.service.js";
import {
  resolveResellerEntitlements,
  resolveSiteConfig,
  sitePortalState,
  updateSitePortalPreferences,
} from "./subscriptions/entitlements.service.js";
import {
  applyPlanMigration,
  listPlanMigrations,
  previewPlanMigration,
  schedulePlanMigration,
} from "./subscriptions/plan-migrations.service.js";
import { createCampaign, setCampaignStatus } from "./subscriptions/campaigns.service.js";
import { createPortalContext, grantStatus, portalAds, portalBootstrap, redeemVoucher } from "./portal/portal.service.js";

/**
 * The section 16 acceptance matrix, exercised end to end.
 *
 * These are the cases the specification calls out as the test of whether feature
 * control is real or decorative: every one drives the real resolver, the real
 * guarded write path and the real public portal payload, so a UI-only switch
 * cannot pass them.
 *
 * Each case runs against its *own* plan and its own reseller. Plan names are
 * deliberately meaningless or actively misleading ("Alpha", "Ad Free") so that
 * behaviour can only come from the feature catalog, never from a name. Keeping
 * the fleets separate means a migration in one case cannot quietly change what
 * the next case is observing.
 */

const auth = new AuthService();
const IP = "203.0.113.20";

type Account = { resellerId: string; ownerUserId: string; agentId: string };
type Fleet = Account & {
  siteId: string;
  slug: string;
  packageId: string;
  planId: string;
  planCode: string;
  planVersion: number;
};

/**
 * The three shapes the specification names, expressed only as feature values.
 *
 * Sponsored: banner and Explore compulsory, appearance minimal.
 * Brand Control: every placement optional, full appearance control.
 * Ad Free: nothing sponsored exists and the voucher is off.
 */
function sponsoredFeatures(): PlanFeatures {
  return planFeaturesWithDefaults({
    branding: { logo_upload: true, colors_edit: true, platform_badge_removable: false },
    ads: { banner: { mode: "REQUIRED", default_visible: true }, explore: { mode: "REQUIRED", default_visible: true } },
    discovery: {
      promote_business: { mode: "OPTIONAL", default_visible: true },
      platform_link: { mode: "OPTIONAL", default_visible: true },
      jobs: { mode: "OPTIONAL", default_visible: true },
    },
    package_cards: { allowed_styles: ["classic", "compact"], default_style: "classic" },
    packages: { order_edit: false },
    payments: { voucher: true },
  });
}

function brandControlFeatures(): PlanFeatures {
  return planFeaturesWithDefaults({
    branding: { logo_upload: true, colors_edit: true, platform_badge_removable: true },
    ads: { banner: { mode: "OPTIONAL", default_visible: true }, explore: { mode: "OPTIONAL", default_visible: true } },
    discovery: {
      promote_business: { mode: "OPTIONAL", default_visible: true },
      platform_link: { mode: "OPTIONAL", default_visible: true },
      jobs: { mode: "OPTIONAL", default_visible: true },
    },
    package_cards: { allowed_styles: ["classic", "compact", "soft", "outlined"], default_style: "classic" },
    packages: { order_edit: true },
    payments: { voucher: true },
  });
}

function adFreeFeatures(): PlanFeatures {
  return planFeaturesWithDefaults({
    branding: { logo_upload: false, colors_edit: false, platform_badge_removable: true },
    ads: { banner: { mode: "DISABLED", default_visible: false }, explore: { mode: "DISABLED", default_visible: false } },
    discovery: {
      promote_business: { mode: "DISABLED", default_visible: false },
      platform_link: { mode: "DISABLED", default_visible: false },
      jobs: { mode: "DISABLED", default_visible: false },
    },
    package_cards: { allowed_styles: ["classic", "compact", "soft", "outlined"], default_style: "soft" },
    packages: { order_edit: true },
    payments: { voucher: false },
  });
}

describe("plan feature control (section 16 acceptance cases)", () => {
  let adminId: string;
  let seq = 0;

  /** A globally unique reseller invited through the real Agent flow. */
  async function inviteReseller(n: number): Promise<Account> {
    const referralCode = `FCAG${n}`;
    await auth.createAgent(adminId, {
      name: `Agent ${referralCode}`,
      email: `agent${n}@advo.test`,
      phone: `+25570${String(n).padStart(7, "0")}`,
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
      businessName: `Tenant ${n}`,
      contactName: `Owner ${n}`,
      email: `owner${n}@advo.test`,
      phone: `+25571${String(n).padStart(7, "0")}`,
      consentConfirmed: true,
    });
    const token = (invite as { devInvitationToken?: string }).devInvitationToken!;
    await auth.acceptInvitation({ token, ownerName: `Owner ${n}`, password: "OwnerSecure123!", acceptTerms: true });
    const reseller = await prisma.reseller.findFirstOrThrow({ where: { owner: { email: `owner${n}@advo.test` } } });
    return { resellerId: reseller.id, ownerUserId: reseller.ownerUserId, agentId: agent.agent!.id };
  }

  /** Provisions a sellable site with one unlimited package. */
  async function makeTenant(account: Account, n: number): Promise<Account & Pick<Fleet, "siteId" | "slug" | "packageId">> {
    const { site } = await createSite(account.resellerId, account.ownerUserId, {
      name: `Site ${n}`,
      timezone: "Africa/Dar_es_Salaam",
    });
    await drainOutbox(20);
    const pkg = await createPackage(account.resellerId, account.ownerUserId, {
      name: "1 Hour",
      priceTzs: 2_000n,
      durationSeconds: 3600,
      downloadKbps: 2048,
      uploadKbps: 1024,
      quotaType: "UNLIMITED",
      maxDevices: 2,
      activationWindowSeconds: 86400,
      siteIds: [site.id],
    });
    return { ...account, siteId: site.id, slug: site.slug, packageId: pkg.id };
  }

  /** Creates a published plan version without binding a reseller to it. */
  async function makePlan(features: PlanFeatures, options: { name?: string; promise?: CommercialPromise; lifecycle?: "DRAFT" | "PUBLISHED" } = {}) {
    seq += 1;
    return upsertPlan(adminId, {
      code: `plan-${seq}`,
      name: options.name ?? `Plan ${seq}`,
      description: `Acceptance plan ${seq}`,
      priceTzs: 20_000n,
      periodDays: 30,
      trialEligible: true,
      trialDays: 30,
      lifecycle: options.lifecycle ?? "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: options.promise ?? "standard",
      features,
      isDemo: true,
    });
  }

  /**
   * A fully isolated tenant: its own plan version, its own reseller on trial, its
   * own provisioned site and package. Nothing it does can affect another case.
   */
  async function newFleet(
    features: PlanFeatures,
    options: { name?: string; promise?: CommercialPromise } = {},
  ): Promise<Fleet> {
    const plan = await makePlan(features, options);
    const invited = await inviteReseller(seq);
    await startTrial(invited.resellerId, plan.id, invited.ownerUserId);
    const account = await makeTenant(invited, seq);
    return { ...account, planId: plan.id, planCode: plan.code, planVersion: plan.version };
  }

  beforeAll(async () => {
    await resetTestDatabase();
    FakeOmadaAdapter.resetSharedState();
    const admin = await auth.bootstrapAdmin({ email: "admin@fc.test", password: "AdminSecurePass1", name: "Admin" });
    adminId = admin.userId;
    await saveController(adminId, { name: "Simulated", mode: "FAKE", isDefault: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Reads the rejection off either exception shape: the plain `PreferenceRejected`
   * the guarded write path throws, or the Nest HTTP exception the portal throws.
   */
  async function expectRejected(promise: Promise<unknown>, code: string) {
    try {
      await promise;
      throw new Error(`expected rejection with ${code}`);
    } catch (error) {
      const typed = error as { getStatus?: () => number; getResponse?: () => { code?: string } | undefined; code?: string };
      if (typeof typed.getStatus === "function") {
        expect(typed.getStatus()).toBe(403);
        expect(typed.getResponse?.()?.code).toBe(code);
      } else {
        expect(typed.code).toBe(code);
      }
    }
  }

  /* ── Criterion 1: behaviour comes from features, not names ────────────── */

  it("decides placement policy from features, not from the plan's name", async () => {
    // A plan *named* Ad Free that actually sells sponsored placements...
    const misnamedAdFree = await newFleet(brandControlFeatures(), { name: "Ad Free" });
    // ...and a plan named Sponsored that actually has every placement disabled.
    const misnamedSponsored = await newFleet(adFreeFeatures(), { name: "Sponsored", promise: "ad_free" });

    const a = await resolveResellerEntitlements(misnamedAdFree.resellerId);
    const b = await resolveResellerEntitlements(misnamedSponsored.resellerId);
    expect(a.visibility["ads.banner"].mode).toBe("OPTIONAL");
    expect(b.visibility["ads.banner"].mode).toBe("DISABLED");

    // The portal agrees with the resolver, so the name never reaches the guest.
    expect((await portalBootstrap(misnamedAdFree.slug)).config?.commercialPromise).toBe("standard");
    expect((await portalBootstrap(misnamedSponsored.slug)).config?.commercialPromise).toBe("ad_free");
  });

  /* ── Criterion 3: a REQUIRED placement cannot be hidden through the API ── */

  it("refuses to hide a REQUIRED placement and leaves the stored policy untouched", async () => {
    const fleet = await newFleet(sponsoredFeatures());

    await expectRejected(
      updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, { visibility: { banner: false } }),
      "FEATURE_LOCKED_BY_PLAN",
    );

    // Nothing was half-applied.
    expect(await prisma.sitePortalPreference.count({ where: { siteId: fleet.siteId } })).toBe(0);
    const config = (await resolveSiteConfig(fleet.siteId))!.config;
    expect(config.visibility["ads.banner"].visible).toBe(true);
  });

  /* ── Criterion 2: appearance changes, compulsory placements stay ───────── */

  it("applies branding and card style while the compulsory placements stay on", async () => {
    const fleet = await newFleet(sponsoredFeatures());

    const saved = await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      branding: { primary_color: "#12406f", accent_color: "#b3541e", logo_url: "https://cdn.advo.test/logo.png" },
      package_cards: { style: "compact" },
    });
    expect(saved.config.branding.primaryColor).toBe("#12406f");
    expect(saved.config.branding.logoUrl).toBe("https://cdn.advo.test/logo.png");
    expect(saved.config.packageCards.style).toBe("compact");
    // The plan still decides the sponsored placements.
    expect(saved.config.visibility["ads.banner"].visible).toBe(true);
    expect(saved.config.visibility["ads.explore"].visible).toBe(true);

    const bootstrap = await portalBootstrap(fleet.slug);
    expect(bootstrap.site.logoUrl).toBe("https://cdn.advo.test/logo.png");
    expect(bootstrap.site.theme?.primary).toBe("#12406f");
    expect(bootstrap.packageCardStyle).toBe("compact");
    expect(bootstrap.packages.every((pkg) => (pkg as { cardStyle?: string }).cardStyle === "compact")).toBe(true);
  });

  /* ── Criterion 7: a card style outside the allowlist is refused ────────── */

  it("refuses a card style the plan does not allow and serves the allowed default", async () => {
    const fleet = await newFleet(sponsoredFeatures());
    await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      package_cards: { style: "compact" },
    });

    await expectRejected(
      updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
        package_cards: { style: "outlined" },
      }),
      "FEATURE_LOCKED_BY_PLAN",
    );

    // The stored preference is still the allowed one and the portal keeps selling.
    expect((await resolveSiteConfig(fleet.siteId))!.config.packageCards.style).toBe("compact");
    const served = await portalBootstrap(fleet.slug);
    expect(served.packages.length).toBeGreaterThan(0);
    expect(served.packages.every((pkg) => (pkg as { cardStyle?: string }).cardStyle === "compact")).toBe(true);
  });

  /* ── Criterion 7b: the arrangement is gated on its own allowlist ───────── */

  it("refuses a card arrangement the plan does not allow and serves the allowed default", async () => {
    // A plan narrowed to one column and two-up, with two-up as the default, so
    // three-up is the arrangement this plan must refuse.
    const narrowLayouts = planFeaturesWithDefaults({
      ...sponsoredFeatures(),
      package_cards: { ...sponsoredFeatures().package_cards, allowed_layouts: ["list", "grid-2"], default_layout: "grid-2" },
    });
    const fleet = await newFleet(narrowLayouts);

    await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      package_cards: { layout: "grid-2" },
    });
    expect((await resolveSiteConfig(fleet.siteId))!.config.packageCards.layout).toBe("grid-2");

    await expectRejected(
      updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
        package_cards: { layout: "grid-3" },
      }),
      "FEATURE_LOCKED_BY_PLAN",
    );

    // The refusal left the allowed arrangement in place, and the guest is served it.
    expect((await resolveSiteConfig(fleet.siteId))!.config.packageCards.layout).toBe("grid-2");
    expect((await portalBootstrap(fleet.slug)).packageCardLayout).toBe("grid-2");

    // A narrowed allowlist must also not *serve* an arrangement the row still holds
    // — the read is the gate, not the row. That is what makes a plan downgrade safe:
    // a reseller who chose three-up on a richer plan drops back to the default
    // rather than leaking a layout their current plan excludes.
    await prisma.sitePortalPreference.update({
      where: { siteId: fleet.siteId },
      data: { packageLayout: "grid-3" },
    });
    expect((await resolveSiteConfig(fleet.siteId))!.config.packageCards.layout).toBe("grid-2");
    expect((await portalBootstrap(fleet.slug)).packageCardLayout).toBe("grid-2");
  });

  /* ── Criterion 8: colour editing off refuses new colours, theme reverts ── */

  it("refuses a colour change when the plan has colour editing off and keeps the plan defaults", async () => {
    const fleet = await newFleet(adFreeFeatures(), { promise: "ad_free" });

    await expectRejected(
      updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
        branding: { primary_color: "#102040" },
      }),
      "FEATURE_LOCKED_BY_PLAN",
    );

    // Nothing was stored, and the effective theme is the plan's default.
    expect(await prisma.sitePortalPreference.count({ where: { siteId: fleet.siteId } })).toBe(0);
    const config = (await resolveSiteConfig(fleet.siteId))!.config;
    expect(config.branding.colorsEditAllowed).toBe(false);
    expect(config.branding.primaryColor).toBe(adFreeFeatures().branding.default_primary_color);
    expect(config.branding.accentColor).toBe(adFreeFeatures().branding.default_accent_color);
  });

  /* ── Criterion 4 & 5: individual OPTIONAL control, then hide-all ───────── */

  it("lets an OPTIONAL banner be hidden on its own, then hides all five at once", async () => {
    const fleet = await newFleet(brandControlFeatures());

    const one = await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      visibility: { banner: false },
    });
    expect(one.config.visibility["ads.banner"].visible).toBe(false);
    // Explore was not part of that request, so it is untouched.
    expect(one.config.visibility["ads.explore"].visible).toBe(true);
    // The bought package is untouched by a visibility decision.
    expect((await portalBootstrap(fleet.slug)).packages.length).toBeGreaterThan(0);

    const all = await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      hide_all_sponsored: true,
    });
    for (const key of ["ads.banner", "ads.explore", "discovery.promote_business", "discovery.platform_link", "discovery.jobs"] as const) {
      expect(all.config.visibility[key].visible).toBe(false);
    }
    expect(all.config.canHideAllSponsored).toBe(true);
    // Hide-all never touches the package list or checkout.
    expect((await portalBootstrap(fleet.slug)).packages.length).toBeGreaterThan(0);
  });

  /* ── Criterion 9: voucher off hides and refuses new redemptions ─────────── */

  it("hides/refuses new voucher redemptions on a plan without vouchers while existing sessions survive", async () => {
    const fleet = await newFleet(brandControlFeatures());
    const group = await createVoucherGroup(fleet.resellerId, fleet.ownerUserId, { name: "Batch", packageId: fleet.packageId, count: 2 });
    const vouchers = await listVouchers(fleet.resellerId, group.id);

    // A guest redeems while vouchers are still part of the plan.
    const ctx1 = await createPortalContext(
      fleet.slug,
      { clientMac: "33:33:44:55:66:01", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" },
      IP,
    );
    const existing = await redeemVoucher({ contextToken: ctx1.contextToken, code: vouchers[0]!.code }, IP);
    await drainOutbox(50);
    expect(existing.recoveryToken).toBeTruthy();

    // The tenant moves onto an ad-free plan, which has the voucher feature off.
    const adFree = await makePlan(adFreeFeatures(), { promise: "ad_free" });
    const migration = await schedulePlanMigration(adminId, {
      planId: adFree.id,
      scope: "SELECTED",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [fleet.resellerId],
      note: "Voucher off acceptance case",
    });
    await applyPlanMigration(migration.id, new Date(), adminId);

    // The button is hidden because the config says the feature is off.
    expect((await portalBootstrap(fleet.slug)).config?.voucherEnabled).toBe(false);

    // The session bought before the change is untouched.
    const status = await grantStatus(existing.recoveryToken);
    expect(typeof status.state).toBe("string");
    expect(status.state.length).toBeGreaterThan(0);
    expect(await prisma.accessGrant.count({ where: { resellerId: fleet.resellerId } })).toBe(1);

    // A *new* redemption is refused.
    const ctx2 = await createPortalContext(
      fleet.slug,
      { clientMac: "33:33:44:55:66:02", apMac: "aa:bb:cc:00:00:01", ssidName: "Cafe WiFi", radioId: "1" },
      IP,
    );
    await expectRejected(redeemVoucher({ contextToken: ctx2.contextToken, code: vouchers[1]!.code }, IP), "FEATURE_LOCKED_BY_PLAN");
    expect(await prisma.accessGrant.count({ where: { resellerId: fleet.resellerId } })).toBe(1);
  });

  /* ── Criterion 6 & 10 & 11: policy-aware ad delivery ──────────────────── */

  it("never delivers creatives to a DISABLED placement even when the campaign targets the site", async () => {
    const sponsored = await newFleet(sponsoredFeatures());
    const adFree = await newFleet(adFreeFeatures(), { promise: "ad_free" });

    // One creative, targeting both resellers explicitly: only the policy differs.
    const campaign = await createCampaign(adminId, {
      name: "Two tenants",
      status: "ACTIVE",
      placements: ["ads.banner", "ads.explore"],
      creative: { business: "Kimara Coffee", title: "Take a break", description: "", cta: "Learn more", theme: "cafe" },
      targeting: { resellerIds: [sponsored.resellerId, adFree.resellerId], siteIds: [] },
      startsAt: null,
      endsAt: null,
    });

    expect((await portalAds(sponsored.slug, "ads.banner")).campaigns.map((c) => c.id)).toEqual([campaign.id]);
    expect((await portalAds(sponsored.slug, "ads.explore")).campaigns.map((c) => c.id)).toEqual([campaign.id]);
    // The ad-free plan's DISABLED gate wins over the campaign's targeting.
    expect((await portalAds(adFree.slug, "ads.explore")).campaigns).toEqual([]);
    expect((await portalAds(adFree.slug, "ads.banner")).campaigns).toEqual([]);

    // A visible placement with no eligible campaign collapses to empty, and the
    // guest can still buy a package.
    await setCampaignStatus(adminId, campaign.id, "PAUSED", "Acceptance case");
    const empty = await portalAds(sponsored.slug, "ads.banner");
    expect(empty.campaigns).toEqual([]);
    const bootstrap = await portalBootstrap(sponsored.slug);
    expect(bootstrap.campaigns).toEqual([]);
    expect(bootstrap.packages.length).toBeGreaterThan(0);
  });

  it("does not deliver a campaign whose audience is another reseller", async () => {
    const mine = await newFleet(brandControlFeatures());
    const other = await newFleet(brandControlFeatures());

    const targeted = await createCampaign(adminId, {
      name: "Tenant 2 only",
      status: "ACTIVE",
      placements: ["ads.banner"],
      creative: { business: "Tenant 2 Cafe", title: "Only for Tenant 2", description: "", cta: "Learn more", theme: "tech" },
      targeting: { resellerIds: [other.resellerId], siteIds: [] },
      startsAt: null,
      endsAt: null,
    });
    expect((await portalAds(other.slug, "ads.banner")).campaigns.map((c) => c.id)).toEqual([targeted.id]);
    expect((await portalAds(mine.slug, "ads.banner")).campaigns).toEqual([]);
  });

  it("stops delivering every placement once the reseller hides all sponsored content", async () => {
    const fleet = await newFleet(brandControlFeatures());
    const campaign = await createCampaign(adminId, {
      name: "Hidden tenant",
      status: "ACTIVE",
      placements: ["ads.banner", "ads.explore"],
      creative: { business: "Cafe", title: "Hello", description: "", cta: "Learn more", theme: "cafe" },
      targeting: { resellerIds: [fleet.resellerId], siteIds: [] },
      startsAt: null,
      endsAt: null,
    });
    expect((await portalAds(fleet.slug, "ads.banner")).campaigns.map((c) => c.id)).toEqual([campaign.id]);

    await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, { hide_all_sponsored: true });
    expect((await portalAds(fleet.slug, "ads.banner")).campaigns).toEqual([]);
    expect((await portalAds(fleet.slug, "ads.explore")).campaigns).toEqual([]);
  });

  /* ── Criterion 15: no cross-tenant writes ─────────────────────────────── */

  it("refuses one reseller reading or writing another reseller's site", async () => {
    const owner = await newFleet(sponsoredFeatures());
    const intruder = await newFleet(sponsoredFeatures());

    async function expectDenied(promise: Promise<unknown>) {
      try {
        await promise;
        throw new Error("expected the cross-tenant call to be denied");
      } catch (error) {
        const status = (error as { getStatus?: () => number }).getStatus?.();
        expect(status === 403 || status === 404).toBe(true);
      }
    }
    await expectDenied(sitePortalState(intruder.resellerId, owner.siteId));
    await expectDenied(
      updateSitePortalPreferences(intruder.resellerId, intruder.ownerUserId, owner.siteId, { visibility: { banner: false } }),
    );
    // Nothing crossed tenants.
    expect(await prisma.sitePortalPreference.count({ where: { siteId: owner.siteId } })).toBe(0);
  });

  /* ── Criterion 16: an impossible configuration cannot be published ────── */

  it("refuses to publish an unknown feature key, a contradictory promise or a bad default style", async () => {
    // An unknown key would strip to nothing and look saved, so it must be refused.
    await expect(
      upsertPlan(adminId, {
        code: "with-typo",
        name: "Typo",
        description: "has a typo'd feature key",
        priceTzs: 10_000n,
        periodDays: 30,
        trialEligible: false,
        lifecycle: "PUBLISHED",
        visibility: "PUBLIC",
        commercialPromise: "standard",
        features: { ...sponsoredFeatures(), made_up_key: true },
        isDemo: true,
      }),
    ).rejects.toBeTruthy();

    // An Ad Free plan that still has a sponsored placement enabled contradicts itself.
    const contradictory = await makePlan(adFreeFeatures(), { promise: "ad_free", lifecycle: "DRAFT" });
    await prisma.platformPlan.update({
      where: { id: contradictory.id },
      data: { features: { ...adFreeFeatures(), ads: { banner: { mode: "OPTIONAL", default_visible: true }, explore: { mode: "DISABLED", default_visible: false } } } },
    });
    await expect(publishPlan(adminId, contradictory.id)).rejects.toBeTruthy();

    // A DEFAULT card style outside its own allowlist is equally unpublishable.
    const badStyle = await makePlan(
      planFeaturesWithDefaults({ ...sponsoredFeatures(), package_cards: { allowed_styles: ["classic"], default_style: "soft" } }),
      { lifecycle: "DRAFT" },
    );
    await expect(publishPlan(adminId, badStyle.id)).rejects.toBeTruthy();

    // The layout axis is validated the same way: a default the allowlist excludes
    // would make the guest's arrangement depend on which card happened to render.
    const badLayout = await makePlan(
      planFeaturesWithDefaults({
        ...sponsoredFeatures(),
        package_cards: { ...sponsoredFeatures().package_cards, allowed_layouts: ["grid-2"], default_layout: "list" },
      }),
      { lifecycle: "DRAFT" },
    );
    await expect(publishPlan(adminId, badLayout.id)).rejects.toBeTruthy();

    // None of the refused plans ever reached the sellable catalog.
    const sellable = await listActivePlans();
    expect(sellable.map((p) => p.code)).not.toContain("with-typo");
  });

  /* ── Criterion 13 & 14: draft, publish and scoped migration ───────────── */

  it("keeps live subscribers on their version when a new version is published", async () => {
    const fleet = await newFleet(sponsoredFeatures());
    const before = await portalBootstrap(fleet.slug);
    expect(before.config?.visibility["ads.banner"].visible).toBe(true);
    expect(before.config?.voucherEnabled).toBe(true);

    // A draft version changes the promise but must grant nothing yet.
    const draft = await upsertPlan(adminId, {
      code: fleet.planCode,
      name: "Plan next",
      description: "Second version, still a draft",
      priceTzs: 25_000n,
      periodDays: 30,
      trialEligible: true,
      trialDays: 30,
      lifecycle: "DRAFT",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: brandControlFeatures(),
      isDemo: true,
    });
    expect((await resolveResellerEntitlements(fleet.resellerId)).visibility["ads.banner"].mode).toBe("REQUIRED");

    await publishPlan(adminId, draft.id);
    // Publishing changes what is sold, never what is already granted.
    const after = await resolveResellerEntitlements(fleet.resellerId);
    expect(after.plan?.version).toBe(fleet.planVersion);
    expect(after.visibility["ads.banner"].mode).toBe("REQUIRED");
    expect((await resolveSiteConfig(fleet.siteId))!.config.configRevision).toBe(before.config?.configRevision);
  });

  it("previews and applies a scoped migration, recording old and new versions", async () => {
    const fleet = await newFleet(sponsoredFeatures());
    const nextVersion = await upsertPlan(adminId, {
      code: fleet.planCode,
      name: "Plan next",
      description: "Second version",
      priceTzs: 25_000n,
      periodDays: 30,
      trialEligible: true,
      trialDays: 30,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: brandControlFeatures(),
      isDemo: true,
    });

    // The preview the admin approves must match what actually runs.
    const preview = await previewPlanMigration({
      planId: nextVersion.id,
      scope: "ALL",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [],
      note: "Acceptance case",
    });
    expect(preview.targets.map((t) => t.resellerId)).toEqual([fleet.resellerId]);
    expect(preview.targets[0]!.from).toMatchObject({ code: fleet.planCode, version: fleet.planVersion });
    expect(preview.targets[0]!.to).toMatchObject({ code: fleet.planCode, version: nextVersion.version });

    const migration = await schedulePlanMigration(adminId, {
      planId: nextVersion.id,
      scope: "ALL",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [],
      note: "Acceptance case",
    });
    expect(migration.status).toBe("SCHEDULED");

    await applyPlanMigration(migration.id, new Date(), adminId);

    // The subscription moved and the *effective* behaviour followed the new version.
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { resellerId: fleet.resellerId } });
    expect(sub.planId).toBe(nextVersion.id);
    const ent = await resolveResellerEntitlements(fleet.resellerId);
    expect(ent.plan?.version).toBe(nextVersion.version);
    expect(ent.visibility["ads.banner"].mode).toBe("OPTIONAL");

    // Audit keeps both sides of the move.
    const auditRow = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "plan.migration_applied", resellerId: fleet.resellerId },
    });
    const metadata = auditRow.metadata as { from: { version: number }; to: { version: number } };
    expect(metadata.from.version).toBe(fleet.planVersion);
    expect(metadata.to.version).toBe(nextVersion.version);

    const reloaded = (await listPlanMigrations(nextVersion.id)).find((row) => row.id === migration.id)!;
    expect(reloaded.status).toBe("APPLIED");
    expect(reloaded.appliedCount).toBe(1);
  });

  it("never moves an ON_RENEWAL subscription mid-period", async () => {
    const fleet = await newFleet(sponsoredFeatures());
    const nextVersion = await upsertPlan(adminId, {
      code: fleet.planCode,
      name: "Plan next",
      description: "Second version",
      priceTzs: 30_000n,
      periodDays: 30,
      trialEligible: true,
      trialDays: 30,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: adFreeFeatures(),
      isDemo: true,
    });

    const migration = await schedulePlanMigration(adminId, {
      planId: nextVersion.id,
      scope: "ON_RENEWAL",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [],
      note: "Wait for the paid period",
    });
    await applyPlanMigration(migration.id, new Date(), adminId);

    // The period has not ended, so nothing moved and the migration says so.
    expect((await prisma.subscription.findUniqueOrThrow({ where: { resellerId: fleet.resellerId } })).planId).toBe(fleet.planId);
    const row = (await listPlanMigrations(nextVersion.id)).find((m) => m.id === migration.id)!;
    expect(row.status).toBe("PARTIAL");
    expect(row.pendingCount).toBe(1);
    expect(row.appliedCount).toBe(0);

    // Once the period has ended the same migration completes.
    await prisma.subscription.update({
      where: { resellerId: fleet.resellerId },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    await applyPlanMigration(migration.id, new Date(), adminId);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { resellerId: fleet.resellerId } })).planId).toBe(nextVersion.id);
    expect((await listPlanMigrations(nextVersion.id)).find((m) => m.id === migration.id)!.status).toBe("APPLIED");
  });

  it("moves nobody when the scope is new subscribers only", async () => {
    const fleet = await newFleet(sponsoredFeatures());
    const other = await makePlan(brandControlFeatures());

    const row = await schedulePlanMigration(adminId, {
      planId: other.id,
      scope: "NEW_ONLY",
      effectiveAt: new Date(),
      resellerIds: [],
      note: "New business only",
    });
    expect(row.status).toBe("APPLIED");
    expect(row.targets).toEqual([]);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { resellerId: fleet.resellerId } })).planId).toBe(fleet.planId);
  });

  it("moves only the resellers named by a SELECTED migration", async () => {
    const moves = await newFleet(sponsoredFeatures());
    const stays = await newFleet(sponsoredFeatures());
    const target = await makePlan(brandControlFeatures());

    const migration = await schedulePlanMigration(adminId, {
      planId: target.id,
      scope: "SELECTED",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [moves.resellerId],
      note: "Only one moves",
    });
    expect(migration.targets.map((t) => t.resellerId)).toEqual([moves.resellerId]);
    await applyPlanMigration(migration.id, new Date(), adminId);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { resellerId: moves.resellerId } })).planId).toBe(target.id);
    // The other tenant is untouched.
    expect((await prisma.subscription.findUniqueOrThrow({ where: { resellerId: stays.resellerId } })).planId).toBe(stays.planId);
  });

  /* ── Clearing appearance: `""` means "back to the template" ───────────── */

  /**
   * The designer sends every field it owns, using `""` for one the reseller has
   * emptied. Those saves must succeed for a reseller who has no logo and no
   * background image — which is every reseller when they first arrive — and an
   * emptied colour must actually revert instead of being silently ignored.
   */
  it("saves a design whose logo, background image and background colour are all empty", async () => {
    const fleet = await newFleet(brandControlFeatures());

    // Exactly the shape the designer sends before anything has been uploaded.
    const saved = await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      branding: { primary_color: "#12406f", background_color: "", logo_url: "", background_url: "", show_platform_badge: true },
      package_cards: { style: "compact", layout: "grid-3" },
      visibility: {},
    });

    expect(saved.config.branding.logoUrl).toBeNull();
    expect(saved.config.branding.backgroundUrl).toBeNull();
    expect(saved.config.branding.primaryColor).toBe("#12406f");
    expect(saved.config.branding.backgroundColor).toBe("");
    expect(saved.config.packageCards.style).toBe("compact");
  });

  it("treats an emptied background colour as a revert, not a no-op", async () => {
    const fleet = await newFleet(brandControlFeatures());
    await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      branding: { background_color: "#fff7f3" },
    });
    expect((await resolveSiteConfig(fleet.siteId))!.config.branding.backgroundColor).toBe("#fff7f3");

    // Clearing it has to reach the stored preference; an empty value used to fall
    // through the contrast check and leave the colour exactly where it was.
    const cleared = await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, { branding: { background_color: "" } });
    expect(cleared.config.branding.backgroundColor).toBe("");
    expect((await resolveSiteConfig(fleet.siteId))!.config.branding.backgroundColor).toBe("");
  });

  it("rejects a background colour that would swallow the portal's own text", async () => {
    const fleet = await newFleet(brandControlFeatures());

    // #0a0a0a is darker than the portal's own ink (#0f172a), so body text on it
    // would be unreadable. The violation names the field so the designer can
    // highlight the right control rather than showing a page-level error.
    await expect(
      updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, { branding: { background_color: "#0a0a0a" } }),
    ).rejects.toMatchObject({ code: "FEATURE_LOCKED_BY_PLAN", violations: [expect.objectContaining({ key: "branding.background_color" })] });

    // Rejected whole: the rejected write stored nothing.
    expect(await prisma.sitePortalPreference.count({ where: { siteId: fleet.siteId } })).toBe(0);
  });

  /**
   * A downgraded reseller must be able to undo what a higher plan let them upload.
   * The designer sends `""` for every appearance field it owns on *every* save,
   * so if clearing needs the permission that was just lost, a downgraded reseller
   * cannot save any design change at all — the whole patch is rejected over a
   * field they were only trying to empty.
   */
  it("lets a downgraded reseller clear a logo and background their old plan allowed", async () => {
    const fleet = await newFleet(brandControlFeatures());
    await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      branding: { logo_url: "https://cdn.advo.test/logo.png", background_url: "https://cdn.advo.test/bg.jpg" },
    });

    // Downgrade onto the Ad Free plan, which has neither upload permission.
    const plain = await makePlan(adFreeFeatures(), { promise: "ad_free" });
    const migration = await schedulePlanMigration(adminId, {
      planId: plain.id,
      scope: "SELECTED",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [fleet.resellerId],
      note: "Clearing acceptance case",
    });
    await applyPlanMigration(migration.id, new Date(), adminId);

    // The stored assets survive the downgrade, and setting a new one is refused.
    const state = await sitePortalState(fleet.resellerId, fleet.siteId);
    expect(state.preference.branding.logo_url).toBe("https://cdn.advo.test/logo.png");
    await expectRejected(updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, { branding: { logo_url: "https://cdn.advo.test/new.png" } }), "FEATURE_LOCKED_BY_PLAN");

    // Emptying them is not a plan capability, so it is allowed.
    const cleared = await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, { branding: { logo_url: "", background_url: "" } });
    expect(cleared.preference.branding.logo_url).toBeUndefined();
    expect(cleared.preference.branding.background_url).toBeUndefined();
    expect(cleared.config.branding.logoUrl).toBeNull();
  });

  /* ── Criterion 12: a downgrade keeps stored preferences ───────────────── */
  it("keeps stored branding through a downgrade while the effective config follows the new plan", async () => {
    const fleet = await newFleet(brandControlFeatures());
    await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, {
      branding: { primary_color: "#12406f", logo_url: "https://cdn.advo.test/sponsored.png" },
      package_cards: { style: "outlined" },
    });

    // Downgrade onto an ad-free plan that has no logo upload, no colour editing and
    // does not allow the style the reseller had chosen.
    const downgradeFeatures = {
      ...adFreeFeatures(),
      package_cards: { allowed_styles: ["classic", "soft"] as const, default_style: "soft" as const },
    };
    const adFree = await makePlan(planFeaturesWithDefaults(downgradeFeatures), { promise: "ad_free" });
    const migration = await schedulePlanMigration(adminId, {
      planId: adFree.id,
      scope: "SELECTED",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [fleet.resellerId],
      note: "Downgrade acceptance case",
    });
    await applyPlanMigration(migration.id, new Date(), adminId);

    const state = await sitePortalState(fleet.resellerId, fleet.siteId);
    // Nothing was deleted...
    expect(state.preference.branding.logo_url).toBe("https://cdn.advo.test/sponsored.png");
    expect(state.preference.branding.primary_color).toBe("#12406f");
    expect(state.preference.packageStyle).toBe("outlined");
    // ...but none of it applies any more, because the new plan does not include it.
    expect(state.config?.branding.logoUrl).toBeNull();
    expect(state.config?.branding.colorsEditAllowed).toBe(false);
    expect(state.config?.branding.primaryColor).toBe(adFreeFeatures().branding.default_primary_color);
    // The preferred style survives but stops applying when no longer allowed.
    expect(state.config?.packageCards.style).toBe(adFreeFeatures().package_cards.default_style);
    // The sponsored placements of the old plan are gone, so nothing is forced on.
    expect(state.config?.visibility["ads.banner"].visible).toBe(false);
    expect(state.config?.visibility["ads.explore"].visible).toBe(false);
    // And the package list still sells.
    expect((await portalBootstrap(fleet.slug)).packages.length).toBeGreaterThan(0);
  });

  /* ── Criterion 17: a stale revision can never be served ───────────────── */

  it("changes the config revision when the plan or the preference changes", async () => {
    const fleet = await newFleet(brandControlFeatures());
    const before = (await resolveSiteConfig(fleet.siteId))!.config.configRevision;

    await updateSitePortalPreferences(fleet.resellerId, fleet.ownerUserId, fleet.siteId, { visibility: { jobs: false } });
    const afterPreference = (await resolveSiteConfig(fleet.siteId))!.config.configRevision;
    expect(afterPreference).not.toBe(before);

    // An in-place feature edit keeps the version number but must still be visible.
    const plan = await prisma.platformPlan.findUniqueOrThrow({ where: { id: fleet.planId } });
    const changed = planFeaturesWithDefaults({ ...brandControlFeatures(), packages: { order_edit: false } });
    await prisma.platformPlan.update({ where: { id: fleet.planId }, data: { features: changed } });
    expect(plan.version).toBe(fleet.planVersion);
    const afterFeatureEdit = (await resolveSiteConfig(fleet.siteId))!.config.configRevision;
    expect(afterFeatureEdit).not.toBe(afterPreference);
  });

  it("rebuilds the public payload instead of serving a pre-migration cache entry", async () => {
    const fleet = await newFleet(adFreeFeatures(), { promise: "ad_free" });
    // Warm the cache, then move the tenant and read again: same slug, new answer.
    const warm = await portalBootstrap(fleet.slug);
    expect(warm.config?.voucherEnabled).toBe(false);

    const withVoucher = await upsertPlan(adminId, {
      code: fleet.planCode,
      name: "Plan next",
      description: "Voucher back on",
      priceTzs: 9_000n,
      periodDays: 30,
      trialEligible: true,
      trialDays: 30,
      lifecycle: "PUBLISHED",
      visibility: "PUBLIC",
      commercialPromise: "standard",
      features: brandControlFeatures(),
      isDemo: true,
    });
    const migration = await schedulePlanMigration(adminId, {
      planId: withVoucher.id,
      scope: "SELECTED",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [fleet.resellerId],
      note: "Voucher restored",
    });
    await applyPlanMigration(migration.id, new Date(), adminId);

    const after = await portalBootstrap(fleet.slug);
    expect(after.config?.voucherEnabled).toBe(true);
    expect(after.config?.configRevision).not.toBe(warm.config?.configRevision);
  });

  /* ── Section 6: limits are reported and never enforced destructively ──── */

  it("keeps over-limit sites after a downgrade and only blocks adding new ones", async () => {
    const fleet = await newFleet(
      planFeaturesWithDefaults({ ...sponsoredFeatures(), limits: { sites: 2, devices: null, wifi_packages_per_site: null } }),
    );

    // The second site fits the plan; the third does not.
    await createSite(fleet.resellerId, fleet.ownerUserId, { name: "Second", timezone: "Africa/Dar_es_Salaam" });
    await expect(
      createSite(fleet.resellerId, fleet.ownerUserId, { name: "Third", timezone: "Africa/Dar_es_Salaam" }),
    ).rejects.toBeTruthy();

    // Downgrade onto a one-site plan: nothing is deleted, the tenant is flagged.
    const tiny = await makePlan(
      planFeaturesWithDefaults({ ...adFreeFeatures(), limits: { sites: 1, devices: null, wifi_packages_per_site: null } }),
      { promise: "ad_free" },
    );
    const migration = await schedulePlanMigration(adminId, {
      planId: tiny.id,
      scope: "SELECTED",
      effectiveAt: new Date(Date.now() - 1000),
      resellerIds: [fleet.resellerId],
      note: "Shrink sites",
    });
    await applyPlanMigration(migration.id, new Date(), adminId);

    expect(await prisma.site.count({ where: { resellerId: fleet.resellerId, archivedAt: null } })).toBe(2);
    const ent = await resolveResellerEntitlements(fleet.resellerId);
    expect(ent.overLimit).toContain("limits.sites");
    expect(ent.usage.sites).toBe(2);
    // Existing sites still sell, but no new one can be added.
    expect((await portalBootstrap(fleet.slug)).packages.length).toBeGreaterThan(0);
    await expect(
      createSite(fleet.resellerId, fleet.ownerUserId, { name: "Fourth", timezone: "Africa/Dar_es_Salaam" }),
    ).rejects.toBeTruthy();
  });

  /* ── The starter presets are usable as published plans ────────────────── */

  it("accepts every starter preset as a publishable plan", async () => {
    for (const preset of PLAN_PRESETS) {
      const plan = await makePlan(preset.features, { name: preset.name, promise: preset.commercialPromise });
      expect(plan.lifecycle).toBe("PUBLISHED");
    }
  });
});
