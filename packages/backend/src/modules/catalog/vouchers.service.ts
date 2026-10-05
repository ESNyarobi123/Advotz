import { prisma } from "@advo/db";
import { decryptSecret, encryptSecret, generateVoucherCode, voucherLookupHash } from "../../common/crypto.js";
import { conflict, forbidden, isUniqueViolation, tenantDenied } from "../../common/errors.js";
import { audit } from "../../common/events.js";
import { currentEntitlements } from "../subscriptions/subscriptions.service.js";

export async function listVoucherGroups(resellerId: string) {
  const groups = await prisma.voucherGroup.findMany({
    where: { resellerId },
    include: { packageRevision: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const counts = await prisma.voucher.groupBy({
    by: ["groupId", "state"],
    where: { resellerId },
    _count: true,
  });
  return groups.map((g) => ({
    ...g,
    counts: Object.fromEntries(counts.filter((c) => c.groupId === g.id).map((c) => [c.state, c._count])),
  }));
}

/** A batch is created and audited in one transaction, so a retry cannot leave a partial group behind. */
const VOUCHER_CODE_ATTEMPTS = 5;

export async function createVoucherGroup(resellerId: string, actorUserId: string, input: { name: string; packageId: string; count: number }) {
  const pkg = await prisma.wifiPackage.findFirst({ where: { id: input.packageId, resellerId, status: "ACTIVE" } });
  if (!pkg?.currentRevisionId) tenantDenied("Package not found");
  const packageRevisionId = pkg.currentRevisionId;
  const ent = await currentEntitlements(resellerId);
  if (!ent) forbidden("An active trial or subscription is required to create voucher groups");

  for (let attempt = 1; ; attempt++) {
    const codes = Array.from({ length: input.count }, () => generateVoucherCode());
    try {
      return await prisma.$transaction(async (tx) => {
        const group = await tx.voucherGroup.create({
          data: { resellerId, packageRevisionId, name: input.name },
        });
        await tx.voucher.createMany({
          data: codes.map((code) => ({
            resellerId,
            groupId: group.id,
            codeLookup: voucherLookupHash(code),
            codeEnc: encryptSecret(code),
          })),
        });
        await audit(tx, {
          actorUserId,
          action: "voucher_group.created",
          targetType: "VoucherGroup",
          targetId: group.id,
          resellerId,
          metadata: { count: codes.length },
        });
        return { ...group, created: codes.length };
      });
    } catch (err) {
      // A collision on the keyed hash aborts the whole transaction, so redraw the
      // batch instead of retrying a single row.
      if (isUniqueViolation(err) && attempt < VOUCHER_CODE_ATTEMPTS) continue;
      throw err;
    }
  }
}

async function ownedGroup(resellerId: string, groupId: string) {
  const group = await prisma.voucherGroup.findFirst({ where: { id: groupId, resellerId } });
  if (!group) tenantDenied();
  return group;
}

export async function renameVoucherGroup(resellerId: string, groupId: string, name: string) {
  await ownedGroup(resellerId, groupId);
  return prisma.voucherGroup.update({ where: { id: groupId }, data: { name } });
}

export async function listVouchers(resellerId: string, groupId: string) {
  await ownedGroup(resellerId, groupId);
  const vouchers = await prisma.voucher.findMany({
    where: { groupId, resellerId, state: { not: "DELETED" } },
    include: { grant: { select: { id: true, state: true, expiresAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  return vouchers.map((v) => ({
    id: v.id,
    code: decryptSecret(v.codeEnc),
    state: v.state,
    redeemedAt: v.redeemedAt,
    grant: v.grant,
  }));
}

/** Leading = + - @ tab/CR are neutralised so spreadsheets do not evaluate cells as formulas. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportVoucherGroupCsv(resellerId: string, actorUserId: string, groupId: string) {
  const group = await ownedGroup(resellerId, groupId);
  const rev = await prisma.packageRevision.findUniqueOrThrow({ where: { id: group.packageRevisionId } });
  const vouchers = await listVouchers(resellerId, groupId);
  const rows = [
    ["code", "package", "price_tzs", "duration_minutes", "max_devices", "state"].map(csvCell).join(","),
    ...vouchers.map((v) =>
      [v.code, rev.name, rev.priceTzs.toString(), String(Math.round(rev.durationSeconds / 60)), String(rev.maxDevices), v.state]
        .map(csvCell)
        .join(","),
    ),
  ];
  await prisma.$transaction((tx) =>
    audit(tx, { actorUserId, action: "voucher_group.exported", targetType: "VoucherGroup", targetId: groupId, resellerId }),
  );
  return { filename: `vouchers-${group.name.replace(/[^a-z0-9]+/gi, "-")}.csv`, csv: rows.join("\n") };
}

export async function deleteUnusedVouchers(resellerId: string, actorUserId: string, groupId: string) {
  await ownedGroup(resellerId, groupId);
  const res = await prisma.voucher.updateMany({ where: { groupId, resellerId, state: "UNUSED" }, data: { state: "DELETED" } });
  await prisma.$transaction((tx) =>
    audit(tx, { actorUserId, action: "voucher_group.unused_deleted", targetType: "VoucherGroup", targetId: groupId, resellerId, metadata: { count: res.count } }),
  );
  return { deleted: res.count };
}

export async function archiveVoucherGroup(resellerId: string, actorUserId: string, groupId: string) {
  await ownedGroup(resellerId, groupId);
  const redeemedActive = await prisma.voucher.count({ where: { groupId, resellerId, state: "UNUSED" } });
  if (redeemedActive > 0) conflict("Delete unused vouchers before archiving the group");
  await prisma.voucherGroup.update({ where: { id: groupId }, data: { state: "ARCHIVED" } });
  await prisma.$transaction((tx) => audit(tx, { actorUserId, action: "voucher_group.archived", targetType: "VoucherGroup", targetId: groupId, resellerId }));
  return { archived: true };
}
