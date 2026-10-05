import { randomBytes } from "node:crypto";
import { ErrorCode, PORTAL_CONTENT_STARTER, type PortalContent, type PortalTheme } from "@advo/contracts";
import { prisma, type DeviceClaimState } from "@advo/db";
import { ControllerError, UnsupportedCapabilityError, normalizeMac } from "@advo/omada";
import { decryptSecret, encryptSecret } from "../../common/crypto.js";
import { badRequest, conflict, forbidden, notFound, tenantDenied } from "../../common/errors.js";
import { audit, emitOutbox, OutboxEventType } from "../../common/events.js";
import { getControllerAdapter } from "../../common/providers.js";
import { currentEntitlements } from "../subscriptions/subscriptions.service.js";
import { defaultController } from "./controllers.service.js";

type SiteInput = {
  /** Optional: a site with no name takes the reseller's registered business name. */
  name?: string;
  location?: string;
  timezone: string;
  portalTitle?: string;
  portalMessage?: string;
  landingUrl?: string;
  portalTheme?: PortalTheme;
  portalContent?: PortalContent;
};

function siteSlug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "site";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function listSites(resellerId: string) {
  return prisma.site.findMany({
    where: { resellerId, archivedAt: null },
    include: { mapping: { include: { controller: { select: { id: true, name: true, mode: true } } } }, _count: { select: { devices: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}

export async function getSite(resellerId: string, siteId: string) {
  const site = await prisma.site.findFirst({
    where: { id: siteId, resellerId },
    include: { mapping: true, devices: { take: 200 }, claims: { orderBy: { createdAt: "desc" }, take: 200 } },
  });
  if (!site) tenantDenied();
  return site;
}

export async function createSite(resellerId: string, actorUserId: string, input: SiteInput) {
  if (!validTimezone(input.timezone)) badRequest("Unknown IANA timezone");
  const ent = await currentEntitlements(resellerId);
  if (!ent) forbidden("An active trial or subscription is required to add sites", ErrorCode.FORBIDDEN);
  const controller = await defaultController();
  if (!controller) conflict("No Controller is configured yet. Ask the platform Admin to add one.", ErrorCode.CONTROLLER_UNAVAILABLE);
  // A site created without an explicit name is named after the business the
  // reseller registered with, so their first site reads as theirs by default.
  const resolvedName =
    input.name?.trim() ||
    (await prisma.reseller.findUniqueOrThrow({ where: { id: resellerId }, select: { businessName: true } })).businessName;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Reseller" WHERE id = ${resellerId}::uuid FOR UPDATE`;
    const count = await tx.site.count({ where: { resellerId, archivedAt: null } });
    if (count >= ent.maxSites) forbidden(`Your plan allows ${ent.maxSites} site(s)`);
    const site = await tx.site.create({
      data: {
        resellerId,
        name: resolvedName,
        location: input.location ?? null,
        timezone: input.timezone,
        slug: siteSlug(resolvedName),
        portalTitle: input.portalTitle ?? resolvedName,
        portalMessage: input.portalMessage ?? null,
        landingUrl: input.landingUrl ?? null,
        portalTheme: input.portalTheme ?? undefined,
        // A new site starts from a stocked portal so the guest page never looks empty.
        portalContent: input.portalContent ?? PORTAL_CONTENT_STARTER,
        state: "REQUESTED",
      },
    });
    await tx.controllerSiteMapping.create({
      data: { siteId: site.id, controllerId: controller.id, remoteName: `advo-${site.slug}`, state: "PENDING" },
    });
    const op = await tx.networkOperation.create({
      data: {
        resellerId,
        siteId: site.id,
        kind: "site.provision",
        targetType: "Site",
        targetId: site.id,
        idempotencyKey: `site-provision-${site.id}`,
      },
    });
    await emitOutbox(tx, OutboxEventType.SITE_PROVISION, "Site", site.id, { operationId: op.id, siteId: site.id });
    await tx.reseller.updateMany({ where: { id: resellerId, onboardingStep: { in: ["PROFILE", "PLAN", "SITE"] } }, data: { onboardingStep: "DEVICE" } });
    await audit(tx, { actorUserId, action: "site.created", targetType: "Site", targetId: site.id, resellerId });
    return { site, operationId: op.id };
  });
}

export async function updateSite(resellerId: string, siteId: string, input: Partial<SiteInput>) {
  const site = await prisma.site.findFirst({ where: { id: siteId, resellerId, archivedAt: null } });
  if (!site) tenantDenied();
  if (input.timezone && !validTimezone(input.timezone)) badRequest("Unknown IANA timezone");
  return prisma.site.update({
    where: { id: siteId },
    data: {
      name: input.name,
      location: input.location,
      timezone: input.timezone,
      portalTitle: input.portalTitle,
      portalMessage: input.portalMessage,
      landingUrl: input.landingUrl,
      portalTheme: input.portalTheme,
      portalContent: input.portalContent,
    },
  });
}

export async function requestReprovision(resellerId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, resellerId } });
  if (!site) tenantDenied();
  const op = await prisma.networkOperation.findUnique({ where: { idempotencyKey: `site-provision-${siteId}` } });
  if (!op) notFound();
  if (op.state === "RUNNING") return op;
  const updated = await prisma.$transaction(async (tx) => {
    // Conditional claim: a concurrent second call finds the operation already
    // PENDING/RUNNING and returns without emitting a duplicate provision event.
    const claimed = await tx.networkOperation.updateMany({
      where: { id: op.id, state: { not: "RUNNING" } },
      data: { state: "PENDING", nextRetryAt: null },
    });
    if (claimed.count === 0) return tx.networkOperation.findUniqueOrThrow({ where: { id: op.id } });
    await emitOutbox(tx, OutboxEventType.SITE_PROVISION, "Site", siteId, { operationId: op.id, siteId });
    return tx.networkOperation.findUniqueOrThrow({ where: { id: op.id } });
  });
  return updated;
}

/**
 * Worker: provision the Controller site for a local site. Before any create it looks for an
 * existing remote site with our marker name, so a timed-out create is never duplicated.
 */
export async function provisionSite(operationId: string): Promise<string> {
  const op = await prisma.networkOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (op.state === "SUCCEEDED" || op.state === "UNSUPPORTED") return op.state;
  const claimed = await prisma.networkOperation.updateMany({
    where: { id: operationId, state: { in: ["PENDING", "FAILED", "UNKNOWN"] } },
    data: { state: "RUNNING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "busy";

  const site = await prisma.site.findUniqueOrThrow({ where: { id: op.targetId }, include: { mapping: true } });
  const mapping = site.mapping!;
  await prisma.site.update({ where: { id: site.id }, data: { state: "PROVISIONING" } });
  await prisma.controllerSiteMapping.update({ where: { id: mapping.id }, data: { state: "PROVISIONING" } });

  try {
    const { adapter } = await getControllerAdapter(mapping.controllerId);
    let remote = mapping.remoteSiteId ? { remoteSiteId: mapping.remoteSiteId, name: mapping.remoteName } : await adapter.findSiteByName(mapping.remoteName);
    if (!remote) {
      remote = await adapter.createSite({ name: mapping.remoteName, externalId: site.id, timezone: site.timezone });
    }
    await prisma.$transaction(async (tx) => {
      await tx.controllerSiteMapping.update({
        where: { id: mapping.id },
        data: { remoteSiteId: remote.remoteSiteId, state: "PROVISIONED", lastError: null },
      });
      const devices = await tx.device.count({ where: { siteId: site.id } });
      await tx.site.update({ where: { id: site.id }, data: { state: devices > 0 ? "READY" : "AWAITING_DEVICE" } });
      await tx.networkOperation.update({
        where: { id: op.id },
        data: {
          state: "SUCCEEDED",
          lastError: null,
          lastErrorCode: null,
          responseSummary: { remoteSiteId: remote.remoteSiteId, simulated: adapter.simulated },
        },
      });
    });
    return "SUCCEEDED";
  } catch (err) {
    if (err instanceof UnsupportedCapabilityError) {
      await prisma.$transaction([
        prisma.controllerSiteMapping.update({
          where: { id: mapping.id },
          data: { state: "MANUAL_REQUIRED", lastError: err.message },
        }),
        prisma.site.update({ where: { id: site.id }, data: { state: "NEEDS_REVIEW" } }),
        prisma.networkOperation.update({
          where: { id: op.id },
          data: { state: "UNSUPPORTED", lastErrorCode: "CAPABILITY_UNSUPPORTED", lastError: err.message },
        }),
      ]);
      return "UNSUPPORTED";
    }
    const ambiguous = err instanceof ControllerError && err.ambiguous;
    const message = err instanceof Error ? err.message : String(err);
    const attempts = op.attempts + 1;
    const giveUp = attempts >= 6;
    await prisma.$transaction(async (tx) => {
      await tx.controllerSiteMapping.update({ where: { id: mapping.id }, data: { state: giveUp ? "FAILED" : "PENDING", lastError: message.slice(0, 500) } });
      await tx.site.update({ where: { id: site.id }, data: { state: giveUp ? "FAILED" : "REQUESTED" } });
      await tx.networkOperation.update({
        where: { id: op.id },
        data: {
          state: giveUp ? "NEEDS_REVIEW" : ambiguous ? "UNKNOWN" : "FAILED",
          lastErrorCode: err instanceof ControllerError ? err.kind : "error",
          lastError: message.slice(0, 500),
          nextRetryAt: giveUp ? null : new Date(Date.now() + backoffMs(attempts)),
        },
      });
      if (!giveUp) {
        const ev = await emitOutbox(tx, OutboxEventType.SITE_PROVISION, "Site", site.id, { operationId: op.id, siteId: site.id });
        await tx.outboxEvent.update({ where: { id: ev.id }, data: { nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) } });
      }
    });
    return giveUp ? "NEEDS_REVIEW" : "RETRY_SCHEDULED";
  }
}

export function backoffMs(attempt: number) {
  const base = Math.min(15 * 60_000, 5_000 * 2 ** (attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

// ───────────────────────────── Device claims ────────────────────────────

export async function submitDeviceClaim(
  resellerId: string,
  actorUserId: string,
  input: {
    siteId: string;
    name: string;
    mac: string;
    model?: string;
    hardwareVersion?: string;
    serial?: string;
    deviceUsername?: string;
    devicePassword?: string;
  },
) {
  const mac = normalizeMac(input.mac);
  if (!mac) badRequest("Invalid MAC address");
  const site = await prisma.site.findFirst({ where: { id: input.siteId, resellerId, archivedAt: null } });
  if (!site) tenantDenied();
  const ent = await currentEntitlements(resellerId);
  if (!ent) forbidden("An active trial or subscription is required");
  const owned = await prisma.device.findUnique({ where: { mac } });
  if (owned) {
    conflict(
      owned.resellerId === resellerId
        ? "This EAP is already registered to your business"
        : "This EAP is registered to another account. Contact support for an authorized migration.",
    );
  }
  // The device login is optional; when present the password is encrypted before
  // it touches the database and only decrypted when adoption runs.
  const deviceUsername = input.deviceUsername?.trim() || null;
  const devicePasswordEnc = input.devicePassword ? encryptSecret(input.devicePassword) : null;
  return prisma.$transaction(async (tx) => {
    // Serialise claims per reseller: the device-limit count and the duplicate-MAC
    // check are both read-then-write, so without the lock two concurrent claims
    // could both pass and exceed the plan (or double-book the same MAC).
    await tx.$queryRaw`SELECT id FROM "Reseller" WHERE id = ${resellerId}::uuid FOR UPDATE`;
    const pendingForMac = await tx.deviceClaim.findFirst({
      where: { mac, state: { in: ["SUBMITTED", "ADOPTION_PENDING"] } },
      select: { id: true },
    });
    if (pendingForMac) conflict("A claim for this MAC address is already being reviewed");
    const deviceCount = await tx.device.count({ where: { resellerId } });
    if (deviceCount >= ent.maxDevices) forbidden(`Your plan allows ${ent.maxDevices} device(s)`);
    const claim = await tx.deviceClaim.create({
      data: {
        resellerId,
        siteId: site.id,
        name: input.name.trim(),
        mac,
        model: input.model?.trim() || null,
        hardwareVersion: input.hardwareVersion ?? null,
        serial: input.serial ?? null,
        deviceUsername,
        devicePasswordEnc,
      },
    });
    await audit(tx, { actorUserId, action: "device_claim.submitted", targetType: "DeviceClaim", targetId: claim.id, resellerId });
    return redactClaim(claim);
  });
}

/** Strip the encrypted device password so it can never reach an API response. */
function redactClaim<T extends { devicePasswordEnc?: unknown }>(claim: T): Omit<T, "devicePasswordEnc"> {
  const { devicePasswordEnc: _devicePasswordEnc, ...rest } = claim;
  return rest;
}

export async function listDeviceClaims(filter: { resellerId?: string; state?: DeviceClaimState }) {
  return prisma.deviceClaim.findMany({
    where: { resellerId: filter.resellerId, state: filter.state },
    select: {
      id: true,
      resellerId: true,
      siteId: true,
      name: true,
      mac: true,
      model: true,
      hardwareVersion: true,
      serial: true,
      // The device username is shown to the operator; the password never leaves the server.
      deviceUsername: true,
      state: true,
      reviewReason: true,
      reviewedBy: true,
      reviewedAt: true,
      lastError: true,
      deviceId: true,
      createdAt: true,
      updatedAt: true,
      site: { select: { id: true, name: true } },
      reseller: { select: { id: true, businessName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

type Tally = Record<string, number>;

function tally<K extends string>(rows: Array<{ state: K }>): Tally {
  const out: Tally = {};
  for (const row of rows) out[row.state] = (out[row.state] ?? 0) + 1;
  return out;
}

/**
 * Counts behind the network overview.
 *
 * The page lists at most a few hundred rows per table, so summing in the database
 * would mean one query per bucket. Pulling the state columns once and tallying in
 * memory keeps this a constant three round-trips and guarantees the KPI row, the
 * distribution cards and the tables can never disagree with each other.
 */
export async function networkSummary() {
  const [sites, claims, operations, devices] = await Promise.all([
    prisma.site.findMany({ select: { state: true, createdAt: true } }),
    prisma.deviceClaim.findMany({ select: { state: true } }),
    prisma.networkOperation.findMany({ select: { state: true, updatedAt: true } }),
    prisma.device.findMany({ select: { controllerId: true } }),
  ]);

  const siteStates = tally(sites);
  const claimStates = tally(claims);
  const operationStates = tally(operations);

  const mappingRows = await prisma.controllerSiteMapping.findMany({ select: { state: true } });
  const mappingStates = tally(mappingRows);

  const sum = (source: Tally, keys: string[]) => keys.reduce((total, key) => total + (source[key] ?? 0), 0);

  // A mapping is "failing" when the Controller refused or the operator must intervene.
  const mappingsFailing = sum(mappingStates, ["FAILED", "MANUAL_REQUIRED", "NEEDS_REVIEW"]);
  // An operation is "stuck" when it is retrying forever instead of finishing.
  const operationsStuck = sum(operationStates, ["FAILED", "NEEDS_REVIEW", "UNSUPPORTED"]);
  const claimsWaiting = claimStates.SUBMITTED ?? 0;

  const lastActivityAt = operations
    .map((o) => o.updatedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    sites: {
      total: sites.length,
      byState: siteStates,
      ready: siteStates.READY ?? 0,
      provisioning: sum(siteStates, ["REQUESTED", "PROVISIONING"]),
      awaitingDevice: siteStates.AWAITING_DEVICE ?? 0,
      failed: siteStates.FAILED ?? 0,
      needsReview: siteStates.NEEDS_REVIEW ?? 0,
    },
    mappings: {
      total: mappingRows.length,
      byState: mappingStates,
      provisioned: mappingStates.PROVISIONED ?? 0,
      pending: sum(mappingStates, ["PENDING", "PROVISIONING"]),
      failed: mappingStates.FAILED ?? 0,
      manualRequired: mappingStates.MANUAL_REQUIRED ?? 0,
      needsReview: mappingStates.NEEDS_REVIEW ?? 0,
      failing: mappingsFailing,
      // A mapping row only exists once provisioning was attempted, so sites without
      // one are invisible in `byState` — counted here so the KPI cannot read "1/1"
      // and look healthy while most sites have no Controller at all.
      unmapped: Math.max(0, sites.length - mappingRows.length),
    },
    claims: {
      total: claims.length,
      byState: claimStates,
      submitted: claimsWaiting,
      approved: claimStates.APPROVED ?? 0,
      rejected: claimStates.REJECTED ?? 0,
      adoptionPending: claimStates.ADOPTION_PENDING ?? 0,
      adopted: claimStates.ADOPTED ?? 0,
      failed: claimStates.FAILED ?? 0,
    },
    devices: {
      total: devices.length,
      // A device without a Controller is registered but not carried by any Omada instance.
      adopted: devices.filter((d) => d.controllerId !== null).length,
      unassigned: devices.filter((d) => d.controllerId === null).length,
    },
    operations: {
      total: operations.length,
      byState: operationStates,
      pending: operationStates.PENDING ?? 0,
      running: operationStates.RUNNING ?? 0,
      succeeded: operationStates.SUCCEEDED ?? 0,
      failed: operationStates.FAILED ?? 0,
      needsReview: operationStates.NEEDS_REVIEW ?? 0,
      unsupported: operationStates.UNSUPPORTED ?? 0,
      stuck: operationsStuck,
    },
    /** Everything an operator still has to act on, so the hero can say it in one number. */
    attention: claimsWaiting + mappingsFailing + operationsStuck,
    lastActivityAt,
  };
}

export type NetworkSummary = Awaited<ReturnType<typeof networkSummary>>;

/**
 * Admin approval is the ownership proof (typing a MAC is not). Approval registers the device;
 * adoption is attempted only when the Controller exposes a verified adoption operation.
 */
export async function reviewDeviceClaim(adminUserId: string, claimId: string, decision: "approve" | "reject", reason: string) {
  const claim = await prisma.deviceClaim.findUnique({ where: { id: claimId }, include: { site: { include: { mapping: true } } } });
  if (!claim) notFound();
  if (claim.state !== "SUBMITTED") conflict(`Claim is ${claim.state}`);
  if (decision === "reject") {
    return prisma.$transaction(async (tx) => {
      const c = await tx.deviceClaim.update({
        where: { id: claimId },
        data: { state: "REJECTED", reviewReason: reason, reviewedBy: adminUserId, reviewedAt: new Date() },
      });
      await audit(tx, { actorUserId: adminUserId, action: "device_claim.rejected", targetType: "DeviceClaim", targetId: claimId, resellerId: claim.resellerId, reason });
      return redactClaim(c);
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const device = await tx.device.create({
      data: {
        resellerId: claim.resellerId,
        siteId: claim.siteId,
        controllerId: claim.site.mapping?.controllerId ?? null,
        name: claim.name,
        mac: claim.mac,
        model: claim.model,
        hardwareVersion: claim.hardwareVersion,
        observedStatus: "not_observed",
      },
    });
    const c = await tx.deviceClaim.update({
      where: { id: claimId },
      data: { state: "APPROVED", reviewReason: reason, reviewedBy: adminUserId, reviewedAt: new Date(), deviceId: device.id },
    });
    await tx.site.updateMany({ where: { id: claim.siteId, state: "AWAITING_DEVICE" }, data: { state: "READY" } });
    await audit(tx, { actorUserId: adminUserId, action: "device_claim.approved", targetType: "DeviceClaim", targetId: claimId, resellerId: claim.resellerId, reason });
    return { claim: redactClaim(c), device };
  });

  const mapping = claim.site.mapping;
  if (mapping?.remoteSiteId) {
    try {
      const { adapter } = await getControllerAdapter(mapping.controllerId);
      const adopted = await adapter.adoptDevice({
        remoteSiteId: mapping.remoteSiteId,
        mac: claim.mac,
        deviceUsername: claim.deviceUsername ?? undefined,
        devicePassword: claim.devicePasswordEnc ? decryptSecret(claim.devicePasswordEnc) : undefined,
      });
      await prisma.deviceClaim.update({
        where: { id: claimId },
        data: adopted.ok
          ? { state: "ADOPTION_PENDING", lastError: null }
          : { lastError: adopted.reason ?? "Adoption unsupported — adopt manually in the Controller" },
      });
    } catch (err) {
      await prisma.deviceClaim.update({ where: { id: claimId }, data: { lastError: err instanceof Error ? err.message.slice(0, 300) : String(err) } });
    }
  }
  return result;
}

export async function listDevices(resellerId: string) {
  return prisma.device.findMany({ where: { resellerId }, include: { site: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
}
