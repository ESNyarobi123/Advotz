import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTAL_CONTENT,
  PROMOTION_PACKAGES,
  platformListingInputSchema,
  portalContentWithDefaults,
  promotionRequestInputSchema,
  registerResellerSchema,
} from "../src/index.js";

describe("registerResellerSchema", () => {
  it("accepts valid Tanzania phone and optional referral", () => {
    const parsed = registerResellerSchema.parse({
      businessName: "Cafe A",
      ownerName: "Asha",
      email: "asha@example.com",
      phone: "+255712345678",
      password: "SecurePass1",
      acceptTerms: true,
      referralCode: "AGENT01",
    });
    expect(parsed.email).toBe("asha@example.com");
  });

  it("rejects non-TZS-market phone formats", () => {
    expect(() =>
      registerResellerSchema.parse({
        businessName: "Cafe A",
        ownerName: "Asha",
        email: "asha@example.com",
        phone: "0712345678",
        password: "SecurePass1",
        acceptTerms: true,
      }),
    ).toThrow();
  });
});

describe("portal content", () => {
  it("falls back to complete defaults for empty or malformed stored JSON", () => {
    expect(portalContentWithDefaults(null)).toEqual(DEFAULT_PORTAL_CONTENT);
    expect(portalContentWithDefaults("nonsense").adverts).toEqual([]);
  });

  it("keeps valid advert and business lists", () => {
    const parsed = portalContentWithDefaults({
      advertCount: 2,
      advertIntervalMs: 6000,
      adverts: [{ title: "Advertise here", copy: "Reach local customers", color: "#117dcc" }],
      businesses: [{ id: "b1", name: "Kimara Cafe", category: "Food", glyph: "☕", color: "#df9e56" }],
    });
    expect(parsed.adverts).toHaveLength(1);
    expect(parsed.businesses[0]?.name).toBe("Kimara Cafe");
    expect(parsed.advertIntervalMs).toBe(6000);
  });

  it("drops a bad advert list back to the safe default instead of rendering broken slides", () => {
    const bad = portalContentWithDefaults({ adverts: [{ title: "x", color: "blue" }] });
    expect(bad.adverts).toEqual([]);
  });
});

describe("promotion and listing inputs", () => {
  it("numbers every promotion package and keeps codes unique", () => {
    const codes = PROMOTION_PACKAGES.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(PROMOTION_PACKAGES.every((p) => p.priceTzs > 0 && p.durationLabel.length > 0)).toBe(true);
  });

  it("accepts a promotion request without an email", () => {
    const parsed = promotionRequestInputSchema.parse({
      packageCode: "1W",
      fullName: "Neema Mushi",
      mobile: "+255712345678",
      business: "Kimara Salon",
      location: "Kimara Mwisho",
      description: "Hair and beauty",
      offer: "Student discounts",
    });
    expect(parsed.email).toBeUndefined();
  });

  it("defaults a listing's optional fields", () => {
    const parsed = platformListingInputSchema.parse({ kind: "JOB", title: "Shop Assistant" });
    expect(parsed).toMatchObject({ organization: "", location: "", employmentType: "", summary: "", description: "", sortOrder: 0, active: true });
  });
});

describe("portal preview appearance schema", () => {
  it("accepts visibility preferences in draft appearance", async () => {
    const { portalPreviewAppearanceSchema } = await import("../src/portal-preview.js");
    const parsed = portalPreviewAppearanceSchema.parse({
      visibility: {
        banner: false,
        explore: true,
        promote_business: false,
        platform_link: true,
        jobs: false,
      },
      cardStyle: "compact",
      showPlatformBadge: false,
      defaultLocale: "sw",
    });
    expect(parsed.visibility?.banner).toBe(false);
    expect(parsed.visibility?.explore).toBe(true);
    expect(parsed.visibility?.jobs).toBe(false);
    expect(parsed.defaultLocale).toBe("sw");
  });
});
