import { z } from "zod";
import { commercialPromiseSchema, planLifecycleSchema, planVisibilitySchema } from "./features.js";

export * from "./features.js";
export * from "./ads.js";
export * from "./marketing.js";
export * from "./portal-preview.js";

export const UserRole = {
  ADMIN: "ADMIN",
  RESELLER: "RESELLER",
  AGENT: "AGENT",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ResellerStatus = {
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
} as const;
export type ResellerStatus =
  (typeof ResellerStatus)[keyof typeof ResellerStatus];

export const AgentStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export const OnboardingStep = {
  PROFILE: "PROFILE",
  PLAN: "PLAN",
  SITE: "SITE",
  DEVICE: "DEVICE",
  COMPLETE: "COMPLETE",
} as const;
export type OnboardingStep =
  (typeof OnboardingStep)[keyof typeof OnboardingStep];

export const AttributionSource = {
  SELF_REFERRAL_CODE: "SELF_REFERRAL_CODE",
  AGENT_INVITATION: "AGENT_INVITATION",
  ADMIN_CORRECTION: "ADMIN_CORRECTION",
} as const;
export type AttributionSource =
  (typeof AttributionSource)[keyof typeof AttributionSource];

export const LeadStatus = {
  INVITED: "INVITED",
  ACCEPTED: "ACCEPTED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  TENANT_ACCESS_DENIED: "TENANT_ACCESS_DENIED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  CONTROLLER_UNAVAILABLE: "CONTROLLER_UNAVAILABLE",
  CAPABILITY_UNSUPPORTED: "CAPABILITY_UNSUPPORTED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH",
  ACTIVATION_PENDING: "ACTIVATION_PENDING",
  DEVICE_LIMIT_REACHED: "DEVICE_LIMIT_REACHED",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  PAYOUT_NEEDS_REVIEW: "PAYOUT_NEEDS_REVIEW",
  MFA_REQUIRED: "MFA_REQUIRED",
  /** The plan does not include the requested capability; the request is refused, nothing is deleted. */
  FEATURE_LOCKED_BY_PLAN: "FEATURE_LOCKED_BY_PLAN",
  /** The placement is hidden by policy at this site, so there is nothing to render. */
  PLACEMENT_HIDDEN: "PLACEMENT_HIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Tanzanian mobile, normalised to E.164 (`+255…`).
 *
 * Declared up here rather than beside the other primitives because the account
 * creation schemas below reference it while the module is still evaluating.
 */
export const tzPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .transform((v) => (v.startsWith("0") && v.length === 10 ? `+255${v.slice(1)}` : v))
  .transform((v) => (v.startsWith("255") ? `+${v}` : v))
  .pipe(z.string().regex(/^\+255[678][0-9]{8}$/, "Enter a Tanzanian mobile number, e.g. 0712 345 678"));

export const registerResellerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^\+255[0-9]{9}$/, "Phone must be +255 followed by 9 digits"),
  password: z.string().min(10).max(128),
  referralCode: z.string().trim().min(4).max(32).optional(),
  acceptTerms: z.literal(true),
});
export type RegisterResellerInput = z.infer<typeof registerResellerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(128),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyContactSchema = z.object({
  token: z.string().min(16).max(256),
});
export type VerifyContactInput = z.infer<typeof verifyContactSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(10).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const createInvitationSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: tzPhoneSchema,
  consentConfirmed: z.literal(true),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(16).max(256),
  ownerName: z.string().trim().min(2).max(120),
  password: z.string().min(10).max(128),
  acceptTerms: z.literal(true),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const createAgentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: tzPhoneSchema,
  password: z.string().min(10).max(128),
  referralCode: z
    .string()
    .trim()
    .min(4)
    .max(24)
    .regex(/^[A-Z0-9_-]+$/i),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const registerAgentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: tzPhoneSchema,
  password: z.string().min(10).max(128),
  referralCode: z
    .string()
    .trim()
    .min(4)
    .max(24)
    .regex(/^[A-Z0-9_-]+$/i)
    .optional(),
  acceptTerms: z.literal(true),
});
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

/**
 * Marks a session as an Admin acting as another user.
 *
 * Present on `SessionUser` only while impersonating, so the shell can show the
 * "you are acting as…" banner and the Admin can leave in one click.
 */
export const impersonationSchema = z.object({
  adminUserId: z.string().uuid(),
  adminEmail: z.string().email().nullable(),
  reason: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
});
export type Impersonation = z.infer<typeof impersonationSchema>;

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  role: z.enum([UserRole.ADMIN, UserRole.RESELLER, UserRole.AGENT]),
  email: z.string().email(),
  name: z.string(),
  status: z.enum([
    UserStatus.PENDING_VERIFICATION,
    UserStatus.ACTIVE,
    UserStatus.SUSPENDED,
    UserStatus.CLOSED,
  ]),
  emailVerifiedAt: z.string().datetime().nullable(),
  resellerId: z.string().uuid().nullable(),
  agentId: z.string().uuid().nullable(),
  mfaEnabled: z.boolean(),
  mfaPassed: z.boolean(),
  /** Set only while an Admin is acting as this user. */
  impersonation: impersonationSchema.nullable().optional(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const meResponseSchema = z.object({
  user: sessionUserSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// ─────────────────────────── Shared primitives ───────────────────────────

/** Integer TZS; API accepts numbers or decimal strings and never floats. */
export const tzsAmountSchema = z
  .union([z.number().int(), z.string().regex(/^\d{1,15}$/)])
  .transform((v) => BigInt(v))
  .refine((v) => v > 0n, "Amount must be positive");

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ───────────────────────────── Platform plans ────────────────────────────

/**
 * A plan's price, which may legitimately be zero for a free plan.
 *
 * Distinct from {@link tzsAmountSchema}, which rejects zero because a *payment*
 * of nothing is never valid. Here zero is a commercial decision.
 */
export const planPriceTzsSchema = z
  .union([z.number().int().min(0), z.string().regex(/^\d{1,15}$/)])
  .transform((v) => BigInt(v));

export const platformPlanInputSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).default(""),
  priceTzs: planPriceTzsSchema,
  periodDays: z.number().int().min(1).max(366),
  trialEligible: z.boolean().default(false),
  trialDays: z.number().int().min(1).max(90).optional(),
  /** Legacy per-reseller caps; derived from `features.limits` when that is supplied. */
  maxSites: z.number().int().min(1).max(1000).optional(),
  maxDevices: z.number().int().min(1).max(10000).optional(),
  maxPackages: z.number().int().min(1).max(1000).optional(),
  lifecycle: planLifecycleSchema.default("DRAFT"),
  visibility: planVisibilitySchema.default("PUBLIC"),
  commercialPromise: commercialPromiseSchema.default("standard"),
  /** The feature catalog values. Absent means "start from the presets' defaults". */
  features: z.unknown().optional(),
  isDemo: z.boolean().default(false),
});
export type PlatformPlanInput = z.infer<typeof platformPlanInputSchema>;

/**
 * Editing an existing plan takes the same body as creating one — the service decides
 * whether to fix the row in place (nothing references it yet) or publish a new version.
 */
export const platformPlanUpdateSchema = platformPlanInputSchema;
export type PlatformPlanUpdateInput = PlatformPlanInput;

/** Every operator mutation on a plan carries a reason and lands in the audit log. */
export const planDeleteSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const planActiveSchema = z.object({
  active: z.boolean(),
  reason: z.string().trim().min(3).max(300),
});

export const subscriptionCheckoutSchema = z.object({
  planId: uuidSchema,
  phone: tzPhoneSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email(),
  idempotencyKey: z.string().min(8).max(64),
});

export const startTrialSchema = z.object({ planId: uuidSchema });

// ───────────────────────────── Network ───────────────────────────────────

const hexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1b5ea4");

/**
 * Guest-portal look and feel chosen in the Captive Portal designer. Stored on
 * the Site and applied by the portal app so the guest page matches the brand.
 */
export const portalThemeSchema = z.object({
  /** Preset id the theme started from (kept for the designer's UI, not styling). */
  preset: z.string().trim().max(24).default("classic"),
  /** Brand color: package price chips, links and the primary button. */
  primary: hexColorSchema.default("#1b5ea4"),
  /** Secondary accent used by gradients and highlights. */
  accent: hexColorSchema.default("#fba102"),
  /** Page background behind the cards. */
  background: hexColorSchema.default("#f5f7fb"),
  /** Card / surface color. */
  surface: hexColorSchema.default("#ffffff"),
  /** Body text color. */
  text: hexColorSchema.default("#0f172a"),
  /** Corner radius in pixels applied to cards and buttons. */
  radius: z.coerce.number().int().min(0).max(28).default(16),
  /** How the primary "Buy" button is filled. */
  buttonStyle: z.enum(["solid", "gradient", "outline"]).default("solid"),
});

export type PortalTheme = z.infer<typeof portalThemeSchema>;

export const DEFAULT_PORTAL_THEME: PortalTheme = portalThemeSchema.parse({});

/** Coerces a stored JSON value into a complete theme, falling back to defaults. */
export function portalThemeWithDefaults(raw: unknown): PortalTheme {
  const parsed = portalThemeSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_PORTAL_THEME;
}

/**
 * Reseller-editable portal content: the advert banner and the featured local
 * businesses shown on the guest's "connected" page. Stored per Site so each
 * location can promote its own neighbourhood.
 */
export const portalAdvertSchema = z.object({
  /** Banner headline, e.g. "Your business, seen in Kimara". */
  title: z.string().trim().min(1).max(60),
  /** One supporting line, e.g. "Advertise here with Advotz." */
  copy: z.string().trim().max(90).default(""),
  /** Slide background colour. */
  color: hexColorSchema.default("#117dcc"),
  /** Optional external image (no upload pipeline exists yet). */
  imageUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
  /** Business or advertiser name. */
  business: z.string().trim().max(80).optional(),
  /** Contact phone or WhatsApp number. */
  phone: z.string().trim().max(40).optional(),
  /** Destination or promo link. */
  url: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
  /** Call to action label. */
  cta: z.string().trim().max(60).optional(),
});

export const portalBusinessSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(50),
  /** Category line, e.g. "Food & drinks". */
  category: z.string().trim().max(40).default(""),
  /** Emoji or short glyph shown on the card. */
  glyph: z.string().trim().max(4).default("◆"),
  /** Accent colour for the card thumbnail. */
  color: hexColorSchema.default("#294f9e"),
});

export const portalContentSchema = z.object({
  /** How many adverts rotate (1–7) and the rotation speed. */
  advertCount: z.coerce.number().int().min(0).max(7).default(3),
  advertIntervalMs: z.coerce.number().int().min(2000).max(20000).default(4500),
  adverts: z.array(portalAdvertSchema).max(7).default([]),
  businesses: z.array(portalBusinessSchema).max(12).default([]),
});

export type PortalAdvert = z.infer<typeof portalAdvertSchema>;
export type PortalBusiness = z.infer<typeof portalBusinessSchema>;
export type PortalContent = z.infer<typeof portalContentSchema>;

export const DEFAULT_PORTAL_CONTENT: PortalContent = portalContentSchema.parse({});

/** Coerces a stored JSON value into complete portal content, falling back to defaults. */
export function portalContentWithDefaults(raw: unknown): PortalContent {
  const parsed = portalContentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_PORTAL_CONTENT;
}

/** Content that is always guaranteed to render something for a new site. */
export const PORTAL_CONTENT_STARTER: PortalContent = portalContentSchema.parse({
  advertCount: 3,
  adverts: [
    { title: "Your business, seen here", copy: "Advertise on this WiFi page.", color: "#117dcc" },
    { title: "Fresh food. Close to you.", copy: "A space for restaurant and café adverts.", color: "#a94810" },
    { title: "Style starts here", copy: "A space for salons and fashion businesses.", color: "#833f91" },
  ],
  businesses: [
    { id: "b1", name: "Local Café", category: "Food & drinks", glyph: "☕", color: "#df9e56" },
    { id: "b2", name: "Style Studio", category: "Beauty & fashion", glyph: "✂", color: "#df78a2" },
    { id: "b3", name: "Tech Point", category: "Phones & services", glyph: "▣", color: "#46a6d0" },
  ],
});

/**
 * Banner-promotion durations a local business can buy. Prices are example
 * figures shown in the simulator; final rates are agreed with the reseller.
 */
export const PROMOTION_PACKAGES = [
  { code: "1W", durationLabel: "1 week", priceTzs: 10_000, group: "weekly" as const },
  { code: "2W", durationLabel: "2 weeks", priceTzs: 18_000, group: "weekly" as const },
  { code: "3W", durationLabel: "3 weeks", priceTzs: 25_000, group: "weekly" as const },
  { code: "4W", durationLabel: "4 weeks", priceTzs: 30_000, group: "weekly" as const },
  { code: "1Q", durationLabel: "3 months", priceTzs: 80_000, group: "quarterly" as const },
  { code: "2Q", durationLabel: "6 months", priceTzs: 150_000, group: "quarterly" as const },
  { code: "3Q", durationLabel: "9 months", priceTzs: 210_000, group: "quarterly" as const },
  { code: "4Q", durationLabel: "12 months", priceTzs: 260_000, group: "quarterly" as const },
] as const;

export type PromotionPackage = (typeof PROMOTION_PACKAGES)[number];

export const promotionRequestInputSchema = z.object({
  packageCode: z.string().trim().min(1).max(4),
  fullName: z.string().trim().min(2).max(100),
  mobile: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(150).optional(),
  business: z.string().trim().min(2).max(150),
  location: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(1500),
  offer: z.string().trim().min(2).max(1500),
});

export type PromotionRequestInput = z.infer<typeof promotionRequestInputSchema>;

/**
 * Guest Explore feed. Jobs and opportunities are a recruitment feed; local
 * events and holidays share the same row shape so one admin screen (and one AI
 * feed) can manage everything the portal's Explore menu shows.
 */
export const LISTING_KINDS = ["JOB", "OPPORTUNITY", "LOCAL_EVENT", "HOLIDAY"] as const;
export const LISTING_SOURCES = ["MANUAL", "AI"] as const;

/** Empty strings from a form mean "no date", not epoch. */
const listingDate = z
  .union([z.string(), z.date(), z.null()])
  .transform((value) => {
    if (value == null) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (!value.trim()) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  })
  .optional()
  .default(null);

export const platformListingInputSchema = z.object({
  kind: z.enum(LISTING_KINDS),
  title: z.string().trim().min(2).max(120),
  /** Employer, organizer or programme behind the listing. */
  organization: z.string().trim().max(120).default(""),
  location: z.string().trim().max(120).default(""),
  /** "Full-time", "Shift work", "Training", … */
  employmentType: z.string().trim().max(40).default(""),
  summary: z.string().trim().max(300).default(""),
  description: z.string().trim().max(2000).default(""),
  /** Venue (events), destination hint (holidays) or workplace (jobs). */
  venue: z.string().trim().max(150).default(""),
  region: z.string().trim().max(80).default(""),
  link: z.string().trim().max(500).default(""),
  contactPhone: z.string().trim().max(40).default(""),
  priceLabel: z.string().trim().max(60).default(""),
  imageUrl: z.string().trim().max(500).nullable().default(null),
  tags: z.array(z.string().trim().max(40)).max(12).default([]),
  startsAt: listingDate,
  endsAt: listingDate,
  publishedAt: listingDate,
  source: z.enum(LISTING_SOURCES).default("MANUAL"),
  sourceUrl: z.string().trim().max(500).default(""),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export type PlatformListingInput = z.infer<typeof platformListingInputSchema>;

/**
 * The Admin-managed schedule for the listing assistant ("Advowifi AI").
 * Stored as a `SystemSetting`, so switching it on is an audited action.
 */
export const listingAiSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  assistantName: z.string().trim().min(1).max(60).default("Advowifi AI"),
  /** Gemini model id used for discovery. */
  model: z.string().trim().min(3).max(80).default("gemini-3.8-flash"),
  /** How many discovery runs may happen per day (bounded by `times`). */
  analysesPerDay: z.coerce.number().int().min(1).max(24).default(2),
  /** Hard cap on listings published per day, across all runs. */
  postsPerDay: z.coerce.number().int().min(1).max(50).default(6),
  /** Preferred run times in the configured timezone, HH:MM. */
  times: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .min(1)
    .max(24)
    .default(["08:00", "17:00"]),
  timezone: z.string().trim().min(3).max(60).default("Africa/Dar_es_Salaam"),
  kinds: z.array(z.enum(LISTING_KINDS)).min(1).default([...LISTING_KINDS]),
  /** Regions the assistant should search. Empty means "all Tanzania". */
  regions: z.array(z.string().trim().max(80)).max(30).default(["Dar es Salaam"]),
  /** Off keeps AI finds as drafts for review; on publishes them. */
  autoPublish: z.boolean().default(false),
  /** Delay between publishing and going live to guests, in minutes. */
  publishDelayMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  /** 0–100 quality bar the model has to clear for an item to be stored. */
  minScore: z.coerce.number().int().min(0).max(100).default(60),
});

export type ListingAiSettingsInput = z.infer<typeof listingAiSettingsSchema>;

export const listingAiRunInputSchema = z.object({
  /** Optional per-run cap; defaults to the daily remaining allowance. */
  postsLimit: z.coerce.number().int().min(1).max(50).optional(),
});

export type ListingAiRunInput = z.infer<typeof listingAiRunInputSchema>;

/** Structured item the model must return; validated again before insert. */
export const listingAiItemSchema = z.object({
  kind: z.enum(LISTING_KINDS),
  title: z.string().trim().min(3).max(120),
  organization: z.string().trim().max(120).default(""),
  location: z.string().trim().max(120).default(""),
  region: z.string().trim().max(80).default(""),
  employmentType: z.string().trim().max(40).default(""),
  summary: z.string().trim().max(300).default(""),
  description: z.string().trim().max(2000).default(""),
  venue: z.string().trim().max(150).default(""),
  link: z.string().trim().max(500).default(""),
  contactPhone: z.string().trim().max(40).default(""),
  priceLabel: z.string().trim().max(60).default(""),
  tags: z.array(z.string().trim().max(40)).max(12).default([]),
  startsAt: z.string().trim().max(40).default(""),
  endsAt: z.string().trim().max(40).default(""),
  sourceUrl: z.string().trim().max(500).default(""),
  score: z.coerce.number().int().min(0).max(100).default(0),
});

/**
 * Admin create/update body for a curated marketing hotspot.
 * Latitude/longitude are required so the public map always has a pin.
 */
export const publicHotspotInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).default(""),
  city: z.string().trim().max(80).default(""),
  region: z.string().trim().max(80).default(""),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  category: z.string().trim().max(60).default(""),
  description: z.string().trim().max(2000).default(""),
  imageUrl: z.union([z.string().trim().url().max(500), z.literal(""), z.null()]).optional(),
  portalSlug: z.union([z.string().trim().max(80), z.literal(""), z.null()]).optional(),
  /**
   * The site this location operates. Optional: a curated marketing entry need
   * not be an AdvoWiFi-run location, and a hotspot without a site simply has no
   * performance data.
   */
  siteId: z.union([uuidSchema, z.literal(""), z.null()]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export type PublicHotspotInput = z.infer<typeof publicHotspotInputSchema>;

export const siteInputSchema = z.object({
  /** Optional: a site with no name takes the reseller's registered business name. */
  name: z.string().trim().min(2).max(80).optional(),
  location: z.string().trim().max(160).optional(),
  timezone: z.string().trim().default("Africa/Dar_es_Salaam"),
  portalTitle: z.string().trim().max(80).optional(),
  portalMessage: z.string().trim().max(280).optional(),
  landingUrl: z.string().url().max(300).optional(),
  portalTheme: portalThemeSchema.optional(),
  portalContent: portalContentSchema.optional(),
});

/**
 * Admin body for adding a site to an owner account from the Hotspots screen.
 *
 * Site creation normally starts from a signed-in Reseller, which supplies the
 * `resellerId`. Here an Admin picks the owner account explicitly, so both halves
 * travel together and the service still applies every plan limit and
 * provisioning step a reseller's own request would.
 */
export const adminSiteCreateSchema = siteInputSchema.extend({
  resellerId: uuidSchema,
});

export const deviceClaimInputSchema = z
  .object({
    siteId: uuidSchema,
    /** What the operator calls the device; shown everywhere instead of the model code. */
    name: z.string().trim().min(2).max(60),
    mac: z.string().trim().regex(/^([0-9A-Fa-f]{2}[:-]?){5}[0-9A-Fa-f]{2}$/, "Invalid MAC address"),
    /** Optional: the Controller can report the exact model after adoption. */
    model: z.string().trim().min(2).max(60).optional(),
    hardwareVersion: z.string().trim().max(20).optional(),
    serial: z.string().trim().max(60).optional(),
    /**
     * The device's own login. The Controller uses it to adopt the device
     * immediately; there is no admin approval step.
     */
    deviceUsername: z.string().trim().min(1).max(64),
    devicePassword: z.string().min(1).max(128),
  });

export const deviceRenameSchema = z.object({
  name: z.string().trim().min(1).max(128),
  model: z.string().trim().max(60).optional(),
});

export const deviceRetrySchema = z.object({
  deviceUsername: z.string().trim().min(1).max(64),
  devicePassword: z.string().min(1).max(128),
});

export const deviceWifiSchema = z.object({
  name: z.string().trim().min(1).max(32),
  password: z
    .string()
    .trim()
    .max(63)
    .optional()
    .refine((value) => !value || value.length >= 8, "WiFi password must be 8 to 63 characters"),
  hidden: z.boolean(),
  band: z.enum(["2.4", "5", "both"]),
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(300),
});

export const controllerInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  mode: z.enum(["FAKE", "LIVE"]),
  baseUrl: z.string().url().optional(),
  omadacId: z.string().trim().max(64).optional(),
  version: z.string().trim().max(32).optional(),
  portalTimeSemantics: z.enum(["absolute_epoch", "duration"]).optional(),
  isDefault: z.boolean().default(false),
  credentials: z
    .object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      operatorUsername: z.string().optional(),
      operatorPassword: z.string().optional(),
      openApiContract: z.unknown().optional(),
    })
    .optional(),
});

export const capabilityEvidenceSchema = z.object({
  operation: z.string().min(2).max(60),
  supported: z.boolean(),
  verified: z.boolean(),
  reason: z.string().max(300).optional(),
  evidence: z.string().max(4000).optional(),
});

/**
 * Lifecycle toggles that never touch credentials.
 *
 * Kept apart from {@link controllerInputSchema} so an operator can retire or
 * promote a Controller without resending every field — and so each flip is
 * audited against a written reason.
 */
export const controllerFlagsSchema = z
  .object({
    isDefault: z.boolean().optional(),
    active: z.boolean().optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => v.isDefault !== undefined || v.active !== undefined, {
    message: "Nothing to change",
  });

/** Deleting a Controller is only allowed once nothing is mapped to it. */
export const controllerDeleteSchema = z.object({ reason: z.string().trim().min(3).max(300) });

// ───────────────────────────── Catalogue ─────────────────────────────────

export const wifiPackageInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  priceTzs: tzsAmountSchema,
  durationSeconds: z.number().int().min(60).max(366 * 86400),
  downloadKbps: z.number().int().min(64).max(10_000_000).optional(),
  uploadKbps: z.number().int().min(64).max(10_000_000).optional(),
  /**
   * Only the policies a Controller can currently enforce: no cap, or one total
   * cap sent on the authorization. Daily/monthly windows need a
   * reset-and-reauthorize loop no adapter implements, so they are not sellable —
   * the form must never offer a package that cannot be enforced.
   */
  quotaType: z.enum(["UNLIMITED", "TOTAL"]).default("UNLIMITED"),
  quotaBytes: z.union([z.number().int(), z.string().regex(/^\d{1,18}$/)]).transform((v) => BigInt(v)).optional(),
  maxDevices: z.number().int().min(1).max(10).default(1),
  activationWindowSeconds: z.number().int().min(300).max(30 * 86400).default(86400),
  siteIds: z.array(uuidSchema).max(100).default([]),
});
export type WifiPackageInput = z.infer<typeof wifiPackageInputSchema>;

export const voucherGroupInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  packageId: uuidSchema,
  count: z.number().int().min(1).max(500),
});

export const renameSchema = z.object({ name: z.string().trim().min(2).max(60) });

// ───────────────────────────── Portal ────────────────────────────────────

export const portalContextInputSchema = z.object({
  clientMac: z.string().trim().min(12).max(20),
  clientIp: z.string().trim().max(45).optional(),
  apMac: z.string().trim().max(20).optional(),
  gatewayMac: z.string().trim().max(20).optional(),
  ssidName: z.string().max(64).optional(),
  radioId: z.string().max(4).optional(),
  vid: z.string().max(8).optional(),
  site: z.string().max(64).optional(),
  redirectUrl: z.string().max(500).optional(),
  t: z.string().max(20).optional(),
});

export const portalOrderInputSchema = z.object({
  contextToken: z.string().min(20).max(200),
  packageId: uuidSchema,
  phone: tzPhoneSchema,
  /**
   * Optional, and normally absent.
   *
   * The guest portal has no accounts — devices are authorized by RADIUS, so a
   * guest is a phone number and nothing more. Asking for a name and an email was
   * friction on the screen that has to convert, and the email was never sent
   * anything, so the portal stopped asking.
   *
   * The payer's real name is not lost: Snippe returns the mobile-money account
   * holder's name with the payment, and that is what fills the reseller's
   * customer list. These stay accepted so an API client that does know them, or
   * an older portal build, can still supply them.
   */
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().email().optional(),
  idempotencyKey: z.string().min(8).max(64),
});

export const voucherRedeemSchema = z.object({
  contextToken: z.string().min(20).max(200),
  /** Six-digit numeric (new) or legacy 12-symbol codes, with optional dashes/spaces. */
  code: z.string().trim().min(6).max(20),
});

export const grantRecoverySchema = z.object({
  contextToken: z.string().min(20).max(200),
  recoveryToken: z.string().min(20).max(200),
});

// ───────────────────────────── Commission ────────────────────────────────

export const commissionPolicyInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    agentId: uuidSchema.optional(),
    trigger: z.enum(["FIRST_SUBSCRIPTION_PAYMENT", "SUBSCRIPTION_RENEWAL"]),
    mode: z.enum(["FIXED", "PERCENTAGE"]),
    fixedTzs: tzsAmountSchema.optional(),
    basisPoints: z.number().int().min(1).max(10000).optional(),
    eligiblePlanCodes: z.array(z.string()).default([]),
    referralEligibilityDays: z.number().int().min(1).max(3650).optional(),
    holdDays: z.number().int().min(0).max(365).default(0),
    maxPerInvoiceTzs: tzsAmountSchema.optional(),
    effectiveFrom: z.coerce.date(),
    isDemo: z.boolean().default(false),
  })
  .refine((p) => (p.mode === "FIXED" ? p.fixedTzs !== undefined : p.basisPoints !== undefined), {
    message: "FIXED needs fixedTzs; PERCENTAGE needs basisPoints",
  });

/** Ending a policy is a money decision, so it carries a reason for the audit log. */
export const commissionPolicyEndSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const commissionPolicyDeleteSchema = z.object({ reason: z.string().trim().min(3).max(300) });

// ───────────────────────────── Withdrawals ───────────────────────────────

export const payoutDestinationInputSchema = z.object({
  recipientName: z.string().trim().min(3).max(80),
  phone: tzPhoneSchema,
});

export const withdrawalQuoteSchema = z.object({
  destinationId: uuidSchema,
  amountTzs: tzsAmountSchema,
});

export const withdrawalRequestSchema = withdrawalQuoteSchema.extend({
  idempotencyKey: z.string().min(8).max(64),
});

export const saleFeeSettingSchema = z.object({ basisPoints: z.number().int().min(0).max(5000) });
export const withdrawalFeeSettingSchema = z.object({ fixedTzs: z.number().int().min(0).max(1_000_000) });

export const supportTicketInputSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(4000),
});
export const supportMessageInputSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

// ─────────────────────────── Admin impersonation ─────────────────────────

export const impersonateInputSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type ImpersonateInput = z.infer<typeof impersonateInputSchema>;

/** Admin-initiated reseller creation (the reseller never self-registers). */
export const createResellerSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: tzPhoneSchema,
  password: z.string().min(10).max(128),
  /** Optional existing agent referral code; a wrong code is rejected, never ignored. */
  referralCode: z
    .string()
    .trim()
    .min(4)
    .max(24)
    .regex(/^[A-Z0-9_-]+$/i)
    .optional(),
});
export type CreateResellerInput = z.infer<typeof createResellerSchema>;

/**
 * Admin edit of a reseller account.
 *
 * Same identity fields as creation minus the password: resetting a password is a
 * separate, deliberately distinct action so it cannot happen by accident while
 * someone is fixing a phone number. `emailVerified` is here because an operator
 * who has confirmed the address by phone is the only remaining way to clear it.
 */
export const adminResellerUpdateSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: tzPhoneSchema,
  emailVerified: z.boolean(),
  reason: z.string().trim().min(3).max(300),
});
export type AdminResellerUpdateInput = z.infer<typeof adminResellerUpdateSchema>;

/**
 * The subscription states an operator may set by hand.
 *
 * This mirrors the Prisma enum on purpose: importing the client enum into a
 * browser bundle would drag the generated Prisma types into the web app, and the
 * two lists drifting is what tests should catch, not what the schema hides.
 */
export const SUBSCRIPTION_STATE_VALUES = [
  "NONE",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
] as const;
export type SubscriptionStateValue = (typeof SUBSCRIPTION_STATE_VALUES)[number];

/**
 * A calendar day (`YYYY-MM-DD`), read in the business timezone.
 *
 * Dates are sent as days rather than instants because that is what an operator is
 * choosing in a date picker: "until 31 December" must not silently expire at
 * 03:00 local because the browser converted midnight UTC. The API anchors the day
 * to Dar es Salaam opening/closing time.
 */
const calendarDaySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD form")
  .nullable();

/**
 * Admin edit of a reseller's platform plan.
 *
 * `planId: null` detaches the plan; `limits` is the per-reseller override and
 * `null` on any of its fields means "follow the plan again". Every field is
 * required so a partial body cannot be mistaken for "leave the rest alone" —
 * an operator submits what should be true after the change.
 */
export const adminSubscriptionUpdateSchema = z.object({
  planId: uuidSchema.nullable(),
  state: z.enum(SUBSCRIPTION_STATE_VALUES),
  currentPeriodStart: calendarDaySchema,
  currentPeriodEnd: calendarDaySchema,
  trialUsed: z.boolean(),
  suspendedReason: z.string().trim().max(300).nullable(),
  limits: z.object({
    maxSites: z.number().int().min(1).max(10000).nullable(),
    maxDevices: z.number().int().min(1).max(100000).nullable(),
    maxPackagesPerSite: z.number().int().min(1).max(10000).nullable(),
  }),
  reason: z.string().trim().min(3).max(300),
});
export type AdminSubscriptionUpdateInput = z.infer<typeof adminSubscriptionUpdateSchema>;
