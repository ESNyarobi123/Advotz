import { ErrorCode, type WifiPackageInput } from "@advo/contracts";
import { prisma, type PackageRevision, type Prisma } from "@advo/db";
import { canEnforce, type ControllerCapabilities } from "@advo/omada";
import { badRequest, forbidden, tenantDenied, unprocessable } from "../../common/errors.js";
import { audit } from "../../common/events.js";
import { allowSimulated, getControllerAdapter } from "../../common/providers.js";
import { currentEntitlements, type Entitlements } from "../subscriptions/subscriptions.service.js";
import { invalidatePortalCache } from "../subscriptions/portal-cache.js";

type Tx = Prisma.TransactionClient;

/** Reasons a package revision cannot be enforced by a site's Controller (empty = sellable). */
export function enforcementGaps(rev: Pick<PackageRevision, "downloadKbps" | "uploadKbps" | "quotaType">, caps: ControllerCapabilities | null): string[] {
  if (!caps) return ["No Controller mapping for this site"];
  const sim = allowSimulated();
  const gaps: string[] = [];
  if (!canEnforce(caps.authorizeClient, sim)) gaps.push(`Client authorization: ${caps.authorizeClient.reason ?? "unsupported"}`);
  if ((rev.downloadKbps || rev.uploadKbps) && !canEnforce(caps.perClientRateLimit, sim)) {
    gaps.push(`Speed limits: ${caps.perClientRateLimit.reason ?? "unsupported"}`);
  }
  if (rev.quotaType === "TOTAL" && !canEnforce(caps.totalTrafficQuota, sim)) {
    gaps.push(`Total data quota: ${caps.totalTrafficQuota.reason ?? "unsupported"}`);
  }
  if ((rev.quotaType === "DAILY" || rev.quotaType === "MONTHLY") && !canEnforce(caps.dailyMonthlyQuotaWindows, sim)) {
    gaps.push(`Daily/monthly quota windows: ${caps.dailyMonthlyQuotaWindows.reason ?? "unsupported"}`);
  }
  return gaps;
}

export async function siteCapabilities(siteId: string): Promise<ControllerCapabilities | null> {
  const mapping = await prisma.controllerSiteMapping.findUnique({ where: { siteId } });
  if (!mapping) return null;
  const { adapter } = await getControllerAdapter(mapping.controllerId);
  return adapter.getCapabilities();
}

/**
 * What a package may actually sell at each site.
 *
 * The form asks before offering a speed cap or a data cap, so a reseller never
 * builds a package the Controller will reject on save. `authorizeClient: false`
 * means the site is not connected to a Controller yet — an onboarding problem
 * rather than a Controller limitation, so it is reported separately.
 */
export type PackageSiteOptions = {
  siteId: string;
  name: string;
  authorizeClient: boolean;
  speedLimits: boolean;
  totalQuota: boolean;
};

export async function packageSiteOptions(resellerId: string): Promise<{ sites: PackageSiteOptions[] }> {
  const sites = await prisma.site.findMany({
    where: { resellerId, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const sim = allowSimulated();
  const rows = await Promise.all(
    sites.map(async (site): Promise<PackageSiteOptions> => {
      const caps = await siteCapabilities(site.id);
      return {
        siteId: site.id,
        name: site.name,
        authorizeClient: Boolean(caps) && canEnforce(caps?.authorizeClient, sim),
        speedLimits: Boolean(caps) && canEnforce(caps?.perClientRateLimit, sim),
        totalQuota: Boolean(caps) && canEnforce(caps?.totalTrafficQuota, sim),
      };
    }),
  );
  return { sites: rows };
}

function validatePackage(input: WifiPackageInput) {
  if ((input.quotaType === "UNLIMITED") !== (input.quotaBytes === undefined)) {
    badRequest("quotaBytes is required for quota packages and must be omitted for UNLIMITED");
  }
  if (input.priceTzs < 500n) badRequest("Minimum mobile-money price is TZS 500");
}

async function assertSitesOwned(resellerId: string, siteIds: string[]) {
  if (siteIds.length === 0) return;
  const count = await prisma.site.count({ where: { id: { in: siteIds }, resellerId, archivedAt: null } });
  if (count !== new Set(siteIds).size) tenantDenied("Site not found");
}

async function assertEnforceable(input: WifiPackageInput) {
  for (const siteId of input.siteIds) {
    const gaps = enforcementGaps(
      { downloadKbps: input.downloadKbps ?? null, uploadKbps: input.uploadKbps ?? null, quotaType: input.quotaType },
      await siteCapabilities(siteId),
    );
    if (gaps.length > 0) {
      unprocessable(`This package cannot be enforced at one of the selected sites: ${gaps.join("; ")}`, ErrorCode.CAPABILITY_UNSUPPORTED);
    }
  }
}

export async function listPackages(resellerId: string, siteId?: string, includePaused = false) {
  return prisma.wifiPackage.findMany({
    where: {
      resellerId,
      // Dropdowns (vouchers, captive portal) must only ever offer something a
      // guest can actually buy, so ACTIVE stays the default. The packages screen
      // asks for paused ones too, because otherwise a pause is a one-way door.
      ...(includePaused ? {} : { status: "ACTIVE" as const }),
      ...(siteId ? { assignments: { some: { siteId } } } : {}),
    },
    include: { currentRevision: true, assignments: { include: { site: { select: { id: true, name: true } } } } },
    // Postgres orders the enum by declaration, so ACTIVE sorts before ARCHIVED:
    // sellable packages lead, paused ones sit underneath them.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
}

/**
 * Guards the plan's package allowances.
 *
 * Shared by create and re-activate so the two cannot drift: pausing a package
 * frees its slot, and resuming has to take one again — otherwise a
 * pause/create/resume cycle would end up over `maxPackages` with every
 * individual step looking legal.
 */
async function assertPackageSlot(
  tx: Tx,
  resellerId: string,
  ent: Entitlements,
  siteIds: string[],
  excludePackageId?: string,
) {
  const other = excludePackageId ? { id: { not: excludePackageId } } : {};
  const count = await tx.wifiPackage.count({ where: { resellerId, status: "ACTIVE", ...other } });
  if (ent.maxPackages !== null && count >= ent.maxPackages) forbidden(`Your plan allows ${ent.maxPackages} package(s)`);
  // New plans cap packages per site. A package assigned to several sites counts
  // in each, because that is what the guest sees at each location.
  if (ent.maxPackagesPerSite !== null) {
    const sites = [...new Set(siteIds)];
    if (sites.length > 0) {
      const assigned = await tx.packageSiteAssignment.findMany({
        where: { siteId: { in: sites }, package: { status: "ACTIVE", ...other } },
        select: { siteId: true },
      });
      const counts = new Map<string, number>();
      for (const row of assigned) counts.set(row.siteId, (counts.get(row.siteId) ?? 0) + 1);
      if ([...counts.values()].some((n) => n >= (ent.maxPackagesPerSite as number))) {
        // Reached by create and by resume alike, so the advice names both exits.
        forbidden(
          `Your plan allows ${ent.maxPackagesPerSite} package(s) per site — pause one, or upgrade your plan`,
        );
      }
    }
  }
}

export async function createPackage(resellerId: string, actorUserId: string, input: WifiPackageInput) {
  validatePackage(input);
  const ent = await currentEntitlements(resellerId);
  if (!ent) forbidden("An active trial or subscription is required");
  await assertSitesOwned(resellerId, input.siteIds);
  await assertEnforceable(input);

  return prisma.$transaction(async (tx) => {
    // Serialise package creation per reseller: without the lock two concurrent
    // requests both count the same packages and both pass the plan limit.
    await tx.$queryRaw`SELECT id FROM "Reseller" WHERE id = ${resellerId}::uuid FOR UPDATE`;
    await assertPackageSlot(tx, resellerId, ent, input.siteIds);
    const pkg = await tx.wifiPackage.create({ data: { resellerId, name: input.name } });
    const rev = await tx.packageRevision.create({ data: revisionData(pkg.id, resellerId, 1, input) });
    await tx.wifiPackage.update({ where: { id: pkg.id }, data: { currentRevisionId: rev.id } });
    for (const siteId of new Set(input.siteIds)) {
      await tx.packageSiteAssignment.create({ data: { packageId: pkg.id, siteId, resellerId } });
    }
    await audit(tx, { actorUserId, action: "package.created", targetType: "WifiPackage", targetId: pkg.id, resellerId });
    return tx.wifiPackage.findUniqueOrThrow({ where: { id: pkg.id }, include: { currentRevision: true, assignments: true } });
  });
}

function revisionData(packageId: string, resellerId: string, revision: number, input: WifiPackageInput) {
  return {
    packageId,
    resellerId,
    revision,
    name: input.name,
    priceTzs: input.priceTzs,
    durationSeconds: input.durationSeconds,
    downloadKbps: input.downloadKbps ?? null,
    uploadKbps: input.uploadKbps ?? null,
    quotaType: input.quotaType,
    quotaBytes: input.quotaBytes ?? null,
    maxDevices: input.maxDevices,
    activationWindowSeconds: input.activationWindowSeconds,
  };
}

/**
 * Edits create a new immutable revision; past orders and vouchers keep theirs.
 *
 * A paused package is still editable: the usual reason to pause is to fix a price
 * or a quota before resuming, and forcing a resume first would publish the wrong
 * tariff to guests in between.
 */
export async function updatePackage(resellerId: string, actorUserId: string, packageId: string, input: WifiPackageInput) {
  validatePackage(input);
  const pkg = await prisma.wifiPackage.findFirst({ where: { id: packageId, resellerId } });
  if (!pkg) tenantDenied();
  await assertSitesOwned(resellerId, input.siteIds);
  await assertEnforceable(input);
  return prisma.$transaction(async (tx) => {
    // Lock the package: two concurrent edits otherwise both read revision N and
    // the second insert violates @@unique([packageId, revision]) as a raw 500.
    await tx.$queryRaw`SELECT id FROM "WifiPackage" WHERE id = ${packageId}::uuid FOR UPDATE`;
    const latest = await tx.packageRevision.findFirst({ where: { packageId }, orderBy: { revision: "desc" } });
    const rev = await tx.packageRevision.create({ data: revisionData(packageId, resellerId, (latest?.revision ?? 0) + 1, input) });
    await tx.wifiPackage.update({ where: { id: packageId }, data: { name: input.name, currentRevisionId: rev.id } });
    await tx.packageSiteAssignment.deleteMany({ where: { packageId } });
    for (const siteId of new Set(input.siteIds)) {
      await tx.packageSiteAssignment.create({ data: { packageId, siteId, resellerId } });
    }
    await audit(tx, { actorUserId, action: "package.revised", targetType: "WifiPackage", targetId: packageId, resellerId, metadata: { revision: rev.revision } });
    return tx.wifiPackage.findUniqueOrThrow({ where: { id: packageId }, include: { currentRevision: true, assignments: true } });
  });
}

export async function archivePackage(resellerId: string, actorUserId: string, packageId: string) {
  const res = await prisma.wifiPackage.updateMany({ where: { id: packageId, resellerId }, data: { status: "ARCHIVED" } });
  if (res.count === 0) tenantDenied();
  await prisma.$transaction((tx) => audit(tx, { actorUserId, action: "package.archived", targetType: "WifiPackage", targetId: packageId, resellerId }));
  // The portal caches a package list for a minute; a guest must not still be
  // offered a tariff the reseller just retired.
  invalidatePortalCache();
  return { archived: true };
}

/**
 * Pause or resume a package.
 *
 * Pausing is the reversible counterpart of archiving: the tariff disappears from
 * every guest portal at once, while vouchers already sold and orders already paid
 * keep working. Resuming puts it back, subject to the plan's package allowances
 * because it occupies a slot again.
 */
export async function setPackageStatus(
  resellerId: string,
  actorUserId: string,
  packageId: string,
  status: "ACTIVE" | "ARCHIVED",
) {
  const ent = status === "ACTIVE" ? await currentEntitlements(resellerId) : null;
  if (status === "ACTIVE" && !ent) forbidden("An active trial or subscription is required");

  await prisma.$transaction(async (tx) => {
    const pkg = await tx.wifiPackage.findFirst({
      where: { id: packageId, resellerId },
      include: { assignments: { select: { siteId: true } } },
    });
    if (!pkg) tenantDenied();
    // Already in the requested state: no audit row, no cache flush, no error.
    if (pkg.status === status) return;
    if (ent) {
      // Same lock create takes, so two resumes racing cannot both claim the slot.
      await tx.$queryRaw`SELECT id FROM "Reseller" WHERE id = ${resellerId}::uuid FOR UPDATE`;
      await assertPackageSlot(
        tx,
        resellerId,
        ent,
        pkg.assignments.map((a) => a.siteId),
        packageId,
      );
    }
    await tx.wifiPackage.update({ where: { id: packageId }, data: { status } });
    await audit(tx, {
      actorUserId,
      action: status === "ACTIVE" ? "package.activated" : "package.paused",
      targetType: "WifiPackage",
      targetId: packageId,
      resellerId,
    });
  });
  // The portal holds a package list for up to a minute; a pause has to land on
  // the next request, not at the end of a TTL.
  invalidatePortalCache();
  return { id: packageId, status };
}

export async function packageRevisions(resellerId: string, packageId: string) {
  const pkg = await prisma.wifiPackage.findFirst({ where: { id: packageId, resellerId } });
  if (!pkg) tenantDenied();
  return prisma.packageRevision.findMany({ where: { packageId }, orderBy: { revision: "desc" }, take: 200 });
}
