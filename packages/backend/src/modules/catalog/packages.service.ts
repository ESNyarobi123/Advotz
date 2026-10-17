import { ErrorCode, type WifiPackageInput } from "@advo/contracts";
import { prisma, type PackageRevision } from "@advo/db";
import { canEnforce, type ControllerCapabilities } from "@advo/omada";
import { badRequest, forbidden, tenantDenied, unprocessable } from "../../common/errors.js";
import { audit } from "../../common/events.js";
import { allowSimulated, getControllerAdapter } from "../../common/providers.js";
import { currentEntitlements } from "../subscriptions/subscriptions.service.js";

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

export async function listPackages(resellerId: string) {
  return prisma.wifiPackage.findMany({
    where: { resellerId, status: "ACTIVE" },
    include: { currentRevision: true, assignments: { include: { site: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
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
    const count = await tx.wifiPackage.count({ where: { resellerId, status: "ACTIVE" } });
    if (ent.maxPackages !== null && count >= ent.maxPackages) forbidden(`Your plan allows ${ent.maxPackages} package(s)`);
    // New plans cap packages per site. A package assigned to several sites counts
    // in each, because that is what the guest sees at each location.
    if (ent.maxPackagesPerSite !== null) {
      const sites = [...new Set(input.siteIds)];
      if (sites.length > 0) {
        const assigned = await tx.packageSiteAssignment.findMany({
          where: { siteId: { in: sites }, package: { status: "ACTIVE" } },
          select: { siteId: true },
        });
        const counts = new Map<string, number>();
        for (const row of assigned) counts.set(row.siteId, (counts.get(row.siteId) ?? 0) + 1);
        if ([...counts.values()].some((n) => n >= (ent.maxPackagesPerSite as number))) {
          forbidden(`Your plan allows ${ent.maxPackagesPerSite} package(s) per site`);
        }
      }
    }
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

/** Edits create a new immutable revision; past orders and vouchers keep theirs. */
export async function updatePackage(resellerId: string, actorUserId: string, packageId: string, input: WifiPackageInput) {
  validatePackage(input);
  const pkg = await prisma.wifiPackage.findFirst({ where: { id: packageId, resellerId, status: "ACTIVE" } });
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
  return { archived: true };
}

export async function packageRevisions(resellerId: string, packageId: string) {
  const pkg = await prisma.wifiPackage.findFirst({ where: { id: packageId, resellerId } });
  if (!pkg) tenantDenied();
  return prisma.packageRevision.findMany({ where: { packageId }, orderBy: { revision: "desc" }, take: 200 });
}
