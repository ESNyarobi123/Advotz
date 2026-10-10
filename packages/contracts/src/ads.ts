import { z } from "zod";
import { visibilityKeySchema, type VisibilityKey } from "./features.js";

/**
 * Advertising campaigns.
 *
 * A campaign is authored by Admin and matched to a placement at request time.
 * The portal never decides eligibility for itself: it asks for the campaigns
 * that are *eligible* for this site and placement, and renders nothing when the
 * answer is empty. That is what lets a `REQUIRED` placement collapse honestly
 * instead of showing an empty card.
 */

/** The three reviewed creative looks. Kept in step with `AdTheme` in `@advo/ui`. */
export const AD_THEMES = ["cafe", "tech", "style"] as const;
export type AdTheme = (typeof AD_THEMES)[number];
export const adThemeSchema = z.enum(AD_THEMES);

export const AD_CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ENDED"] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];
export const adCampaignStatusSchema = z.enum(AD_CAMPAIGN_STATUSES);

const uuidStringSchema = z.string().uuid();

/**
 * The creative itself.
 *
 * Only reviewed fields — the portal composes the layout, so a campaign can
 * never inject markup or arbitrary styling into the guest page.
 */
export const adCreativeSchema = z
  .object({
    /** The sponsoring business, shown as the credit line. */
    business: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(240).default(""),
    /** Call-to-action label; the destination stays platform-controlled for now. */
    cta: z.string().trim().max(60).default("Learn more"),
    theme: adThemeSchema.default("cafe"),
    /** Optional reviewed image; the illustrated artwork is used when absent. */
    imageUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
    /** Optional contact phone or WhatsApp number. */
    phone: z.string().trim().max(40).optional(),
    /** Optional target website or promo link. */
    url: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
  })
  .strict();

export type AdCreative = z.infer<typeof adCreativeSchema>;

/**
 * Who a campaign may be served to.
 *
 * Empty lists mean everyone — the natural default for a platform-wide campaign.
 * A campaign that names other resellers must not leak into this portal, which is
 * the acceptance case "campaign is active but its audience is another reseller".
 */
export const adTargetingSchema = z
  .object({
    resellerIds: z.array(uuidStringSchema).max(500).default([]),
    siteIds: z.array(uuidStringSchema).max(2000).default([]),
  })
  .strict();

export type AdTargeting = z.infer<typeof adTargetingSchema>;

export const adCampaignInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    status: adCampaignStatusSchema.default("DRAFT"),
    /** The placements this campaign may be served for; at least one. */
    placements: z.array(visibilityKeySchema).min(1).max(5),
    creative: adCreativeSchema,
    targeting: adTargetingSchema.default({ resellerIds: [], siteIds: [] }),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
  })
  .strict()
  .refine((value) => !value.startsAt || !value.endsAt || value.startsAt <= value.endsAt, {
    message: "The campaign cannot end before it starts",
    path: ["endsAt"],
  });

export type AdCampaignInput = z.infer<typeof adCampaignInputSchema>;

/** One campaign as delivered to a portal, already filtered for the placement. */
export type DeliveredAdCampaign = {
  id: string;
  placement: VisibilityKey;
  creative: AdCreative;
};

/** One campaign as the admin screens read it back. */
export type AdCampaignView = {
  id: string;
  name: string;
  status: AdCampaignStatus;
  placements: string[];
  creative: AdCreative;
  targeting: AdTargeting;
  startsAt: string | null;
  endsAt: string | null;
};

/**
 * Whether a campaign is eligible for a placement at an instant.
 *
 * Dates are half-open on the way in and inclusive on the way out: a campaign
 * that starts this second is live, and one whose end has passed is not.
 */
export function isCampaignEligible(
  campaign: { status: string; placements: string[]; targeting: AdTargeting; startsAt?: Date | null; endsAt?: Date | null },
  placement: string,
  audience: { resellerId: string; siteId: string },
  now: Date = new Date(),
): boolean {
  if (campaign.status !== "ACTIVE") return false;
  if (!campaign.placements.includes(placement)) return false;
  if (campaign.startsAt && campaign.startsAt > now) return false;
  if (campaign.endsAt && campaign.endsAt < now) return false;

  const { resellerIds, siteIds } = campaign.targeting;
  const targetsReseller = resellerIds.length === 0 || resellerIds.includes(audience.resellerId);
  const targetsSite = siteIds.length === 0 || siteIds.includes(audience.siteId);
  // A campaign naming a specific audience must match on both axes it names.
  if (resellerIds.length > 0 && !targetsReseller) return false;
  if (siteIds.length > 0 && !targetsSite) return false;
  return true;
}

/** Filters a campaign list down to the ones this site may actually be served. */
export function eligibleCampaigns<T extends { status: string; placements: string[]; targeting: AdTargeting; startsAt?: Date | null; endsAt?: Date | null }>(
  campaigns: readonly T[],
  placement: string,
  audience: { resellerId: string; siteId: string },
  now: Date = new Date(),
): T[] {
  return campaigns.filter((campaign) => isCampaignEligible(campaign, placement, audience, now));
}
