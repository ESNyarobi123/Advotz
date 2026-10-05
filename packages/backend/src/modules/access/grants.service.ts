import { ErrorCode } from "@advo/contracts";
import { prisma, type AccessGrant, type GrantState, type PackageRevision, type PortalContext, type Prisma } from "@advo/db";
import {
  canEnforce,
  ControllerError,
  UnsupportedCapabilityError,
  type PortalClientTarget,
} from "@advo/omada";
import { conflict, notFound, tenantDenied, unprocessable } from "../../common/errors.js";
import { audit, emitOutbox, OutboxEventType } from "../../common/events.js";
import { allowSimulated, getControllerAdapter } from "../../common/providers.js";

type Tx = Prisma.TransactionClient;

const MAX_AUTH_ATTEMPTS = 6;

export function packageSnapshot(rev: PackageRevision) {
  return {
    revisionId: rev.id,
    revision: rev.revision,
    name: rev.name,
    priceTzs: rev.priceTzs.toString(),
    durationSeconds: rev.durationSeconds,
    downloadKbps: rev.downloadKbps,
    uploadKbps: rev.uploadKbps,
    quotaType: rev.quotaType,
    quotaBytes: rev.quotaBytes?.toString() ?? null,
    maxDevices: rev.maxDevices,
  };
}

function authBackoffMs(attempt: number) {
  return Math.min(10 * 60_000, 3_000 * 2 ** Math.max(0, attempt - 1));
}

async function scheduleAuthorize(tx: Tx, grantDeviceId: string, delayMs = 0) {
  const ev = await emitOutbox(tx, OutboxEventType.GRANT_AUTHORIZE, "AccessGrantDevice", grantDeviceId, { grantDeviceId });
  if (delayMs > 0) {
    await tx.outboxEvent.update({ where: { id: ev.id }, data: { nextAttemptAt: new Date(Date.now() + delayMs) } });
  }
}

/** Creates the grant for a paid WiFi order (idempotent) and reserves the buying device. */
export async function createGrantForOrder(orderId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { grant: true } });
    if (order.purpose !== "WIFI_PACKAGE") return { status: "not_wifi" as const };
    if (order.paymentState !== "PAID" && order.paymentState !== "OVERPAID") return { status: "not_paid" as const };
    if (order.grant) return { status: "exists" as const, grantId: order.grant.id };
    if (!order.packageRevisionId || !order.siteId || !order.clientMac) {
      await tx.order.update({ where: { id: orderId }, data: { fulfillmentState: "NEEDS_REVIEW" } });
      return { status: "missing_context" as const };
    }
    const rev = await tx.packageRevision.findUniqueOrThrow({ where: { id: order.packageRevisionId } });
    const grant = await tx.accessGrant.create({
      data: {
        resellerId: order.resellerId,
        siteId: order.siteId,
        orderId: order.id,
        packageRevisionId: rev.id,
        packageSnapshot: packageSnapshot(rev),
        durationSeconds: rev.durationSeconds,
        maxDevices: rev.maxDevices,
        activationDeadline: new Date(Date.now() + rev.activationWindowSeconds * 1000),
        recoveryTokenHash: order.publicTokenHash,
      },
    });
    const device = await tx.accessGrantDevice.create({
      data: { grantId: grant.id, clientMac: order.clientMac, portalContextId: order.portalContextId },
    });
    await tx.order.update({ where: { id: orderId }, data: { fulfillmentState: "PENDING" } });
    await scheduleAuthorize(tx, device.id);
    return { status: "created" as const, grantId: grant.id, grantDeviceId: device.id };
  });
}

function targetFromContext(ctx: PortalContext): PortalClientTarget | null {
  if (ctx.apMac && ctx.ssidName && ctx.radioId) {
    return { kind: "eap", clientMac: ctx.clientMac, clientIp: ctx.clientIp ?? undefined, apMac: ctx.apMac, ssidName: ctx.ssidName, radioId: ctx.radioId };
  }
  if (ctx.gatewayMac && ctx.vid) {
    return { kind: "gateway", clientMac: ctx.clientMac, clientIp: ctx.clientIp ?? undefined, gatewayMac: ctx.gatewayMac, vid: ctx.vid };
  }
  return null;
}

/**
 * Freeze the entitlement clock under a grant row lock. Once a candidate or confirmed expiry
 * exists, it is reused on every retry and for every additional device — never extended.
 */
async function fixClock(tx: Tx, grant: AccessGrant, now: Date): Promise<{ expiresAt: Date } | { error: "expired" | "deadline" }> {
  if (grant.expiresAt) return grant.expiresAt <= now ? { error: "expired" } : { expiresAt: grant.expiresAt };
  if (grant.candidateExpiresAt) {
    return grant.candidateExpiresAt <= now ? { error: "expired" } : { expiresAt: grant.candidateExpiresAt };
  }
  if (grant.activationDeadline <= now) return { error: "deadline" };
  const expiresAt = new Date(now.getTime() + grant.durationSeconds * 1000);
  await tx.accessGrant.update({ where: { id: grant.id }, data: { candidateActivatedAt: now, candidateExpiresAt: expiresAt } });
  return { expiresAt };
}

async function markDeviceFailed(grantDeviceId: string, message: string, code: string, fulfillment: "FAILED" | "NEEDS_REVIEW") {
  await prisma.$transaction(async (tx) => {
    const device = await tx.accessGrantDevice.update({
      where: { id: grantDeviceId },
      data: { authState: "FAILED", lastError: `${code}: ${message}`.slice(0, 500) },
      include: { grant: true },
    });
    const grant = device.grant;
    if (!grant.activatedAt) {
      const others = await tx.accessGrantDevice.count({
        where: { grantId: grant.id, id: { not: grantDeviceId }, authState: { in: ["AUTHORIZING", "UNKNOWN", "AUTHORIZED"] } },
      });
      if (others === 0) {
        await tx.accessGrant.update({ where: { id: grant.id }, data: { candidateActivatedAt: null, candidateExpiresAt: null } });
        if (grant.orderId) await tx.order.update({ where: { id: grant.orderId }, data: { fulfillmentState: fulfillment } });
      }
    }
  });
}

/** Worker handler for GRANT_AUTHORIZE. Safe to run repeatedly. */
export async function authorizeGrantDevice(grantDeviceId: string): Promise<string> {
  const now = new Date();
  const prep = await prisma.$transaction(async (tx) => {
    const device = await tx.accessGrantDevice.findUniqueOrThrow({ where: { id: grantDeviceId } });
    await tx.$queryRaw`SELECT id FROM "AccessGrant" WHERE id = ${device.grantId}::uuid FOR UPDATE`;
    const grant = await tx.accessGrant.findUniqueOrThrow({ where: { id: device.grantId } });
    if (device.authState === "AUTHORIZED") return { skip: "already_authorized" as const };
    if (!["RESERVED", "UNKNOWN", "AUTHORIZING"].includes(device.authState)) return { skip: `state_${device.authState}` as const };
    if (grant.state !== "PENDING_ACTIVATION" && grant.state !== "ACTIVE") return { skip: `grant_${grant.state}` as const };
    if (device.attempts >= MAX_AUTH_ATTEMPTS) {
      await tx.accessGrantDevice.update({ where: { id: device.id }, data: { lastError: "Retry limit reached; needs review" } });
      if (grant.orderId && !grant.activatedAt) await tx.order.update({ where: { id: grant.orderId }, data: { fulfillmentState: "NEEDS_REVIEW" } });
      return { skip: "needs_review" as const };
    }
    const clock = await fixClock(tx, grant, now);
    if ("error" in clock) {
      if (clock.error === "expired") {
        await tx.accessGrant.update({ where: { id: grant.id }, data: { state: "EXPIRED" } });
      } else {
        await tx.accessGrant.update({ where: { id: grant.id }, data: { state: "ACTIVATION_FAILED" } });
        if (grant.orderId) await tx.order.update({ where: { id: grant.orderId }, data: { fulfillmentState: "NEEDS_REVIEW" } });
      }
      await tx.accessGrantDevice.update({ where: { id: device.id }, data: { authState: "FAILED", lastError: `Grant ${clock.error}` } });
      return { skip: clock.error };
    }
    await tx.accessGrantDevice.update({ where: { id: device.id }, data: { authState: "AUTHORIZING", attempts: { increment: 1 } } });
    return { device, grant, expiresAt: clock.expiresAt };
  });
  if ("skip" in prep) return prep.skip ?? "skipped";
  const { device, grant, expiresAt } = prep;

  const [mapping, ctx, rev] = await Promise.all([
    prisma.controllerSiteMapping.findUnique({ where: { siteId: grant.siteId } }),
    device.portalContextId ? prisma.portalContext.findUnique({ where: { id: device.portalContextId } }) : null,
    prisma.packageRevision.findUniqueOrThrow({ where: { id: grant.packageRevisionId } }),
  ]);
  if (!mapping?.remoteSiteId) {
    await markDeviceFailed(device.id, "Site is not provisioned on a Controller", "CONTROLLER_UNAVAILABLE", "NEEDS_REVIEW");
    return "no_mapping";
  }
  const target = ctx ? targetFromContext(ctx) : null;
  if (!target) {
    await markDeviceFailed(device.id, "Portal redirect lacked the client/AP identifiers", "PORTAL_CONTEXT_INVALID", "FAILED");
    return "bad_context";
  }

  try {
    const { adapter } = await getControllerAdapter(mapping.controllerId);
    const caps = await adapter.getCapabilities();
    const sim = allowSimulated();
    if (!canEnforce(caps.authorizeClient, sim)) {
      throw new UnsupportedCapabilityError("authorizeClient", caps.authorizeClient.reason ?? "unsupported");
    }
    if (rev.quotaType === "TOTAL" && !canEnforce(caps.totalTrafficQuota, sim)) {
      throw new UnsupportedCapabilityError("totalTrafficQuota", caps.totalTrafficQuota.reason ?? "unsupported");
    }

    if (device.authState === "UNKNOWN" && canEnforce(caps.getClientAuthorization, sim)) {
      const observed = await adapter.getClientAuthorization({ remoteSiteId: mapping.remoteSiteId, clientMac: device.clientMac });
      if (observed.known && observed.authorized) {
        await confirmAuthorized(device.id, grant.id, { reconciled: true, observed });
        return "reconciled_authorized";
      }
    }

    const result = await adapter.authorizeClient({
      remoteSiteId: mapping.remoteSiteId,
      target,
      expiresAtMs: expiresAt.getTime(),
      remainingMs: expiresAt.getTime() - Date.now(),
      downloadRateLimitKbps: rev.downloadKbps ?? undefined,
      uploadRateLimitKbps: rev.uploadKbps ?? undefined,
      totalTrafficLimitBytes: rev.quotaType === "TOTAL" && rev.quotaBytes ? rev.quotaBytes : undefined,
    });
    if (result.accepted) {
      await confirmAuthorized(device.id, grant.id, result.rawSanitized ?? {});
      return "authorized";
    }
    await markDeviceFailed(device.id, `Controller rejected authorization (code ${result.vendorErrorCode ?? "?"})`, "CONTROLLER_REJECTED", "FAILED");
    return "rejected";
  } catch (err) {
    if (err instanceof UnsupportedCapabilityError) {
      await markDeviceFailed(device.id, err.message, ErrorCode.CAPABILITY_UNSUPPORTED, "NEEDS_REVIEW");
      return "unsupported";
    }
    if (err instanceof ControllerError && !err.ambiguous && err.kind !== "network") {
      await markDeviceFailed(device.id, err.message, "CONTROLLER_REJECTED", "FAILED");
      return "rejected";
    }
    // Timeout / connection loss / unreachable: outcome unknown. Keep the candidate clock and retry.
    const message = err instanceof Error ? err.message : String(err);
    await prisma.$transaction(async (tx) => {
      await tx.accessGrantDevice.update({ where: { id: device.id }, data: { authState: "UNKNOWN", lastError: message.slice(0, 500) } });
      await scheduleAuthorize(tx, device.id, authBackoffMs(device.attempts + 1));
    });
    return "unknown";
  }
}

async function confirmAuthorized(grantDeviceId: string, grantId: string, response: Record<string, unknown>) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AccessGrant" WHERE id = ${grantId}::uuid FOR UPDATE`;
    const grant = await tx.accessGrant.findUniqueOrThrow({ where: { id: grantId } });
    const now = new Date();
    await tx.accessGrantDevice.update({
      where: { id: grantDeviceId },
      data: { authState: "AUTHORIZED", authorizedAt: now, lastError: null, controllerResponse: response as Prisma.InputJsonValue },
    });
    if (!grant.activatedAt) {
      await tx.accessGrant.update({
        where: { id: grantId },
        data: {
          state: "ACTIVE",
          activatedAt: grant.candidateActivatedAt ?? now,
          expiresAt: grant.candidateExpiresAt,
          confirmedAt: now,
        },
      });
      if (grant.orderId) await tx.order.update({ where: { id: grant.orderId }, data: { fulfillmentState: "FULFILLED" } });
    }
  });
}

/** Adds another device to an ACTIVE grant (or retries this device) within maxDevices. */
export async function joinGrant(grantId: string, ctx: PortalContext) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AccessGrant" WHERE id = ${grantId}::uuid FOR UPDATE`;
    const grant = await tx.accessGrant.findUniqueOrThrow({ where: { id: grantId } });
    if (grant.siteId !== ctx.siteId) unprocessable("This access belongs to a different WiFi location", ErrorCode.FORBIDDEN);
    if (grant.state !== "ACTIVE" && grant.state !== "PENDING_ACTIVATION") conflict(`Access is ${grant.state.toLowerCase()}`);
    if (grant.expiresAt && grant.expiresAt <= new Date()) conflict("Access has expired");
    const existing = await tx.accessGrantDevice.findUnique({ where: { grantId_clientMac: { grantId, clientMac: ctx.clientMac } } });
    if (existing) {
      if (existing.authState === "AUTHORIZED" || existing.authState === "AUTHORIZING") return existing;
      if (existing.authState === "REVOKED" || existing.authState === "REVOKE_PENDING") conflict("This device was removed from the access");
      const updated = await tx.accessGrantDevice.update({
        where: { id: existing.id },
        data: { authState: "RESERVED", portalContextId: ctx.id, attempts: 0, lastError: null },
      });
      await scheduleAuthorize(tx, updated.id);
      return updated;
    }
    const used = await tx.accessGrantDevice.count({ where: { grantId, authState: { notIn: ["REVOKED", "FAILED"] } } });
    if (used >= grant.maxDevices) conflict(`This access allows ${grant.maxDevices} device(s)`, ErrorCode.DEVICE_LIMIT_REACHED);
    const device = await tx.accessGrantDevice.create({ data: { grantId, clientMac: ctx.clientMac, portalContextId: ctx.id } });
    await scheduleAuthorize(tx, device.id);
    return device;
  });
}

/** Only live access can be revoked; terminal states stay as they are. */
const REVOCABLE_GRANT_STATES: GrantState[] = ["PENDING_ACTIVATION", "ACTIVE"];

export async function revokeGrant(resellerId: string, actorUserId: string, grantId: string, reason: string) {
  const grant = await prisma.accessGrant.findFirst({ where: { id: grantId, resellerId } });
  if (!grant) tenantDenied();
  if (grant.state === "REVOKED") return grant;
  if (!REVOCABLE_GRANT_STATES.includes(grant.state)) {
    conflict(`This access is ${grant.state.replace(/_/g, " ").toLowerCase()} and can no longer be revoked`);
  }
  return prisma.$transaction(async (tx) => {
    // Lock the grant so a revoke cannot interleave with device authorization.
    await tx.$queryRaw`SELECT id FROM "AccessGrant" WHERE id = ${grantId}::uuid FOR UPDATE`;
    const updated = await tx.accessGrant.update({ where: { id: grantId }, data: { state: "REVOKED", revokedAt: new Date() } });
    const devices = await tx.accessGrantDevice.findMany({ where: { grantId, authState: { in: ["AUTHORIZED", "UNKNOWN", "AUTHORIZING"] } } });
    for (const d of devices) {
      await tx.accessGrantDevice.update({ where: { id: d.id }, data: { authState: "REVOKE_PENDING" } });
      await emitOutbox(tx, OutboxEventType.GRANT_REVOKE, "AccessGrantDevice", d.id, { grantDeviceId: d.id });
    }
    await tx.accessGrantDevice.updateMany({ where: { grantId, authState: "RESERVED" }, data: { authState: "REVOKED" } });
    await audit(tx, { actorUserId, action: "grant.revoked", targetType: "AccessGrant", targetId: grantId, resellerId, reason });
    return updated;
  });
}

/** Worker handler for GRANT_REVOKE. Unsupported revoke stays REVOKE_PENDING for manual action. */
export async function revokeGrantDevice(grantDeviceId: string): Promise<string> {
  const device = await prisma.accessGrantDevice.findUniqueOrThrow({ where: { id: grantDeviceId }, include: { grant: true } });
  if (device.authState !== "REVOKE_PENDING") return "noop";
  const mapping = await prisma.controllerSiteMapping.findUnique({ where: { siteId: device.grant.siteId } });
  if (!mapping?.remoteSiteId) {
    await prisma.accessGrantDevice.update({ where: { id: device.id }, data: { lastError: "No Controller mapping; revoke manually" } });
    return "no_mapping";
  }
  try {
    const { adapter } = await getControllerAdapter(mapping.controllerId);
    const res = await adapter.revokeAuthorization({ remoteSiteId: mapping.remoteSiteId, clientMac: device.clientMac });
    if (res.ok) {
      await prisma.accessGrantDevice.update({ where: { id: device.id }, data: { authState: "REVOKED", lastError: null } });
      return "revoked";
    }
    await prisma.accessGrantDevice.update({ where: { id: device.id }, data: { lastError: res.reason ?? "Revoke unsupported; revoke manually in the Controller" } });
    return "unsupported";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.accessGrantDevice.update({ where: { id: device.id }, data: { lastError: message.slice(0, 500) } });
    if (err instanceof UnsupportedCapabilityError) return "unsupported";
    throw err;
  }
}

/** Sweeper: expire ended grants and fail unactivated ones past their activation deadline. */
export async function sweepGrants(now = new Date()) {
  const expired = await prisma.accessGrant.updateMany({
    where: { state: "ACTIVE", expiresAt: { lte: now } },
    data: { state: "EXPIRED" },
  });
  const stale = await prisma.accessGrant.findMany({
    where: { state: "PENDING_ACTIVATION", activationDeadline: { lte: now }, candidateExpiresAt: null },
    select: { id: true, orderId: true, voucherId: true },
    take: 500,
  });
  for (const g of stale) {
    await prisma.$transaction(async (tx) => {
      await tx.accessGrant.update({ where: { id: g.id }, data: { state: "ACTIVATION_FAILED" } });
      if (g.orderId) await tx.order.update({ where: { id: g.orderId }, data: { fulfillmentState: "NEEDS_REVIEW" } });
    });
  }
  return { expired: expired.count, activationFailed: stale.length };
}

export async function listGrants(resellerId: string, filter: { state?: GrantState; siteId?: string }) {
  return prisma.accessGrant.findMany({
    where: { resellerId, state: filter.state, siteId: filter.siteId },
    include: { devices: true, site: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function getGrantForReseller(resellerId: string, grantId: string) {
  const grant = await prisma.accessGrant.findFirst({ where: { id: grantId, resellerId }, include: { devices: true, sessions: true } });
  if (!grant) notFound();
  return grant;
}

/** Operator retry for a failed/unknown device; reuses the grant's fixed clock. */
export async function retryGrantDevice(resellerId: string, actorUserId: string, grantDeviceId: string) {
  const device = await prisma.accessGrantDevice.findUnique({ where: { id: grantDeviceId }, include: { grant: true } });
  if (!device || device.grant.resellerId !== resellerId) tenantDenied();
  if (!["FAILED", "UNKNOWN"].includes(device.authState)) conflict(`Device is ${device.authState}`);
  return prisma.$transaction(async (tx) => {
    const d = await tx.accessGrantDevice.update({ where: { id: grantDeviceId }, data: { authState: "RESERVED", attempts: 0 } });
    await scheduleAuthorize(tx, grantDeviceId);
    await audit(tx, { actorUserId, action: "grant.device_retry", targetType: "AccessGrantDevice", targetId: grantDeviceId, resellerId });
    return d;
  });
}
