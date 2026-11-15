import * as argon2 from "argon2";
import { prisma, type Prisma } from "@advo/db";

/**
 * Permanent removal of a reseller account.
 *
 * "Delete" has to mean delete: an operator who removes a test business expects
 * the email, the phone number and the device MACs to be free again, so the same
 * person can register from scratch and adopt the same hardware. Leaving a
 * CLOSED row behind breaks exactly that — `User.email`, `User.phone`,
 * `Reseller.slug` and `Device.mac` are unique, so the second registration is
 * rejected by a ghost of the first.
 *
 * Two outcomes:
 *
 * - `erased`     — nothing financial refers to the account, so every row is
 *                  deleted, ending with the `Reseller` and `User` rows.
 * - `anonymized` — invoices, commission accruals or ledger entries exist. The
 *                  ledger is append-only by design (a database trigger refuses
 *                  UPDATE and DELETE), so the money rows stay. Everything
 *                  operational and every piece of personal data is still
 *                  deleted, and the identity columns are scrubbed so the email,
 *                  phone, slug and MACs are free again.
 *
 * In both cases the caller has already revoked sessions; this function removes
 * the rows themselves.
 */

export type PurgeMode = "erased" | "anonymized";

export type PurgeResult = {
  mode: PurgeMode;
  resellerId: string;
  ownerUserId: string;
  /** Email the account used to own; free for a new registration afterwards. */
  freedEmail: string;
  devicesReleased: number;
  sitesRemoved: number;
  /** True when invoices/accruals/ledger entries forced the anonymized path. */
  keptFinancialHistory: boolean;
};

export type PurgeOptions = {
  resellerId: string;
  ownerUserId: string;
  ownerEmail: string;
  /**
   * Keep invoices, commission accruals and the ledger, scrubbing identity
   * instead of deleting rows. Decided by `planPurge` unless a caller forces it.
   */
  keepFinancials?: boolean;
  /**
   * Destructive reset only (CLI): remove the reseller's ledger journals and
   * accounts as well. The append-only triggers are disabled for the duration of
   * the transaction. Never used by the Admin screen.
   */
  eraseLedger?: boolean;
};

/**
 * Deletes the ledger rows that belong to a reseller.
 *
 * The append-only triggers exist so a bug can never rewrite money. A deliberate
 * platform reset is the one caller allowed to step around them, and it does so
 * inside the same transaction as the rest of the purge, so a failure restores
 * the triggers by rolling back.
 */
export async function purgeResellerLedger(tx: Prisma.TransactionClient, resellerId: string): Promise<number> {
  await tx.$executeRawUnsafe('ALTER TABLE "JournalLine" DISABLE TRIGGER "JournalLine_append_only"');
  await tx.$executeRawUnsafe('ALTER TABLE "Journal" DISABLE TRIGGER "Journal_append_only"');

  const journals = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT j.id
      FROM "Journal" j
      JOIN "JournalLine" jl ON jl."journalId" = j.id
      JOIN "LedgerAccount" la ON la.id = jl."accountId"
     WHERE la."ownerType" = 'RESELLER' AND la."ownerId" = ${resellerId}
  `;
  const journalIds = journals.map((row) => row.id);
  if (journalIds.length > 0) {
    await tx.journalLine.deleteMany({ where: { journalId: { in: journalIds } } });
    await tx.journal.deleteMany({ where: { id: { in: journalIds } } });
  }

  const accounts = await tx.$executeRaw`
    DELETE FROM "LedgerAccount"
     WHERE "ownerType" = 'RESELLER' AND "ownerId" = ${resellerId}
  `;

  await tx.$executeRawUnsafe('ALTER TABLE "JournalLine" ENABLE TRIGGER "JournalLine_append_only"');
  await tx.$executeRawUnsafe('ALTER TABLE "Journal" ENABLE TRIGGER "Journal_append_only"');
  return Number(accounts);
}

/** Does anything financial point at this reseller? */
export async function planPurge(resellerId: string): Promise<{ keepFinancials: boolean; reason: string[] }> {
  const [invoices, accruals, ledgerLines] = await Promise.all([
    prisma.subscriptionInvoice.count({ where: { resellerId } }),
    prisma.commissionAccrual.count({ where: { resellerId } }),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n
        FROM "JournalLine" jl
        JOIN "LedgerAccount" la ON la.id = jl."accountId"
       WHERE la."ownerType" = 'RESELLER' AND la."ownerId" = ${resellerId}
    `,
  ]);
  const reason: string[] = [];
  if (invoices > 0) reason.push(`${invoices} subscription invoice(s)`);
  if (accruals > 0) reason.push(`${accruals} commission accrual(s)`);
  if (Number(ledgerLines[0]?.n ?? 0) > 0) reason.push(`${Number(ledgerLines[0]?.n ?? 0)} ledger line(s)`);
  return { keepFinancials: reason.length > 0, reason };
}

function deletedEmail(ownerUserId: string): string {
  // `deleted.invalid` is reserved by RFC 2606 and cannot receive mail.
  return `deleted+${ownerUserId}@deleted.invalid`;
}

export async function purgeResellerData(
  tx: Prisma.TransactionClient,
  options: PurgeOptions,
): Promise<PurgeResult> {
  const { resellerId, ownerUserId, ownerEmail } = options;
  const email = ownerEmail.trim().toLowerCase();

  let keepFinancials = options.keepFinancials === true;
  if (options.eraseLedger) {
    await purgeResellerLedger(tx, resellerId);
    keepFinancials = false;
  }

  // ── Access and contact traces ──────────────────────────────────────────
  await tx.authSession.deleteMany({ where: { userId: ownerUserId } });
  await tx.verificationToken.deleteMany({ where: { userId: ownerUserId } });
  await tx.otpChallenge.deleteMany({
    where: { OR: [{ userId: ownerUserId }, { subject: email }] },
  });
  await tx.notification.deleteMany({
    where: { OR: [{ recipientUserId: ownerUserId }, { to: email }] },
  });

  const tickets = await tx.supportTicket.findMany({
    where: { ownerUserId },
    select: { id: true },
  });
  if (tickets.length > 0) {
    const ticketIds = tickets.map((ticket) => ticket.id);
    await tx.supportMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await tx.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
  }

  // ── WiFi usage, grants and vouchers ────────────────────────────────────
  await tx.networkSession.deleteMany({ where: { grant: { resellerId } } });
  await tx.trafficUsageSample.deleteMany({ where: { resellerId } });
  await tx.accessGrantDevice.deleteMany({ where: { grant: { resellerId } } });
  await tx.accessGrant.deleteMany({ where: { resellerId } });
  await tx.voucher.deleteMany({ where: { resellerId } });
  await tx.voucherGroup.deleteMany({ where: { resellerId } });

  // ── Orders and payments ────────────────────────────────────────────────
  await tx.paymentAttempt.deleteMany({ where: { order: { resellerId } } });
  // Invoices are kept on the anonymized path, so the FK is detached first.
  await tx.order.updateMany({
    where: { resellerId },
    data: { invoiceId: null, customerId: null, siteId: null, packageRevisionId: null },
  });
  await tx.order.deleteMany({ where: { resellerId } });

  // ── Devices (this is what frees the MACs) ──────────────────────────────
  const devicesReleased = (await tx.device.findMany({ where: { resellerId }, select: { id: true } })).length;
  await tx.deviceClaim.deleteMany({ where: { resellerId } });
  await tx.device.deleteMany({ where: { resellerId } });

  // ── Catalogue ──────────────────────────────────────────────────────────
  await tx.portalContext.deleteMany({ where: { resellerId } });
  await tx.packageSiteAssignment.deleteMany({ where: { resellerId } });
  // WifiPackage.currentRevisionId and PackageRevision.packageId reference each
  // other, so the pointer is cleared before either side can go.
  await tx.wifiPackage.updateMany({ where: { resellerId }, data: { currentRevisionId: null } });
  await tx.packageRevision.deleteMany({ where: { resellerId } });
  await tx.wifiPackage.deleteMany({ where: { resellerId } });
  await tx.customer.deleteMany({ where: { resellerId } });

  // ── Sites, operations and marketing pins ───────────────────────────────
  await tx.networkOperation.deleteMany({ where: { resellerId } });
  await tx.promotionRequest.deleteMany({ where: { resellerId } });
  const siteIds = (await tx.site.findMany({ where: { resellerId }, select: { id: true } })).map((s) => s.id);
  if (siteIds.length > 0) {
    // A marketing pin is public content, not ledger data: drop the link so the
    // deleted business stops being presented as a live AdvoWiFi location.
    await tx.publicHotspot.updateMany({ where: { siteId: { in: siteIds } }, data: { siteId: null } });
    await tx.controllerSiteMapping.deleteMany({ where: { siteId: { in: siteIds } } });
    await tx.sitePortalPreference.deleteMany({ where: { siteId: { in: siteIds } } });
    await tx.site.deleteMany({ where: { id: { in: siteIds } } });
  }

  // ── Attribution, migrations and audit ──────────────────────────────────
  await tx.referralAttribution.deleteMany({ where: { resellerId } });
  await tx.planMigrationTarget.deleteMany({ where: { resellerId } });
  await tx.resellerInvitation.updateMany({
    where: { acceptedResellerId: resellerId },
    data: { acceptedResellerId: null },
  });
  await tx.auditEvent.deleteMany({
    where: { OR: [{ resellerId }, { actorUserId: ownerUserId }] },
  });

  if (!keepFinancials) {
    const accrualIds = (
      await tx.commissionAccrual.findMany({ where: { resellerId }, select: { id: true } })
    ).map((row) => row.id);
    if (accrualIds.length > 0) {
      const allocations = await tx.withdrawalAllocation.count({
        where: { accrualId: { in: accrualIds } },
      });
      if (allocations > 0) {
        throw new Error(
          `This reseller's commission accruals back ${allocations} agent withdrawal(s). Clear those withdrawals before erasing the account.`,
        );
      }
    }
    await tx.commissionAccrual.deleteMany({ where: { resellerId } });
    await tx.subscriptionInvoice.deleteMany({ where: { resellerId } });
    await tx.subscription.deleteMany({ where: { resellerId } });
    await tx.$executeRaw`
      DELETE FROM "LedgerAccount"
       WHERE "ownerType" = 'RESELLER' AND "ownerId" = ${resellerId}
    `;
    await tx.reseller.delete({ where: { id: resellerId } });
    await tx.user.delete({ where: { id: ownerUserId } });
    return {
      mode: "erased",
      resellerId,
      ownerUserId,
      freedEmail: email,
      devicesReleased,
      sitesRemoved: siteIds.length,
      keptFinancialHistory: false,
    };
  }

  // ── Financial history stays: scrub the identity ────────────────────────
  await tx.reseller.update({
    where: { id: resellerId },
    data: {
      status: "CLOSED",
      businessName: "Deleted reseller",
      slug: `deleted-${resellerId.replace(/-/g, "").slice(0, 16)}`,
    },
  });
  await tx.user.update({
    where: { id: ownerUserId },
    data: {
      status: "CLOSED",
      role: "RESELLER",
      name: "Deleted account",
      email: deletedEmail(ownerUserId),
      phone: null,
      emailVerifiedAt: null,
      mfaEnabled: false,
      mfaSecretEnc: null,
      mfaLastStep: null,
      // A password nobody knows, in the format the login verifier expects.
      passwordHash: await argon2.hash(`${resellerId}:${Date.now()}:${Math.random()}`),
    },
  });

  return {
    mode: "anonymized",
    resellerId,
    ownerUserId,
    freedEmail: email,
    devicesReleased,
    sitesRemoved: siteIds.length,
    keptFinancialHistory: true,
  };
}
