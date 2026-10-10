import { z } from "zod";
import { commercialPromiseSchema, packageCardStyleSchema } from "./features.js";

/**
 * The public pricing catalog.
 *
 * The marketing site is pre-signup, so this contract is deliberately separate
 * from the reseller/admin plan views: it carries only what a price list may
 * advertise — price, term, capacity, trial and the capability flags a card
 * names. It never carries subscription counts, revenue, reseller identities or
 * the raw entitlement JSON.
 *
 * Facts, not prose: the site is bilingual, so the API returns structured values
 * and the page picks the wording through its translator. That also means a new
 * language needs no API change.
 */

export const ADVERTISING_LEVELS = ["none", "optional", "required"] as const;
export type AdvertisingLevel = (typeof ADVERTISING_LEVELS)[number];
export const advertisingLevelSchema = z.enum(ADVERTISING_LEVELS);

/** `null` means unlimited on every capacity, never "none allowed". */
export const publicPlanCapacitySchema = z.object({
  sites: z.number().int().nullable(),
  devices: z.number().int().nullable(),
  packagesPerSite: z.number().int().nullable(),
});

export const publicPlanFlagsSchema = z.object({
  logoUpload: z.boolean(),
  colorsEdit: z.boolean(),
  badgeRemovable: z.boolean(),
  voucher: z.boolean(),
  orderEdit: z.boolean(),
  cardStyles: z.array(packageCardStyleSchema),
  defaultCardStyle: packageCardStyleSchema,
});

export const publicPlanSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  /** Money crosses the wire as a decimal string; `BigInt` has no JSON literal. */
  priceTzs: z.string(),
  periodDays: z.number().int(),
  /** Trial length in days, or `null` when the plan carries no trial. */
  trialDays: z.number().int().nullable(),
  isDemo: z.boolean(),
  commercialPromise: commercialPromiseSchema,
  capacity: publicPlanCapacitySchema,
  advertising: advertisingLevelSchema,
  flags: publicPlanFlagsSchema,
});

export type PublicPlanCapacity = z.infer<typeof publicPlanCapacitySchema>;
export type PublicPlanFlags = z.infer<typeof publicPlanFlagsSchema>;
export type PublicPlan = z.infer<typeof publicPlanSchema>;

/** The response body of `GET /api/v1/marketing/plans`. */
export const publicPlanListSchema = z.array(publicPlanSchema);
