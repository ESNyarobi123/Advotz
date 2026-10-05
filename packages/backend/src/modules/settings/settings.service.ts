import { prisma, type Prisma } from "@advo/db";
import { conflict } from "../../common/errors.js";
import { isProduction } from "../../common/providers.js";

export const SettingKey = {
  SALE_FEE_BPS: "platform.saleFeeBasisPoints",
  WITHDRAWAL_FEE_TZS: "platform.withdrawalFeeTzs",
} as const;

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row ? (row.value as T) : null;
}

export async function setSetting(key: string, value: unknown, actorUserId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.systemSetting.findUnique({ where: { key } });
    const row = await tx.systemSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedBy: actorUserId },
      update: {
        value: value as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedBy: actorUserId,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId,
        action: "setting.updated",
        targetType: "SystemSetting",
        targetId: key,
        reason: reason ?? null,
        metadata: { before: existing?.value ?? null, after: value } as Prisma.InputJsonValue,
      },
    });
    return row;
  });
}

/**
 * Platform sale fee in basis points. Production refuses to allocate customer money until an
 * Admin configures it explicitly (0 is a valid explicit value).
 */
export async function saleFeeBasisPoints(): Promise<number> {
  const v = await getSetting<{ basisPoints: number }>(SettingKey.SALE_FEE_BPS);
  if (v && Number.isInteger(v.basisPoints)) return v.basisPoints;
  if (isProduction()) {
    // A plain Error surfaced as a 500; this is a configuration problem the caller
    // can act on, so answer with a 409 instead.
    conflict("Platform sale fee is not configured. Ask a platform Admin to set it in Settings.");
  }
  return 0;
}

export async function withdrawalFeeTzs(): Promise<bigint> {
  const v = await getSetting<{ fixedTzs: number }>(SettingKey.WITHDRAWAL_FEE_TZS);
  if (v && Number.isInteger(v.fixedTzs)) return BigInt(v.fixedTzs);
  if (isProduction()) {
    conflict("Platform withdrawal fee is not configured. Ask a platform Admin to set it in Settings.");
  }
  return 0n;
}

// ───────────────────────────── Admin settings board ──────────────────────────

/** The two settings this screen owns, in the order they are applied in a sale. */
export const PLATFORM_SETTING_KEYS = [SettingKey.SALE_FEE_BPS, SettingKey.WITHDRAWAL_FEE_TZS] as const;

const THIRTY_DAYS_MS = 30 * 24 * 3_600_000;

/**
 * A setting's stored value plus who touched it last, or null when it has never
 * been set.
 *
 * `configured: false` is not the same as a zero fee: in production an unset fee
 * stops sales dead, so the board has to distinguish "deliberately zero" from
 * "nobody has decided yet". That is the single most important thing on this page.
 */
type SettingView<T> = {
  value: T | null;
  configured: boolean;
  version: number;
  updatedAt: Date | null;
  updatedBy: { name: string; email: string } | null;
};

async function readSetting<T>(key: string): Promise<SettingView<T>> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return { value: null, configured: false, version: 0, updatedAt: null, updatedBy: null };

  const actor = row.updatedBy
    ? await prisma.user.findUnique({ where: { id: row.updatedBy }, select: { name: true, email: true } })
    : null;

  return {
    value: row.value as T,
    configured: true,
    version: row.version,
    updatedAt: row.updatedAt,
    updatedBy: actor,
  };
}

/**
 * Everything the settings screen needs to make a fee decision, in one round trip.
 *
 * A fee is only meaningful against the volume it applies to, so this returns the
 * real sale and withdrawal volume alongside it. Otherwise an operator is editing
 * a percentage with no idea whether it moves TZS 500 or TZS 5,000,000.
 */
export async function settingsOverview() {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);

  const [
    sale,
    withdrawal,
    history,
    sales30d,
    salesAllTime,
    withdrawals30d,
    withdrawalsAllTime,
    saleFees30d,
    saleFeesAllTime,
    withdrawalFees30d,
    withdrawalFeesAllTime,
  ] = await Promise.all([
    readSetting<{ basisPoints: number }>(SettingKey.SALE_FEE_BPS),
    readSetting<{ fixedTzs: number }>(SettingKey.WITHDRAWAL_FEE_TZS),
    prisma.auditEvent.findMany({
      where: { action: "setting.updated", targetId: { in: [...PLATFORM_SETTING_KEYS] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { actor: { select: { name: true, email: true } } },
    }),
    // Guest sales the fee was actually charged on.
    prisma.paymentAttempt.aggregate({
      where: { state: "COMPLETED", order: { purpose: "WIFI_PACKAGE" }, createdAt: { gte: since } },
      _count: true,
      _sum: { amountReceivedTzs: true },
    }),
    prisma.paymentAttempt.aggregate({
      where: { state: "COMPLETED", order: { purpose: "WIFI_PACKAGE" } },
      _count: true,
      _sum: { amountReceivedTzs: true },
    }),
    prisma.withdrawal.aggregate({
      where: { createdAt: { gte: since } },
      _count: true,
      _sum: { amountTzs: true, platformFeeTzs: true },
    }),
    prisma.withdrawal.aggregate({
      _count: true,
      _sum: { amountTzs: true, platformFeeTzs: true },
    }),
    // Fee revenue as the ledger recorded it, which is the only number that
    // cannot disagree with the books.
    prisma.journalLine.aggregate({
      where: { account: { type: "PLATFORM_SALE_FEE_REVENUE" }, journal: { createdAt: { gte: since } } },
      _sum: { creditTzs: true },
    }),
    prisma.journalLine.aggregate({
      where: { account: { type: "PLATFORM_SALE_FEE_REVENUE" } },
      _sum: { creditTzs: true },
    }),
    prisma.journalLine.aggregate({
      where: { account: { type: "PLATFORM_WITHDRAWAL_FEE_REVENUE" }, journal: { createdAt: { gte: since } } },
      _sum: { creditTzs: true },
    }),
    prisma.journalLine.aggregate({
      where: { account: { type: "PLATFORM_WITHDRAWAL_FEE_REVENUE" } },
      _sum: { creditTzs: true },
    }),
  ]);

  const sales30dCount = sales30d._count;
  const sales30dGross = sales30d._sum.amountReceivedTzs ?? 0n;
  /** The ticket a fee change is actually judged against. */
  const averageTicketTzs = sales30dCount > 0 ? sales30dGross / BigInt(sales30dCount) : 0n;

  const withdrawals30dCount = withdrawals30d._count;
  const withdrawals30dAmount = withdrawals30d._sum.amountTzs ?? 0n;
  /** The payout a withdrawal-fee change is judged against. */
  const averagePayoutTzs = withdrawals30dCount > 0 ? withdrawals30dAmount / BigInt(withdrawals30dCount) : 0n;

  return {
    fees: {
      sale: {
        ...sale,
        /** Percent form, for the copy. The stored value stays basis points. */
        percent: sale.value ? sale.value.basisPoints / 100 : null,
        /** The bound the API enforces, echoed so the form cannot propose an invalid value. */
        maxBasisPoints: 5000,
      },
      withdrawal,
    },
    history: history.map((row) => ({
      id: row.id,
      key: row.targetId ?? "",
      at: row.createdAt,
      reason: row.reason,
      actor: row.actor,
      before: (row.metadata as { before?: unknown } | null)?.before ?? null,
      after: (row.metadata as { after?: unknown } | null)?.after ?? null,
    })),
    volume: {
      sales: {
        count30d: sales30dCount,
        gross30dTzs: sales30dGross,
        countAllTime: salesAllTime._count,
        grossAllTimeTzs: salesAllTime._sum.amountReceivedTzs ?? 0n,
        averageTicketTzs,
      },
      withdrawals: {
        count30d: withdrawals30dCount,
        amount30dTzs: withdrawals30dAmount,
        fee30dTzs: withdrawals30d._sum.platformFeeTzs ?? 0n,
        countAllTime: withdrawalsAllTime._count,
        amountAllTimeTzs: withdrawalsAllTime._sum.amountTzs ?? 0n,
        feeAllTimeTzs: withdrawalsAllTime._sum.platformFeeTzs ?? 0n,
        averagePayoutTzs,
      },
    },
    revenue: {
      saleFee30dTzs: saleFees30d._sum.creditTzs ?? 0n,
      saleFeeAllTimeTzs: saleFeesAllTime._sum.creditTzs ?? 0n,
      withdrawalFee30dTzs: withdrawalFees30d._sum.creditTzs ?? 0n,
      withdrawalFeeAllTimeTzs: withdrawalFeesAllTime._sum.creditTzs ?? 0n,
    },
    /** Either fee unset is a production outage waiting to happen. */
    unconfigured: [
      ...(sale.configured ? [] : ["saleFee"]),
      ...(withdrawal.configured ? [] : ["withdrawalFee"]),
    ],
  };
}
