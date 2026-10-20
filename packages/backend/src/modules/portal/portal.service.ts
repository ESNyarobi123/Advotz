import { randomUUID } from "node:crypto";
import {
  ErrorCode,
  FEATURE_LOCKED_BY_PLAN,
  PROMOTION_PACKAGES,
  PORTAL_CONTENT_STARTER,
  portalContentWithDefaults,
  portalThemeWithDefaults,
  visibilityKeySchema,
  type PackageCardStyle,
  type PromotionRequestInput,
} from "@advo/contracts";
import { prisma, type PortalContext } from "@advo/db";
import { normalizeMac } from "@advo/omada";
import { derivePublicToken, generateOpaqueToken, hashToken, normalizeVoucherCode, voucherLookupHash } from "../../common/crypto.js";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../../common/errors.js";
import { emitOutbox, OutboxEventType } from "../../common/events.js";
import { enforceRateLimit } from "../../common/rate-limit.js";
import { enforcementGaps, siteCapabilities } from "../catalog/packages.service.js";
import { listGuestListings } from "../platform/listings.service.js";
import { ensurePaymentAttempt } from "../payments/payments.service.js";
import { saleFeeBasisPoints } from "../settings/settings.service.js";
import { assertCanSell } from "../subscriptions/subscriptions.service.js";
import { eligibleCampaignsForSite, resolveSiteConfig } from "../subscriptions/entitlements.service.js";
import { currentCampaignGeneration, portalCacheKey, readPortalCache, writePortalCache } from "../subscriptions/portal-cache.js";
import { joinGrant, packageSnapshot } from "../access/grants.service.js";

const CONTEXT_TTL_MS = 30 * 60_000;

/**
 * How long a policy-resolved public payload may be reused.
 *
 * Short on purpose: the revision check already makes a stale *plan* impossible,
 * and this bounds everything a revision cannot express (an ad schedule boundary,
 * a package rename). Campaign boundaries tighten it further.
 */
const PORTAL_CACHE_TTL_MS = 60_000;

async function activeSiteBySlug(slug: string) {
  const site = await prisma.site.findFirst({
    where: { slug, archivedAt: null },
    include: { reseller: { select: { id: true, businessName: true, status: true } }, mapping: true },
  });
  if (!site || site.reseller.status !== "ACTIVE") notFound("WiFi location not found");
  return site;
}

export async function portalBootstrap(slug: string) {
  const site = await activeSiteBySlug(slug);
  // Selling status is live: a lapse or a suspension must take effect immediately.
  const canSell = await assertCanSell(site.resellerId);
  const resolution = await resolveSiteConfig(site.id);

  // The payload is cached against the revision of the *live* resolution, so an
  // entry can never outlive a plan migration, renewal or preference change. The
  // campaign generation is folded in because authoring a campaign does not touch
  // a site's revision.
  const revision = `${resolution?.config.configRevision ?? "none"}:${currentCampaignGeneration()}`;
  const cacheKey = portalCacheKey("bootstrap", site.slug);
  let payload = readPortalCache<PortalBootstrapPayload>(cacheKey, revision);

  if (!payload) {
    const built = await buildPortalBootstrapPayload(site, resolution);
    payload = built.payload;
    writePortalCache(cacheKey, revision, built.ttlMs, payload);
  }

  return {
    ...payload,
    available: canSell && Boolean(site.mapping?.remoteSiteId),
    // A reseller who cannot sell right now must not be shown a price list.
    packages: canSell ? payload.packages : [],
  };
}

type PortalBootstrapPayload = Awaited<ReturnType<typeof buildPortalBootstrapPayload>>["payload"];

/**
 * Everything in the bootstrap response that is a pure function of the site's
 * policy-resolved configuration.
 *
 * Split out so the cache can hold exactly this — never the live selling status.
 */
async function buildPortalBootstrapPayload(
  site: Awaited<ReturnType<typeof activeSiteBySlug>>,
  resolution: Awaited<ReturnType<typeof resolveSiteConfig>>,
) {
  const config = resolution?.config ?? null;
  const caps = await siteCapabilities(site.id).catch(() => null);
  const assignments = await prisma.packageSiteAssignment.findMany({
    where: { siteId: site.id, package: { status: "ACTIVE" } },
    include: { package: { include: { currentRevision: true } } },
  });
  const packages = assignments
    .map((a) => a.package.currentRevision && { packageId: a.packageId, rev: a.package.currentRevision })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .filter((x) => enforcementGaps(x.rev, caps).length === 0)
    .map(({ packageId, rev }) => ({
      packageId,
      name: rev.name,
      priceTzs: rev.priceTzs,
      durationSeconds: rev.durationSeconds,
      downloadKbps: rev.downloadKbps,
      uploadKbps: rev.uploadKbps,
      quotaType: rev.quotaType,
      quotaBytes: rev.quotaBytes,
      maxDevices: rev.maxDevices,
    }))
    .sort((a, b) => (a.priceTzs < b.priceTzs ? -1 : 1));

  // Every sponsored/discovery surface is decided by the policy-resolved config:
  // visibility first, then whether an eligible campaign actually exists, so an
  // empty placement collapses instead of rendering an empty card.
  const jobsVisible = config?.visibility["discovery.jobs"]?.visible ?? false;
  const exploreVisible = config?.visibility["ads.explore"]?.visible ?? false;
  const bannerVisible = config?.visibility["ads.banner"]?.visible ?? false;
  // One feed serves Jobs & Opportunities and the Local Events / Holidays rows;
  // the guest filter drops drafts, scheduled rows and anything already ended.
  const listings = jobsVisible || exploreVisible ? await listGuestListings(60).catch(() => []) : [];
  // An ads lookup failure must never break checkout: an empty placement is the
  // honest fallback and the guest keeps buying.
  const banner = bannerVisible
    ? await eligibleCampaignsForSite(site.id, "ads.banner").catch(() => ({ campaigns: [], visible: false, nextBoundaryAt: null, configRevision: "none" }))
    : { campaigns: [], visible: false, nextBoundaryAt: null, configRevision: "none" };

  const baseTheme = portalThemeWithDefaults(site.portalTheme);
  const branding = resolution?.preference.branding;
  const colorsEdit = Boolean(resolution?.config.branding.colorsEditAllowed);
  const theme = portalThemeWithDefaults({
    ...baseTheme,
    ...(colorsEdit && branding?.primary_color ? { primary: branding.primary_color } : {}),
    ...(colorsEdit && branding?.accent_color ? { accent: branding.accent_color } : {}),
    // A chosen background colour replaces the default paper; unset leaves the
    // template's own colour rather than painting a colour nobody asked for.
    ...(colorsEdit && branding?.background_color ? { background: branding.background_color } : {}),
    ...(branding?.theme_preset ? { preset: branding.theme_preset } : {}),
  });
  // A plan that does not include custom card styles falls back to the plan default.
  const styledPackages = resolution
    ? applyPackageOrderAndStyle(packages, resolution.config.packageCards.style, resolution.preference.packageOrder)
    : packages;

  return {
    payload: {
      site: {
        slug: site.slug,
        name: site.name,
        title: site.portalTitle ?? site.name,
        message: site.portalMessage,
        business: site.reseller.businessName,
        theme,
        /** Plan-resolved logo: `null` when the plan has no logo upload or none is set. */
        logoUrl: resolution?.config.branding.logoUrl ?? null,
        /** Plan-resolved background image, or `null` when none applies. */
        backgroundUrl: resolution?.config.branding.backgroundUrl ?? null,
        // A site that has never been designed still shows a stocked portal.
        content: site.portalContent ? portalContentWithDefaults(site.portalContent) : PORTAL_CONTENT_STARTER,
        defaultLocale: resolution?.preference.branding.default_locale ?? "en",
      },
      /** Effective, policy-resolved portal configuration. Guest apps render from this. */
      config,
      packages: styledPackages,
      packageCardStyle: resolution?.config.packageCards.style ?? "classic",
      packageCardLayout: resolution?.config.packageCards.layout ?? "list",
      listings: listings.map((l) => ({
        id: l.id,
        kind: l.kind,
        title: l.title,
        organization: l.organization,
        location: l.location,
        employmentType: l.employmentType,
        summary: l.summary,
        description: l.description,
        venue: l.venue,
        region: l.region,
        link: l.link,
        contactPhone: l.contactPhone,
        priceLabel: l.priceLabel,
        startsAt: l.startsAt?.toISOString() ?? null,
        endsAt: l.endsAt?.toISOString() ?? null,
      })),
      campaigns: banner.campaigns,
      promotionsAvailable: config?.visibility["discovery.promote_business"]?.visible ?? false,
      promotionPackages: config?.visibility["discovery.promote_business"]?.visible ? PROMOTION_PACKAGES : [],
    },
    // Never outlive a scheduled campaign boundary: the entry must be rebuilt when
    // a campaign starts or ends, not up to a minute later.
    ttlMs: cacheTtlUntil(banner.nextBoundaryAt),
  };
}

/** Caps a cache lifetime at the next scheduled change, or the default TTL. */
function cacheTtlUntil(boundary: Date | null, now: Date = new Date()): number {
  if (!boundary) return PORTAL_CACHE_TTL_MS;
  const until = boundary.getTime() - now.getTime();
  return Math.max(0, Math.min(PORTAL_CACHE_TTL_MS, until));
}

/** Re-orders assigned packages by the reseller's saved order and stamps the resolved card style. */
function applyPackageOrderAndStyle<T extends { packageId: string }>(
  packages: T[],
  style: PackageCardStyle,
  order: string[],
): Array<T & { cardStyle: PackageCardStyle }> {
  const index = new Map(order.map((id, i) => [id, i]));
  return [...packages]
    .sort((a, b) => (index.get(a.packageId) ?? Number.MAX_SAFE_INTEGER) - (index.get(b.packageId) ?? Number.MAX_SAFE_INTEGER))
    .map((pkg) => ({ ...pkg, cardStyle: style }));
}

/**
 * Stores the Controller redirect parameters server-side and returns an opaque context token.
 * Parameters are client-supplied: they are normalised and bound to this site's Controller
 * mapping but are not proof of identity (corroborated=false unless a verified lookup exists).
 */
export async function createPortalContext(
  slug: string,
  input: {
    clientMac: string;
    clientIp?: string;
    apMac?: string;
    gatewayMac?: string;
    ssidName?: string;
    radioId?: string;
    vid?: string;
    site?: string;
    redirectUrl?: string;
  },
  ip: string,
) {
  await enforceRateLimit("portal-context", ip, 60, 60);
  const site = await activeSiteBySlug(slug);
  const clientMac = normalizeMac(input.clientMac);
  if (!clientMac) badRequest("Invalid client MAC address", "PORTAL_CONTEXT_INVALID");
  const apMac = input.apMac ? normalizeMac(input.apMac) : null;
  const gatewayMac = input.gatewayMac ? normalizeMac(input.gatewayMac) : null;
  if (input.apMac && !apMac) badRequest("Invalid AP MAC address", "PORTAL_CONTEXT_INVALID");
  if (input.gatewayMac && !gatewayMac) badRequest("Invalid gateway MAC address", "PORTAL_CONTEXT_INVALID");
  if (!(apMac && input.ssidName && input.radioId !== undefined) && !(gatewayMac && input.vid)) {
    badRequest("Redirect is missing AP/SSID/radio or gateway/VLAN parameters", "PORTAL_CONTEXT_INVALID");
  }
  if (input.site && site.mapping?.remoteSiteId && input.site !== site.mapping.remoteSiteId) {
    badRequest("Redirect does not belong to this WiFi location", "PORTAL_CONTEXT_INVALID");
  }
  if (apMac) {
    const device = await prisma.device.findUnique({ where: { mac: apMac } });
    if (device && device.siteId !== site.id) badRequest("Access point is not registered to this location", "PORTAL_CONTEXT_INVALID");
  }
  const token = generateOpaqueToken();
  await prisma.portalContext.create({
    data: {
      tokenHash: hashToken(token),
      siteId: site.id,
      resellerId: site.resellerId,
      clientMac,
      clientIp: input.clientIp ?? null,
      apMac,
      gatewayMac,
      ssidName: input.ssidName ?? null,
      radioId: input.radioId ?? null,
      vid: input.vid ?? null,
      remoteSiteId: input.site ?? null,
      redirectUrl: safeRedirect(input.redirectUrl),
      expiresAt: new Date(Date.now() + CONTEXT_TTL_MS),
    },
  });
  return { contextToken: token, expiresInSeconds: CONTEXT_TTL_MS / 1000 };
}

function safeRedirect(url?: string) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function loadContext(token: string): Promise<PortalContext> {
  const ctx = await prisma.portalContext.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!ctx || ctx.expiresAt < new Date()) {
    unprocessable("Your WiFi session expired. Reconnect to the WiFi to continue.", "PORTAL_CONTEXT_EXPIRED");
  }
  return ctx;
}

export async function createPortalOrder(
  input: { contextToken: string; packageId: string; phone: string; firstName?: string; lastName?: string; email?: string; idempotencyKey: string },
  ip: string,
) {
  await enforceRateLimit("portal-order-ip", ip, 20, 600);
  await enforceRateLimit("portal-order-phone", input.phone, 5, 600);
  const ctx = await loadContext(input.contextToken);

  const replay = await prisma.order.findUnique({
    where: { resellerId_requestIdempotencyKey: { resellerId: ctx.resellerId, requestIdempotencyKey: input.idempotencyKey } },
  });
  if (replay) {
    if (replay.portalContextId !== ctx.id) conflict("Idempotency key already used for a different request");
    const attempt = await ensurePaymentAttempt(replay.id, input).catch(() => null);
    return orderResponse(replay.id, attempt?.state ?? null);
  }

  if (!(await assertCanSell(ctx.resellerId))) forbidden("This WiFi location is not accepting payments right now");
  const assignment = await prisma.packageSiteAssignment.findUnique({
    where: { packageId_siteId: { packageId: input.packageId, siteId: ctx.siteId } },
    include: { package: { include: { currentRevision: true } } },
  });
  const rev = assignment?.package.status === "ACTIVE" ? assignment.package.currentRevision : null;
  if (!rev) notFound("Package not available at this location");
  const gaps = enforcementGaps(rev, await siteCapabilities(ctx.siteId));
  if (gaps.length > 0) unprocessable(`Package cannot be enforced: ${gaps.join("; ")}`, ErrorCode.CAPABILITY_UNSUPPORTED);
  const saleFeeBps = await saleFeeBasisPoints();

  const orderId = randomUUID();
  const publicToken = derivePublicToken("order", orderId);
  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { resellerId_phone: { resellerId: ctx.resellerId, phone: input.phone } },
      // Only what the guest actually supplied. An omitted field stores null on
      // create and is left untouched on update, so a later visit that omits the
      // name cannot erase a name the payment provider told us.
      create: { resellerId: ctx.resellerId, phone: input.phone, ...suppliedPayerDetails(input) },
      update: suppliedPayerDetails(input),
    });
    await tx.order.create({
      data: {
        id: orderId,
        purpose: "WIFI_PACKAGE",
        resellerId: ctx.resellerId,
        siteId: ctx.siteId,
        customerId: customer.id,
        packageRevisionId: rev.id,
        amountTzs: rev.priceTzs,
        priceSnapshot: { ...packageSnapshot(rev), saleFeeBasisPoints: saleFeeBps },
        publicTokenHash: hashToken(publicToken),
        portalContextId: ctx.id,
        clientMac: ctx.clientMac,
        requestIdempotencyKey: input.idempotencyKey,
      },
    });
  });
  const attempt = await ensurePaymentAttempt(orderId, input);
  return orderResponse(orderId, attempt.state, attempt.lastError);
}

/**
 * The payer details a guest actually supplied.
 *
 * Spread into Prisma input, where an absent key is meaningfully different from
 * `undefined` set explicitly: absent leaves the stored column alone.
 */
function suppliedPayerDetails(input: { firstName?: string; lastName?: string; email?: string }) {
  return {
    ...(input.firstName ? { firstName: input.firstName } : {}),
    ...(input.lastName ? { lastName: input.lastName } : {}),
    ...(input.email ? { email: input.email } : {}),
  };
}

function orderResponse(orderId: string, paymentState: string | null, lastError?: string | null) {  return { orderToken: derivePublicToken("order", orderId), payment: { state: paymentState, lastError: lastError ?? null } };
}

/** Customer-facing status via the unguessable order token (no internal IDs exposed). */
export async function portalOrderStatus(orderToken: string) {
  const order = await prisma.order.findUnique({
    where: { publicTokenHash: hashToken(orderToken) },
    include: {
      attempts: { orderBy: { createdAt: "desc" }, take: 1 },
      grant: { include: { devices: { select: { clientMac: true, authState: true, lastError: true } } } },
      site: { select: { slug: true, landingUrl: true } },
    },
  });
  if (!order) notFound("Order not found");
  const snapshot = order.priceSnapshot as { name?: string; durationSeconds?: number };
  const attempt = order.attempts[0];
  return {
    package: { name: snapshot.name, durationSeconds: snapshot.durationSeconds },
    amountTzs: order.amountTzs,
    paymentState: order.paymentState,
    paymentAttempt: attempt ? { state: attempt.state, lastError: attempt.lastError } : null,
    fulfillmentState: order.fulfillmentState,
    access: order.grant
      ? {
          state: order.grant.state,
          activatedAt: order.grant.activatedAt,
          expiresAt: order.grant.expiresAt,
          maxDevices: order.grant.maxDevices,
          devices: order.grant.devices.map((d) => ({ mac: maskMac(d.clientMac), state: d.authState })),
        }
      : null,
    landingUrl: order.site?.landingUrl ?? null,
  };
}

function maskMac(mac: string) {
  return `••:••:••:${mac.slice(-8)}`;
}

/** Retry payment for an unpaid order (e.g. customer declined, wants to try again). */
export async function retryPortalPayment(orderToken: string, payer: { phone: string; firstName?: string; lastName?: string; email?: string }) {
  const order = await prisma.order.findUnique({ where: { publicTokenHash: hashToken(orderToken) } });
  if (!order) notFound("Order not found");
  if (order.paymentState !== "UNPAID") conflict("This order is already paid or closed");
  await enforceRateLimit("portal-retry", order.id, 5, 600);
  const attempt = await ensurePaymentAttempt(order.id, payer);
  return { payment: { state: attempt.state, lastError: attempt.lastError } };
}

/** Voucher redemption: one voucher → one grant; the unique voucherId makes races lose cleanly. */
export async function redeemVoucher(input: { contextToken: string; code: string }, ip: string) {
  await enforceRateLimit("voucher-redeem-ip", ip, 10, 600);
  const ctx = await loadContext(input.contextToken);
  await enforceRateLimit("voucher-redeem-mac", ctx.clientMac, 10, 600);
  // New batches are 6 digits; older alphanumeric batches were 12 symbols.
  const codeLen = normalizeVoucherCode(input.code).length;
  if (codeLen !== 6 && codeLen !== 12) badRequest("Voucher code is invalid", "VOUCHER_INVALID");

  const voucher = await prisma.voucher.findUnique({
    where: { codeLookup: voucherLookupHash(input.code) },
    include: { group: { include: { packageRevision: true } }, grant: true },
  });
  // Same message for unknown and cross-tenant codes.
  if (!voucher || voucher.resellerId !== ctx.resellerId) badRequest("Voucher code is invalid", "VOUCHER_INVALID");
  if (voucher.grant) {
    if (voucher.grant.siteId !== ctx.siteId) badRequest("Voucher code is invalid", "VOUCHER_INVALID");
    const device = await joinGrant(voucher.grant.id, ctx);
    return { recoveryToken: derivePublicToken("voucher-grant", voucher.grant.id), grantDeviceState: device.authState };
  }
  if (voucher.state !== "UNUSED" || voucher.group.state !== "ACTIVE") badRequest("Voucher is no longer valid", "VOUCHER_INVALID");
  // Policy gate: an already-redeemed voucher keeps working (see the branch above),
  // but a plan that disables the voucher feature cannot start new redemptions.
  const sitePolicy = await resolveSiteConfig(ctx.siteId);
  if (sitePolicy && !sitePolicy.config.voucherEnabled) {
    forbidden("Voucher login is not available at this WiFi location", FEATURE_LOCKED_BY_PLAN);
  }
  if (!(await assertCanSell(ctx.resellerId))) forbidden("This WiFi location is not accepting vouchers right now");
  const rev = voucher.group.packageRevision;
  const assigned = await prisma.packageSiteAssignment.findUnique({ where: { packageId_siteId: { packageId: rev.packageId, siteId: ctx.siteId } } });
  if (!assigned) badRequest("This voucher is not valid at this WiFi location", "VOUCHER_INVALID");
  const gaps = enforcementGaps(rev, await siteCapabilities(ctx.siteId));
  if (gaps.length > 0) unprocessable(`Voucher package cannot be enforced here: ${gaps.join("; ")}`, ErrorCode.CAPABILITY_UNSUPPORTED);

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.voucher.updateMany({ where: { id: voucher.id, state: "UNUSED" }, data: { state: "REDEEMED", redeemedAt: new Date() } });
    if (claimed.count === 0) badRequest("Voucher is no longer valid", "VOUCHER_INVALID");
    const grantId = randomUUID();
    const recoveryToken = derivePublicToken("voucher-grant", grantId);
    await tx.accessGrant.create({
      data: {
        id: grantId,
        resellerId: ctx.resellerId,
        siteId: ctx.siteId,
        voucherId: voucher.id,
        packageRevisionId: rev.id,
        packageSnapshot: packageSnapshot(rev),
        durationSeconds: rev.durationSeconds,
        maxDevices: rev.maxDevices,
        activationDeadline: new Date(Date.now() + rev.activationWindowSeconds * 1000),
        recoveryTokenHash: hashToken(recoveryToken),
      },
    });
    const device = await tx.accessGrantDevice.create({ data: { grantId, clientMac: ctx.clientMac, portalContextId: ctx.id } });
    await emitOutbox(tx, OutboxEventType.GRANT_AUTHORIZE, "AccessGrantDevice", device.id, { grantDeviceId: device.id });
    return { recoveryToken, grantDeviceState: device.authState };
  });
  return result;
}

/** Status/join for a grant using its recovery token (order token for purchases). */
export async function grantStatus(recoveryToken: string) {
  const grant = await prisma.accessGrant.findUnique({
    where: { recoveryTokenHash: hashToken(recoveryToken) },
    include: { devices: { select: { clientMac: true, authState: true } } },
  });
  if (!grant) notFound("Access not found");
  return {
    state: grant.state,
    activatedAt: grant.activatedAt,
    expiresAt: grant.expiresAt,
    maxDevices: grant.maxDevices,
    package: grant.packageSnapshot,
    devices: grant.devices.map((d) => ({ mac: maskMac(d.clientMac), state: d.authState })),
  };
}

export async function joinWithRecoveryToken(input: { contextToken: string; recoveryToken: string }, ip: string) {
  await enforceRateLimit("grant-join", ip, 20, 600);
  const ctx = await loadContext(input.contextToken);
  const grant = await prisma.accessGrant.findUnique({ where: { recoveryTokenHash: hashToken(input.recoveryToken) } });
  if (!grant || grant.resellerId !== ctx.resellerId) notFound("Access not found");
  const device = await joinGrant(grant.id, ctx);
  return { grantDeviceState: device.authState };
}

/**
 * A local business asking the reseller to run a banner promotion. The guest page
 * posts here; the request surfaces in the reseller's Captive Portal designer.
 * No payment is taken and no banner is published automatically.
 */
export async function submitPromotion(slug: string, input: PromotionRequestInput, ip: string) {
  await enforceRateLimit("portal-promotion-ip", ip, 10, 600);
  const site = await activeSiteBySlug(slug);
  const policy = await resolveSiteConfig(site.id);
  if (policy && !policy.config.visibility["discovery.promote_business"].visible) {
    forbidden("Promotions are not available at this WiFi location", ErrorCode.PLACEMENT_HIDDEN);
  }
  const pkg = PROMOTION_PACKAGES.find((p) => p.code === input.packageCode);
  if (!pkg) badRequest("Unknown promotion package", "PROMOTION_PACKAGE_INVALID");
  await prisma.promotionRequest.create({
    data: {
      siteId: site.id,
      resellerId: site.resellerId,
      packageCode: pkg.code,
      durationLabel: pkg.durationLabel,
      priceTzs: BigInt(pkg.priceTzs),
      fullName: input.fullName,
      mobile: input.mobile,
      email: input.email ?? null,
      business: input.business,
      location: input.location,
      description: input.description,
      offer: input.offer,
    },
  });
  return { received: true };
}

/**
 * The policy-resolved configuration a guest app renders from. Returned by slug so
 * the browser never learns an internal site id, and safe to cache on
 * `config.configRevision`.
 */
export async function portalConfig(slug: string) {
  const site = await activeSiteBySlug(slug);
  const resolution = await resolveSiteConfig(site.id);
  if (!resolution) notFound("WiFi location not found");
  return {
    slug: site.slug,
    /** `null` means no usable plan: brand colours fall back to catalog defaults. */
    plan: resolution.resolved
      ? {
          code: resolution.resolved.plan.code,
          version: resolution.resolved.plan.version,
          commercialPromise: resolution.resolved.commercialPromise,
        }
      : null,
    config: resolution.config,
  };
}

/**
 * Campaigns for one placement, or an empty list when the placement is hidden.
 *
 * Cached per site *and* placement against the site's config revision plus the
 * campaign generation, so a `DISABLED` placement, another reseller's campaign or
 * a previous plan's creatives can never be handed to this portal.
 */
export async function portalAds(slug: string, placement: string) {
  const parsed = visibilityKeySchema.safeParse(placement);
  if (!parsed.success) badRequest("Unknown ad placement", "PLACEMENT_INVALID");
  const site = await activeSiteBySlug(slug);
  const result = await eligibleCampaignsForSite(site.id, parsed.data);
  const key = portalCacheKey("ads", site.id, parsed.data, currentCampaignGeneration());
  const cached = readPortalCache<typeof result.campaigns>(key, result.configRevision);
  if (cached) return { placement: parsed.data, campaigns: cached, configRevision: result.configRevision };
  writePortalCache(key, result.configRevision, cacheTtlUntil(result.nextBoundaryAt), result.campaigns);
  return { placement: parsed.data, campaigns: result.campaigns, configRevision: result.configRevision };
}
