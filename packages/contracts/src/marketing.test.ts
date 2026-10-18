import { describe, expect, it } from "vitest";
import { publicHotspotListSchema, publicHotspotSchema, publicPlanListSchema, publicPlanSchema } from "./marketing.js";

/** A plan exactly as `GET /api/v1/marketing/plans` returns one. */
const PLAN = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "brand-control",
  name: "Brand Control",
  description: "Full branding and optional advertising.",
  priceTzs: "25000",
  periodDays: 30,
  trialDays: 7,
  isDemo: true,
  commercialPromise: "standard",
  capacity: { sites: 3, devices: 6, packagesPerSite: 5 },
  advertising: "optional",
  flags: {
    logoUpload: true,
    colorsEdit: true,
    badgeRemovable: false,
    voucher: true,
    orderEdit: true,
    cardStyles: ["classic", "compact", "soft", "outlined"],
    defaultCardStyle: "classic",
  },
} as const;

describe("public plan contract", () => {
  it("accepts a plan as the API serialises it", () => {
    expect(publicPlanSchema.parse(PLAN)).toEqual(PLAN);
  });

  it("keeps money a decimal string so a big price cannot lose precision", () => {
    // `BigInt` has no JSON literal, and a JS number truncates past 2^53 — the
    // wire format is a string on purpose, not by accident.
    expect(publicPlanSchema.parse({ ...PLAN, priceTzs: "10000" }).priceTzs).toBe("10000");
    expect(publicPlanSchema.safeParse({ ...PLAN, priceTzs: 25000 }).success).toBe(false);
  });

  it("reads a null capacity as unlimited rather than rejecting it", () => {
    const unlimited = publicPlanSchema.parse({
      ...PLAN,
      capacity: { sites: null, devices: null, packagesPerSite: null },
    });
    expect(unlimited.capacity).toEqual({
      sites: null,
      devices: null,
      packagesPerSite: null,
    });
  });

  it("distinguishes a plan with no trial from one whose trial is zero days", () => {
    expect(publicPlanSchema.parse({ ...PLAN, trialDays: null }).trialDays).toBeNull();
    expect(publicPlanSchema.parse({ ...PLAN, trialDays: 0 }).trialDays).toBe(0);
  });

  it("rejects an advertising level the portal cannot enforce", () => {
    expect(publicPlanSchema.safeParse({ ...PLAN, advertising: "sometimes" }).success).toBe(false);
  });

  it("validates the list response", () => {
    expect(publicPlanListSchema.parse([PLAN, { ...PLAN, id: "22222222-2222-4222-8222-222222222222" }])).toHaveLength(2);
    expect(publicPlanListSchema.safeParse([{ ...PLAN, code: undefined }]).success).toBe(false);
  });
});

describe("public hotspot catalog", () => {
  const HOTSPOT = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Palm Beach Lounge",
    address: "Samora Avenue",
    city: "Dar es Salaam",
    region: "Dar es Salaam",
    latitude: -6.8161,
    longitude: 39.2803,
    category: "Cafe",
    description: "Guest WiFi",
    imageUrl: null,
    portalSlug: null,
  };

  it("accepts a plotted hotspot", () => {
    expect(publicHotspotSchema.parse(HOTSPOT).name).toBe("Palm Beach Lounge");
  });

  it("rejects a hotspot without coordinates", () => {
    expect(publicHotspotSchema.safeParse({ ...HOTSPOT, latitude: undefined }).success).toBe(false);
  });

  it("validates the list response", () => {
    expect(publicHotspotListSchema.parse([HOTSPOT])).toHaveLength(1);
  });
});
