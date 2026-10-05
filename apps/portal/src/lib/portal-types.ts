import type { PortalAdvert, PortalBusiness, PortalContent, PortalTheme, PromotionPackage } from "@advo/contracts";

/**
 * Shared guest-portal shapes.
 *
 * These live outside `PortalHome` so the staged components can import them
 * without a circular dependency back through the page shell.
 */

export type PortalPackage = {
  packageId: string;
  name: string;
  priceTzs: string;
  durationSeconds: number;
  downloadKbps: number | null;
  uploadKbps: number | null;
  quotaType: string;
  quotaBytes: string | null;
  maxDevices: number;
};

export type PortalListingKind = "JOB" | "OPPORTUNITY";

export type PortalListing = {
  id: string;
  kind: PortalListingKind;
  title: string;
  organization: string;
  location: string;
  employmentType: string;
  summary: string;
  description: string;
};

export type PortalSite = {
  slug: string;
  name: string;
  title: string;
  message: string | null;
  business: string;
  theme?: PortalTheme;
  content?: PortalContent;
};

export type PortalBootstrap = {
  site: PortalSite;
  available: boolean;
  packages: PortalPackage[];
  listings: PortalListing[];
  promotionPackages: PromotionPackage[];
};

/** Starved bootstrap used by pages that only need the theme/site chrome. */
export type PortalExtras = {
  business: string;
  title: string;
  theme?: PortalTheme;
  content?: PortalContent;
  listings: PortalListing[];
  promotionPackages: PromotionPackage[];
};

export type { PortalAdvert, PortalBusiness, PortalContent, PortalTheme, PromotionPackage };
