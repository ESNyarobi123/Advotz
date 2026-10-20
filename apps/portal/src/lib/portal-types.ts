import type {
  DeliveredAdCampaign,
  EffectivePortalConfig,
  PortalAdvert,
  PortalBusiness,
  PortalContent,
  PortalTheme,
  PromotionPackage,
} from "@advo/contracts";
import type { PortalCardLayout, PortalCardStyle } from "@advo/ui";

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
  /**
   * The plan-resolved card look, stamped server-side. The guest never picks it
   * and it never changes billing, only the visual treatment of the card.
   */
  cardStyle: PortalCardStyle;
};

export type PortalListingKind = "JOB" | "OPPORTUNITY" | "LOCAL_EVENT" | "HOLIDAY";

export type PortalListing = {
  id: string;
  kind: PortalListingKind;
  title: string;
  organization: string;
  location: string;
  employmentType: string;
  summary: string;
  description: string;
  venue?: string;
  region?: string;
  link?: string;
  contactPhone?: string;
  priceLabel?: string;
  /** ISO timestamps; null when the source did not give a date. */
  startsAt?: string | null;
  endsAt?: string | null;
};

export type PortalSite = {
  slug: string;
  name: string;
  title: string;
  message: string | null;
  business: string;
  /** Resolved brand logo, or `null` when the plan has no logo upload or none is set. */
  logoUrl: string | null;
  /** Resolved background photo, or `null` when the plan has no upload or none is set. */
  backgroundUrl?: string | null;
  theme?: PortalTheme;
  content?: PortalContent;
  defaultLocale?: "en" | "sw";
};

export type PortalBootstrap = {
  site: PortalSite;
  available: boolean;
  packages: PortalPackage[];
  /**
   * Effective, policy-resolved configuration. `null` means the reseller has no
   * usable plan, so every gated surface falls back to its catalog default.
   */
  config: EffectivePortalConfig | null;
  /** Plan default card style, used when a package arrives without one. */
  packageCardStyle: PortalCardStyle;
  /** Plan-resolved arrangement for the package cards. */
  packageCardLayout?: PortalCardLayout;
  listings: PortalListing[];
  /**
   * Campaigns already filtered for this site and the banner placement. Empty
   * means the placement collapses — it is never rendered as an empty card.
   */
  campaigns: DeliveredAdCampaign[];
  /** Whether the `discovery.promote_business` placement is visible here. */
  promotionsAvailable: boolean;
  promotionPackages: PromotionPackage[];
};

/** Starved bootstrap used by pages that only need the theme/site chrome. */
export type PortalExtras = {
  business: string;
  title: string;
  theme?: PortalTheme;
  backgroundUrl?: string | null;
  content?: PortalContent;
  listings: PortalListing[];
  promotionPackages: PromotionPackage[];
};

export type { DeliveredAdCampaign, EffectivePortalConfig, PortalAdvert, PortalBusiness, PortalCardLayout, PortalCardStyle, PortalContent, PortalTheme, PromotionPackage };
