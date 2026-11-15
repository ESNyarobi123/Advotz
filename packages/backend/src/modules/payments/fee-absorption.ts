import { prisma } from "@advo/db";
import {
  platformAccount,
  postJournal,
  resellerAccount,
} from "../ledger/ledger.service.js";
import { saleFeeBasisPoints } from "../settings/settings.service.js";

/**
 * Historic receipts booked before the provider fee moved onto the platform's
 * own cost line.
 *
 * Until this change a gateway's collection fee was taken out of the Reseller's
 * share at receipt time, so a TZS 1,500 sale landed in the wallet as 1,388
 * (1,500 − 37 gateway − 75 Advo). The rule now is that the Reseller sees the
 * package price less Advo's fee, and the gateway fee is a platform expense.
 * New sales are posted that way; this module repairs the ones already booked.
 *
 * The repair is one idempotent journal per receipt — debit `PROVIDER_FEE_EXPENSE`,
 * credit `RESELLER_PAYABLE` — under source key `fee-absorption:<attemptId>`, so
 * running it twice changes nothing and the correction reads as a correction in
 * the journal rather than an edited historical posting (the table is
 * append-only).
 */

export type FeeAbsorptionRow = {
  attemptId: string;
  orderId: string;
  resellerId: string;
  businessName: string;
  grossTzs: bigint;
  providerFeeTzs: bigint;
  creditedTzs: bigint;
  expectedTzs: bigint;
  gapTzs: bigint;
};

const RESELLER_CREDIT = (lines: ReadonlyArray<{
  debitTzs: bigint;
  creditTzs: bigint;
  account: { ownerType: string };
}>) =>
  lines
    .filter((line) => line.account.ownerType === "RESELLER")
    .reduce((sum, line) => sum + line.creditTzs - line.debitTzs, 0n);

/**
 * Every completed WiFi sale whose Reseller was credited less than the package
 * price less Advo's fee, with the exact shortfall.
 *
 * `gapTzs` is capped at the provider fee that receipt actually carried: a sale
 * credited less for some other reason (a partial refund, an operator's manual
 * correction) is not something this repair should touch.
 */
export async function planFeeAbsorption(limit = 500): Promise<FeeAbsorptionRow[]> {
  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      state: "COMPLETED",
      feeTzs: { not: null },
      order: { purpose: "WIFI_PACKAGE", paymentState: { in: ["PAID", "OVERPAID"] } },
    },
    include: {
      order: {
        select: {
          id: true,
          resellerId: true,
          priceSnapshot: true,
          reseller: { select: { businessName: true } },
        },
      },
    },
    orderBy: { completedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 5_000),
  });
  if (attempts.length === 0) return [];

  const keys = attempts.flatMap((attempt) => [
    `payment:${attempt.id}`,
    `settlement:${attempt.id}`,
    `fee-absorption:${attempt.id}`,
  ]);
  const journals = await prisma.journal.findMany({
    where: { sourceKey: { in: keys } },
    include: { lines: { include: { account: true } } },
  });
  const byKey = new Map(journals.map((journal) => [journal.sourceKey, journal]));

  const fallbackBps = await saleFeeBasisPoints();
  const rows: FeeAbsorptionRow[] = [];

  for (const attempt of attempts) {
    if (byKey.has(`fee-absorption:${attempt.id}`)) continue;

    const receipt = byKey.get(`payment:${attempt.id}`);
    if (!receipt) continue;
    const gross = receipt.lines
      .filter(
        (line) =>
          line.account.type === "PROVIDER_CLEARING" && line.debitTzs > 0n,
      )
      .reduce((sum, line) => sum + line.debitTzs, 0n);
    if (gross <= 0n) continue;

    const providerFee = attempt.feeTzs ?? 0n;
    if (providerFee <= 0n) continue;

    const snapshot = attempt.order.priceSnapshot as
      | { saleFeeBasisPoints?: number }
      | null;
    const bps = BigInt(snapshot?.saleFeeBasisPoints ?? fallbackBps);
    const platformFee = (gross * bps) / 10_000n;
    const expected = gross > platformFee ? gross - platformFee : 0n;

    const settlement = byKey.get(`settlement:${attempt.id}`);
    const credited =
      RESELLER_CREDIT(receipt.lines) + (settlement ? RESELLER_CREDIT(settlement.lines) : 0n);
    if (credited >= expected) continue;

    const shortfall = expected - credited;
    const gap = shortfall > providerFee ? providerFee : shortfall;
    if (gap <= 0n) continue;

    rows.push({
      attemptId: attempt.id,
      orderId: attempt.order.id,
      resellerId: attempt.order.resellerId,
      businessName: attempt.order.reseller.businessName,
      grossTzs: gross,
      providerFeeTzs: providerFee,
      creditedTzs: credited,
      expectedTzs: expected,
      gapTzs: gap,
    });
  }

  return rows;
}

/** Books one repair journal. Returns false when it was already booked. */
export async function absorbProviderFee(row: FeeAbsorptionRow): Promise<boolean> {
  const { created } = await postJournal(prisma, {
    sourceKey: `fee-absorption:${row.attemptId}`,
    sourceType: "provider_fee_absorbed",
    description: `Provider fee absorbed for order ${row.orderId}`,
    lines: [
      { account: platformAccount("PROVIDER_FEE_EXPENSE"), debit: row.gapTzs },
      {
        account: resellerAccount(row.resellerId, "RESELLER_PAYABLE"),
        credit: row.gapTzs,
      },
    ],
  });
  return created;
}

export async function absorbProviderFees(options: {
  limit?: number;
  onRow?: (row: FeeAbsorptionRow) => void;
} = {}) {
  const rows = await planFeeAbsorption(options.limit);
  let posted = 0;
  let skipped = 0;
  for (const row of rows) {
    options.onRow?.(row);
    if (await absorbProviderFee(row)) posted += 1;
    else skipped += 1;
  }
  return { rows, posted, skipped };
}
