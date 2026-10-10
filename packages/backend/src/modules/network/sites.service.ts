import { randomBytes } from "node:crypto";
import { ErrorCode, PORTAL_CONTENT_STARTER, type PortalContent, type PortalTheme } from "@advo/contracts";
import { prisma, type DeviceClaimState } from "@advo/db";
import { ControllerError, UnsupportedCapabilityError, normalizeMac, type RemoteDevice, type RemoteWifi } from "@advo/omada";
import { decryptSecret } from "../../common/crypto.js";
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
    // `null` is unlimited; an over-limit reseller keeps every existing site and
    // is only stopped from adding more until they are back inside the plan.
    if (ent.maxSites !== null && count >= ent.maxSites) forbidden(`Your plan allows ${ent.maxSites} site(s)`);
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

export async function archiveSite(resellerId: string, actorUserId: string, siteId: string) {
  const site = await prisma.site.findFirst({ where: { id: siteId, resellerId, archivedAt: null } });
  if (!site) tenantDenied();
  await prisma.$transaction(async (tx) => {
    await tx.site.update({ where: { id: siteId }, data: { archivedAt: new Date() } });
    await audit(tx, { actorUserId, action: "site.archived", targetType: "Site", targetId: siteId, resellerId });
  });
  return { archived: true };
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
    const portalUrl = `${(process.env.PORTAL_PUBLIC_URL ?? "http://localhost:3001").replace(/\/$/, "")}/${site.slug}`;
    let portalConfigured = false;
    try {
      const portal = await adapter.configureExternalPortal({ remoteSiteId: remote.remoteSiteId, portalUrl });
      portalConfigured = portal.ok;
      if (!portal.ok && !portal.unsupported) {
        throw new ControllerError(portal.reason ?? "External portal was not configured", "rejected", false);
      }
    } catch (err) {
      // A controller without a portal contract still keeps the site. A live
      // rejection is retried with the rest of provisioning.
      if (!(err instanceof UnsupportedCapabilityError)) throw err;
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
          responseSummary: { remoteSiteId: remote.remoteSiteId, portalUrl, portalConfigured, simulated: adapter.simulated },
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

const ADOPT_REJECTED =
  "The controller did not adopt this device. Check the username and password, and that the device is pending on the controller.";

/**
 * Reseller adoption. The Controller adopts the device with the login the reseller
 * typed. A wrong login is returned immediately and nothing is saved for an admin
 * to approve. After a successful adopt the device is stored as active or offline.
 */
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
    deviceUsername: string;
    devicePassword: string;
  },
) {
  const mac = normalizeMac(input.mac);
  if (!mac) badRequest("Invalid MAC address");
  const deviceUsername = input.deviceUsername.trim();
  const devicePassword = input.devicePassword;
  if (!deviceUsername || !devicePassword) badRequest("Enter the device username and password");

  const site = await prisma.site.findFirst({
    where: { id: input.siteId, resellerId, archivedAt: null },
    include: { mapping: true },
  });
  if (!site) tenantDenied();
  const mapping = site.mapping;
  if (!mapping?.remoteSiteId || mapping.state !== "PROVISIONED") {
    badRequest("This site is not on the controller yet. Wait until provisioning finishes, then try again.");
  }
  const ent = await currentEntitlements(resellerId);
  if (!ent) forbidden("An active trial or subscription is required");
  const owned = await prisma.device.findUnique({ where: { mac } });
  if (owned) {
    conflict(
      owned.resellerId === resellerId
        ? "This device is already registered to your business"
        : "This device is registered to another account. Contact support for an authorized migration.",
    );
  }
  const pendingOther = await prisma.deviceClaim.findFirst({
    where: { mac, resellerId: { not: resellerId }, state: { in: ["SUBMITTED", "ADOPTION_PENDING"] } },
    select: { id: true },
  });
  if (pendingOther) conflict("A claim for this MAC address is already being reviewed");
  const deviceCount = await prisma.device.count({ where: { resellerId } });
  if (ent.maxDevices !== null && deviceCount >= ent.maxDevices) forbidden(`Your plan allows ${ent.maxDevices} device(s)`);

  const { adapter } = await getControllerAdapter(mapping.controllerId);
  let adoptedOk = false;
  let failure = ADOPT_REJECTED;
  try {
    const adopted = await adapter.adoptDevice({
      remoteSiteId: mapping.remoteSiteId,
      mac,
      deviceUsername,
      devicePassword,
    });
    if (adopted.ok) adoptedOk = true;
    else if (adopted.unsupported) badRequest(adopted.reason ?? "This controller cannot adopt devices through the API.");
    else if (adopted.reason) failure = adopted.reason;
  } catch (err) {
    if (err instanceof UnsupportedCapabilityError) badRequest("This controller cannot adopt devices through the API.");
    if (!(err instanceof ControllerError)) throw err;
    const vendor = err.vendorMessage?.trim();
    if (vendor) failure = vendor;
    else if (err.kind === "timeout" || err.kind === "network") {
      failure = "The controller could not be reached. Try again in a moment.";
    }
  }

  let remote: RemoteDevice | undefined;
  try {
    const listed = await adapter.listDevices({ remoteSiteId: mapping.remoteSiteId });
    remote = listed.find((device) => normalizeMac(device.mac) === mac);
  } catch {
    // A confirmed adopt still registers the device. The next device list refreshes its status.
  }

  const observedStatus = observedPresence(remote, adoptedOk);
  if (!observedStatus) badRequest(failure);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Reseller" WHERE id = ${resellerId}::uuid FOR UPDATE`;
    const ownedNow = await tx.device.findUnique({ where: { mac } });
    if (ownedNow) {
      conflict(
        ownedNow.resellerId === resellerId
          ? "This device is already registered to your business"
          : "This device is registered to another account. Contact support for an authorized migration.",
      );
    }
    const countNow = await tx.device.count({ where: { resellerId } });
    if (ent.maxDevices !== null && countNow >= ent.maxDevices) forbidden(`Your plan allows ${ent.maxDevices} device(s)`);

    const device = await tx.device.create({
      data: {
        resellerId,
        siteId: site.id,
        controllerId: mapping.controllerId,
        name: input.name.trim(),
        mac,
        model: remote?.model ?? input.model?.trim() ?? null,
        hardwareVersion: input.hardwareVersion ?? null,
        firmware: remote?.firmware ?? null,
        observedStatus,
        lastSeenAt: observedStatus === "active" ? new Date() : null,
      },
    });
    const openClaim = await tx.deviceClaim.findFirst({
      where: { mac, resellerId, state: { in: ["SUBMITTED", "ADOPTION_PENDING"] } },
    });
    const claimData = {
      name: input.name.trim(),
      model: device.model,
      hardwareVersion: input.hardwareVersion ?? null,
      serial: input.serial ?? null,
      deviceUsername,
      devicePasswordEnc: null,
      state: "ADOPTED" as const,
      deviceId: device.id,
      reviewReason: "Adopted on the controller with the device login",
      reviewedAt: new Date(),
      lastError: null,
    };
    const claim = openClaim
      ? await tx.deviceClaim.update({ where: { id: openClaim.id }, data: claimData })
      : await tx.deviceClaim.create({
          data: { resellerId, siteId: site.id, mac, ...claimData },
        });
    await tx.site.updateMany({ where: { id: site.id, state: "AWAITING_DEVICE" }, data: { state: "READY" } });
    await audit(tx, { actorUserId, action: "device.adopted", targetType: "Device", targetId: device.id, resellerId });
    return { claim: redactClaim(claim), device };
  });
}

/** Active or offline once the controller has the device. A pending device is not registered unless adopt succeeded. */
function observedPresence(remote: RemoteDevice | undefined, adoptedOk: boolean): "active" | "offline" | null {
  if (remote?.presence === "active") return "active";
  if (remote?.presence === "offline") return "offline";
  if (adoptedOk) return "offline";
  return null;
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
 * Older claims that were submitted before resellers adopted devices themselves.
 * A new device does not wait here: the reseller's username and password are sent
 * straight to the controller.
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

async function ownedDevice(resellerId: string, deviceId: string) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, resellerId },
    include: { site: { include: { mapping: true } } },
  });
  if (!device) tenantDenied();
  const mapping = device.site.mapping;
  if (!mapping?.remoteSiteId || mapping.state !== "PROVISIONED" || !mapping.controllerId) {
    badRequest("This site is not on the controller yet.");
  }
  return { device, remoteSiteId: mapping.remoteSiteId, controllerId: mapping.controllerId };
}

function failController(err: unknown, fallback: string): never {
  if (err instanceof UnsupportedCapabilityError) badRequest(fallback);
  if (err instanceof ControllerError) {
    const vendor = err.vendorMessage?.trim();
    if (err.kind === "timeout" || err.kind === "network") {
      badRequest(vendor || "The controller could not be reached. Try again in a moment.");
    }
    badRequest(vendor || fallback);
  }
  throw err;
}

/** Renames the device on the controller and stores the name and model here. */
export async function renameDevice(
  resellerId: string,
  actorUserId: string,
  deviceId: string,
  input: { name: string; model?: string },
) {
  const { device, remoteSiteId, controllerId } = await ownedDevice(resellerId, deviceId);
  const { adapter } = await getControllerAdapter(controllerId);
  let kind: string | undefined;
  try {
    const remote = await adapter.listDevices({ remoteSiteId });
    kind = remote.find((row) => normalizeMac(row.mac) === device.mac)?.kind;
  } catch {
    kind = undefined;
  }
  try {
    const renamed = await adapter.renameDevice({ remoteSiteId, mac: device.mac, name: input.name.trim(), kind });
    if (!renamed.ok) badRequest(renamed.reason ?? "The controller could not rename this device.");
  } catch (err) {
    failController(err, "The controller could not rename this device.");
  }
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      name: input.name.trim(),
      model: input.model === undefined ? device.model : input.model.trim() || null,
    },
  });
  await prisma.$transaction((tx) => audit(tx, { actorUserId, action: "device.renamed", targetType: "Device", targetId: device.id, resellerId }));
  return updated;
}

/** Tries adoption again with a new device username and password. */
export async function retryDeviceAdopt(
  resellerId: string,
  deviceId: string,
  input: { deviceUsername: string; devicePassword: string },
) {
  const { device, remoteSiteId, controllerId } = await ownedDevice(resellerId, deviceId);
  const { adapter } = await getControllerAdapter(controllerId);
  try {
    const adopted = await adapter.adoptDevice({
      remoteSiteId,
      mac: device.mac,
      deviceUsername: input.deviceUsername.trim(),
      devicePassword: input.devicePassword,
    });
    if (!adopted.ok) badRequest(adopted.reason ?? ADOPT_REJECTED);
  } catch (err) {
    failController(err, ADOPT_REJECTED);
  }
  let observedStatus = device.observedStatus;
  try {
    const remote = await adapter.listDevices({ remoteSiteId });
    const found = remote.find((row) => normalizeMac(row.mac) === device.mac);
    observedStatus = found?.presence === "active" ? "active" : "offline";
  } catch {
    observedStatus = "offline";
  }
  return prisma.device.update({
    where: { id: device.id },
    data: {
      observedStatus,
      lastSeenAt: observedStatus === "active" ? new Date() : device.lastSeenAt,
    },
  });
}

/** Forgets the device on the controller, then removes it from this account. */
export async function removeDevice(resellerId: string, actorUserId: string, deviceId: string) {
  const { device, remoteSiteId, controllerId } = await ownedDevice(resellerId, deviceId);
  const { adapter } = await getControllerAdapter(controllerId);
  try {
    const forgotten = await adapter.forgetDevice({ remoteSiteId, mac: device.mac });
    if (!forgotten.ok) badRequest(forgotten.reason ?? "The controller could not remove this device.");
  } catch (err) {
    failController(err, "The controller could not remove this device.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.device.delete({ where: { id: device.id } });
    await audit(tx, { actorUserId, action: "device.removed", targetType: "Device", targetId: device.id, resellerId });
  });
  return { ok: true };
}

/** Creates a WiFi network on the device's site. Every device on that site broadcasts it. */
export async function createDeviceWifi(
  resellerId: string,
  deviceId: string,
  input: { name: string; password?: string; hidden: boolean; band: "2.4" | "5" | "both" },
) {
  const { remoteSiteId, controllerId } = await ownedDevice(resellerId, deviceId);
  const { adapter } = await getControllerAdapter(controllerId);
  try {
    return await adapter.createWifi({
      remoteSiteId,
      name: input.name.trim(),
      password: input.password?.trim() || undefined,
      hidden: input.hidden,
      band: input.band,
    });
  } catch (err) {
    failController(err, "The controller could not create this WiFi network.");
  }
}

export async function listDevices(resellerId: string) {
  const devices = await prisma.device.findMany({
    where: { resellerId },
    include: {
      site: {
        select: {
          id: true,
          name: true,
          mapping: { select: { controllerId: true, remoteSiteId: true, state: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof devices>();
  const wifiBySite = new Map<string, RemoteWifi[]>();
  for (const device of devices) {
    const mapping = device.site.mapping;
    if (!mapping?.remoteSiteId || mapping.state !== "PROVISIONED") continue;
    const key = `${mapping.controllerId}|${mapping.remoteSiteId}`;
    const group = groups.get(key) ?? [];
    group.push(device);
    groups.set(key, group);
  }

  await Promise.all(
    [...groups.entries()].map(async ([key, group]) => {
      const [controllerId, remoteSiteId] = key.split("|");
      if (!controllerId || !remoteSiteId) return;
      try {
        const { adapter } = await getControllerAdapter(controllerId);
        const remote = await adapter.listDevices({ remoteSiteId });
        try {
          wifiBySite.set(key, await adapter.listSsids({ remoteSiteId }));
        } catch {
          wifiBySite.set(key, []);
        }
        const byMac = new Map(remote.flatMap((device) => {
          const mac = normalizeMac(device.mac);
          return mac ? [[mac, device] as const] : [];
        }));
        await Promise.all(group.map(async (device) => {
          const found = byMac.get(device.mac);
          // Adopted devices are only Active or Offline. Anything the controller
          // no longer lists, or still has pending, is shown as offline.
          const observedStatus = found?.presence === "active" ? "active" : "offline";
          const firmware = found?.firmware ?? device.firmware;
          const model = device.model ?? found?.model ?? null;
          if (device.observedStatus === observedStatus && device.firmware === firmware && device.model === model) return;
          const updated = await prisma.device.update({
            where: { id: device.id },
            data: {
              observedStatus,
              firmware,
              model,
              lastSeenAt: observedStatus === "active" ? new Date() : device.lastSeenAt,
            },
          });
          device.observedStatus = updated.observedStatus;
          device.firmware = updated.firmware;
          device.model = updated.model;
          device.lastSeenAt = updated.lastSeenAt;
        }));
      } catch {
        // Keep the last status the controller reported.
      }
    }),
  );

  return devices.map((device) => {
    const mapping = device.site.mapping;
    const key = mapping?.remoteSiteId && mapping.controllerId ? `${mapping.controllerId}|${mapping.remoteSiteId}` : "";
    const { mapping: _mapping, ...site } = device.site;
    return { ...device, site, wifi: wifiBySite.get(key) ?? [] };
  });
}
