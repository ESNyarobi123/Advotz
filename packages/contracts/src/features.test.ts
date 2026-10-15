import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_FEATURES,
  PACKAGE_CARD_STYLES,
  PACKAGE_LAYOUTS,
  PLAN_PRESETS,
  canHideAllSponsored,
  normalizePlacement,
  planFeaturesWithDefaults,
  planPreset,
  placementOf,
  resolveAllVisibility,
  resolveVisibility,
  renderPlacement,
  setPlacement,
  sitePortalPreferenceInputSchema,
  sitePortalPreferenceWithDefaults,
  validatePlanFeatures,
} from "./features.js";

/** The three presets from the spec, read back through the resolver. */
const sponsored = planPreset("sponsored")!;
const brandControl = planPreset("brand-control")!;
const adFree = planPreset("ad-free")!;

describe("resolveVisibility", () => {
  it("forces REQUIRED visible and uneditable, whatever the reseller stored", () => {
    expect(resolveVisibility("REQUIRED", false, true)).toEqual({ mode: "REQUIRED", visible: true, canEdit: false, lock: "REQUIRED" });
    expect(resolveVisibility("REQUIRED", undefined, true).visible).toBe(true);
  });

  it("forces DISABLED hidden and uneditable", () => {
    expect(resolveVisibility("DISABLED", true, false)).toEqual({ mode: "DISABLED", visible: false, canEdit: false, lock: "DISABLED" });
  });

  it("honours an explicit OPTIONAL preference of false instead of widening it to the default", () => {
    expect(resolveVisibility("OPTIONAL", false, true)).toEqual({ mode: "OPTIONAL", visible: false, canEdit: true, lock: null });
  });

  it("falls back to the optional default only when the reseller has not chosen", () => {
    expect(resolveVisibility("OPTIONAL", undefined, true).visible).toBe(true);
    expect(resolveVisibility("OPTIONAL", undefined, false).visible).toBe(false);
    expect(resolveVisibility("OPTIONAL", true, false).visible).toBe(true);
  });
});

describe("plan features", () => {
  it("fills a complete feature set from nothing", () => {
    expect(planFeaturesWithDefaults({})).toEqual(DEFAULT_PLAN_FEATURES);
    expect(planFeaturesWithDefaults(null)).toEqual(DEFAULT_PLAN_FEATURES);
  });

  it("repairs a stored REQUIRED placement whose default was written as off", () => {
    const features = planFeaturesWithDefaults({
      ads: { banner: { mode: "REQUIRED", default_visible: false } },
    });
    expect(features.ads.banner).toEqual({ mode: "REQUIRED", default_visible: true });
    expect(normalizePlacement({ mode: "DISABLED", default_visible: true })).toEqual({ mode: "DISABLED", default_visible: false });
  });

  it("replaces one placement without disturbing the others", () => {
    const next = setPlacement(brandControl.features, "ads.banner", { mode: "DISABLED" });
    expect(placementOf(next, "ads.banner").mode).toBe("DISABLED");
    expect(placementOf(next, "ads.explore").mode).toBe("OPTIONAL");
  });
});

describe("validatePlanFeatures", () => {
  it("rejects an unknown feature key rather than silently dropping it", () => {
    const issues = validatePlanFeatures({ ads: { banner: { mode: "REQUIRED" } }, made_up_key: true });
    expect(issues.some((issue) => issue.key === "made_up_key")).toBe(true);
  });

  it("rejects a default card style outside the allowlist", () => {
    const issues = validatePlanFeatures({ package_cards: { allowed_styles: ["classic"], default_style: "soft" } });
    expect(issues.some((issue) => issue.key === "package_cards.default_style")).toBe(true);
  });

  it("rejects an Ad Free plan that still has a sponsored placement enabled", () => {
    const issues = validatePlanFeatures(brandControl.features, { commercialPromise: "ad_free" });
    expect(issues.some((issue) => issue.key === "ads.banner")).toBe(true);
    expect(issues.some((issue) => issue.key === "ads.explore")).toBe(true);
    expect(issues.some((issue) => issue.key === "discovery.jobs")).toBe(true);
  });

  it("accepts every starter preset as published", () => {
    for (const preset of PLAN_PRESETS) {
      expect(validatePlanFeatures(preset.features, { commercialPromise: preset.commercialPromise })).toEqual([]);
    }
  });
});

describe("starter presets", () => {
  it("keeps Sponsored compulsory and minimal on appearance", () => {
    expect(sponsored.commercialPromise).toBe("standard");
    expect(placementOf(sponsored.features, "ads.banner").mode).toBe("REQUIRED");
    expect(placementOf(sponsored.features, "ads.explore").mode).toBe("REQUIRED");
    expect(sponsored.features.package_cards.allowed_styles).toEqual(["classic", "compact"]);
    expect(sponsored.features.packages.order_edit).toBe(false);
    expect(canHideAllSponsored(sponsored.features)).toBe(false);
  });

  it("gives Brand Control every style and every layout, plus reordering and hideable placements", () => {
    expect(brandControl.features.package_cards.allowed_styles).toEqual([...PACKAGE_CARD_STYLES]);
    expect(brandControl.features.package_cards.allowed_layouts).toEqual([...PACKAGE_LAYOUTS]);
    expect(brandControl.features.package_cards.default_layout).toBe("list");
    expect(brandControl.features.packages.order_edit).toBe(true);
    expect(canHideAllSponsored(brandControl.features)).toBe(true);
  });

  it("keeps a plan's default layout inside the layouts it allows", () => {
    for (const preset of PLAN_PRESETS) {
      const { allowed_layouts, default_layout } = preset.features.package_cards;
      expect(allowed_layouts).toContain(default_layout);
    }
  });

  it("makes Ad Free genuinely free of sponsored placements", () => {
    expect(adFree.commercialPromise).toBe("ad_free");
    expect(placementOf(adFree.features, "ads.banner")).toEqual({ mode: "DISABLED", default_visible: false });
    expect(placementOf(adFree.features, "discovery.jobs")).toEqual({ mode: "DISABLED", default_visible: false });
    expect(canHideAllSponsored(adFree.features)).toBe(true);
  });

  it("does not treat removing ads as removing platform attribution", () => {
    for (const preset of PLAN_PRESETS) {
      expect(preset.features.branding.platform_badge_removable).toBe(false);
    }
  });
});

describe("effective visibility", () => {
  it("turns a Sponsored reseller's stored false back into visible and locked", () => {
    const resolved = resolveAllVisibility(sponsored.features, { banner: false, explore: false, jobs: true });
    expect(resolved["ads.banner"]).toMatchObject({ visible: true, canEdit: false, lock: "REQUIRED" });
    expect(resolved["ads.explore"]).toMatchObject({ visible: true, canEdit: false });
    // Jobs is OPTIONAL in Sponsored, so the reseller's choice still applies.
    expect(resolved["discovery.jobs"]).toMatchObject({ visible: true, canEdit: true });
  });

  it("lets a Brand Control reseller hide banner and Explore independently", () => {
    const resolved = resolveAllVisibility(brandControl.features, { banner: false });
    expect(resolved["ads.banner"]).toMatchObject({ visible: false, canEdit: true });
    expect(resolved["ads.explore"]).toMatchObject({ visible: true, canEdit: true });
  });

  it("collapses a REQUIRED placement when no campaign is eligible instead of showing an empty card", () => {
    expect(renderPlacement(true, 0)).toBe(false);
    expect(renderPlacement(true, 2)).toBe(true);
    expect(renderPlacement(false, 2)).toBe(false);
  });
});

describe("reseller preferences", () => {
  it("parses an empty stored object into a clean slate, keeping false distinct from absent", () => {
    const preferences = sitePortalPreferenceWithDefaults({ visibility: { banner: false } });
    expect(preferences.visibility).toEqual({ banner: false });
    expect(preferences.branding).toEqual({});
    expect(preferences.package_order).toEqual([]);
  });

  it("falls back to the clean slate for malformed stored JSON", () => {
    expect(sitePortalPreferenceWithDefaults("nonsense").visibility).toEqual({});
  });
});

/**
 * The designer sends an emptied input as `""`, and it needs that to mean "clear
 * this" rather than "invalid". Getting this wrong rejected the *whole* patch, so
 * a reseller with no logo, no background image and no custom background colour
 * could not save any design change at all — with three impossible-to-act-on
 * errors naming fields they had never filled in.
 */
describe("branding clear sentinel", () => {
  const parseBranding = (branding: unknown) => sitePortalPreferenceInputSchema.safeParse({ branding });

  it("accepts an empty string as 'clear' for the three clearable fields", () => {
    const result = parseBranding({ background_color: "", logo_url: "", background_url: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.branding).toEqual({ background_color: "", logo_url: "", background_url: "" });
  });

  it("accepts real values alongside a cleared one", () => {
    const result = parseBranding({ primary_color: "#12406f", logo_url: "https://cdn.advo.test/logo.png", background_url: "" });
    expect(result.success).toBe(true);
  });

  it("treats a whitespace-only value as cleared, not as an invalid colour or URL", () => {
    const result = parseBranding({ background_color: "   ", logo_url: "  ", background_url: "\t" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.branding).toMatchObject({ background_color: "", logo_url: "", background_url: "" });
  });

  it("still rejects a value that is neither empty nor valid", () => {
    const bad = parseBranding({ background_color: "not-a-colour", logo_url: "not-a-url" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const paths = bad.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("branding.background_color");
      expect(paths).toContain("branding.logo_url");
    }
  });

  it("keeps the primary and accent colours non-clearable, since they always have a value", () => {
    expect(parseBranding({ primary_color: "" }).success).toBe(false);
    expect(parseBranding({ accent_color: "" }).success).toBe(false);
  });
});
