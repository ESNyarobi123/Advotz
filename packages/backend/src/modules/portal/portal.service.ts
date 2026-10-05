import { randomUUID } from "node:crypto";
import {
  ErrorCode,
  PROMOTION_PACKAGES,
  PORTAL_CONTENT_STARTER,
  portalContentWithDefaults,
  portalThemeWithDefaults,
  type PromotionRequestInput,
} from "@advo/contracts";
import { prisma, type PortalContext } from "@advo/db";
import { normalizeMac } from "@advo/omada";
import { derivePublicToken, generateOpaqueToken, hashToken, normalizeVoucherCode, voucherLookupHash } from "../../common/crypto.js";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../../common/errors.js";
import { emitOutbox, OutboxEventType } from "../../common/events.js";
import { enforceRateLimit } from "../../common/rate-limit.js";
import { enforcementGaps, siteCapabilities } from "../catalog/packages.service.js";
import { ensurePaymentAttempt } from "../payments/payments.service.js";
import { saleFeeBasisPoints } from "../settings/settings.service.js";
import { assertCanSell } from "../subscriptions/subscriptions.service.js";
import { joinGrant, packageSnapshot } from "../access/grants.service.js";

const CONTEXT_TTL_MS = 30 * 60_000;

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
  const canSell = await assertCanSell(site.resellerId);
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
  // The jobs/opportunities feed is platform-wide; only active rows reach guests.
  const listings = await prisma.platformListing
    .findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], take: 40 })
    .catch(() => []);
  return {
    site: {
      slug: site.slug,
      name: site.name,
      title: site.portalTitle ?? site.name,
      message: site.portalMessage,
      business: site.reseller.businessName,
      theme: portalThemeWithDefaults(site.portalTheme),
      // A site that has never been designed still shows a stocked portal.
      content: site.portalContent ? portalContentWithDefaults(site.portalContent) : PORTAL_CONTENT_STARTER,
    },
    available: canSell && Boolean(site.mapping?.remoteSiteId),
    packages: canSell ? packages : [],
    listings: listings.map((l) => ({
      id: l.id,
      kind: l.kind,
      title: l.title,
      organization: l.organization,
      location: l.location,
      employmentType: l.employmentType,
      summary: l.summary,
      description: l.description,
    })),
    promotionPackages: PROMOTION_PACKAGES,
  };
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
  input: { contextToken: string; packageId: string; phone: string; firstName: string; lastName: string; email: string; idempotencyKey: string },
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
      create: { resellerId: ctx.resellerId, phone: input.phone, firstName: input.firstName, lastName: input.lastName, email: input.email },
      update: { firstName: input.firstName, lastName: input.lastName, email: input.email },
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

function orderResponse(orderId: string, paymentState: string | null, lastError?: string | null) {
  return { orderToken: derivePublicToken("order", orderId), payment: { state: paymentState, lastError: lastError ?? null } };
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
export async function retryPortalPayment(orderToken: string, payer: { phone: string; firstName: string; lastName: string; email: string }) {
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
  if (normalizeVoucherCode(input.code).length !== 12) badRequest("Voucher code is invalid", "VOUCHER_INVALID");

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
