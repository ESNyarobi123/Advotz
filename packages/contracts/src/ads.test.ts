import { describe, expect, it } from "vitest";
import { adCampaignInputSchema, eligibleCampaigns, isCampaignEligible, type AdCampaignInput } from "./ads.js";

const RESELLER_A = "11111111-1111-4111-8111-111111111111";
const RESELLER_B = "22222222-2222-4222-8222-222222222222";
const SITE_A = "33333333-3333-4333-8333-333333333333";

const audience = { resellerId: RESELLER_A, siteId: SITE_A };

function campaign(overrides: Partial<AdCampaignInput> = {}) {
  return {
    ...adCampaignInputSchema.parse({
      name: "Ubungo Café",
      status: "ACTIVE",
      placements: ["ads.banner"],
      creative: { business: "Ubungo Fresh Café", title: "A small break." },
    }),
    ...overrides,
  };
}

describe("campaign eligibility", () => {
  it("serves an active campaign on a matching placement", () => {
    expect(isCampaignEligible(campaign(), "ads.banner", audience)).toBe(true);
  });

  it("never serves a draft, paused or ended campaign", () => {
    for (const status of ["DRAFT", "PAUSED", "ENDED"] as const) {
      expect(isCampaignEligible(campaign({ status }), "ads.banner", audience)).toBe(false);
    }
  });

  it("keeps a banner-only campaign out of Explore", () => {
    expect(isCampaignEligible(campaign(), "ads.explore", audience)).toBe(false);
  });

  it("respects the schedule, half-open on entry and inclusive on exit", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    expect(isCampaignEligible(campaign({ startsAt: new Date("2026-10-06T00:00:00Z") }), "ads.banner", audience, now)).toBe(false);
    expect(isCampaignEligible(campaign({ endsAt: new Date("2026-10-04T00:00:00Z") }), "ads.banner", audience, now)).toBe(false);
    expect(isCampaignEligible(campaign({ startsAt: now, endsAt: now }), "ads.banner", audience, now)).toBe(true);
  });

  it("treats empty targeting as everyone", () => {
    expect(isCampaignEligible(campaign(), "ads.banner", audience)).toBe(true);
  });

  it("hides a campaign whose audience names another reseller", () => {
    const targeted = campaign({ targeting: { resellerIds: [RESELLER_B], siteIds: [] } });
    expect(isCampaignEligible(targeted, "ads.banner", audience)).toBe(false);
    expect(isCampaignEligible(targeted, "ads.banner", { resellerId: RESELLER_B, siteId: "other-site" })).toBe(true);
  });

  it("hides a campaign whose audience names another site", () => {
    const targeted = campaign({ targeting: { resellerIds: [], siteIds: ["44444444-4444-4444-8444-444444444444"] } });
    expect(isCampaignEligible(targeted, "ads.banner", audience)).toBe(false);
  });
});

describe("eligibleCampaigns", () => {
  it("returns only what this portal may show, so an empty list collapses the placement", () => {
    const list = [
      campaign({ placements: ["ads.banner"] }),
      campaign({ placements: ["ads.explore"] }),
      campaign({ status: "PAUSED", placements: ["ads.banner"] }),
      campaign({ placements: ["ads.banner"], targeting: { resellerIds: [RESELLER_B], siteIds: [] } }),
    ];
    expect(eligibleCampaigns(list, "ads.banner", audience)).toHaveLength(1);
    expect(eligibleCampaigns(list, "ads.explore", audience)).toHaveLength(1);
    expect(eligibleCampaigns(list, "discovery.jobs", audience)).toHaveLength(0);
  });
});

describe("adCampaignInputSchema", () => {
  it("rejects a campaign with no placement, because it could never be served", () => {
    expect(() =>
      adCampaignInputSchema.parse({ name: "Empty", placements: [], creative: { business: "B", title: "T" } }),
    ).toThrow();
  });

  it("rejects an end date before the start", () => {
    expect(() =>
      adCampaignInputSchema.parse({
        name: "Backwards",
        placements: ["ads.banner"],
        creative: { business: "B", title: "T" },
        startsAt: "2026-10-10",
        endsAt: "2026-10-01",
      }),
    ).toThrow();
  });

  it("defaults the creative's optional fields instead of leaving them undefined", () => {
    const parsed = adCampaignInputSchema.parse({ name: "Café", placements: ["ads.banner"], creative: { business: "B", title: "T" } });
    expect(parsed.creative).toMatchObject({ description: "", cta: "Learn more", theme: "cafe" });
    expect(parsed.targeting).toEqual({ resellerIds: [], siteIds: [] });
    expect(parsed.startsAt).toBeNull();
  });
});
