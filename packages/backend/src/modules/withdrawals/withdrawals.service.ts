import { randomInt } from "node:crypto";
import { ErrorCode } from "@advo/contracts";
import { prisma, type BeneficiaryType, type Prisma, type WithdrawalState } from "@advo/db";
import { SNIPPE_MIN_PAYOUT_TZS } from "@advo/payments";
import { countByState, countStates, sumByState, sumStates } from "../../common/aggregate.js";
import { hashToken } from "../../common/crypto.js";
import { badRequest, conflict, isUniqueViolation, notFound, unprocessable } from "../../common/errors.js";
import { audit, emitOutbox, OutboxEventType } from "../../common/events.js";
import { getPaymentProvider, isProduction } from "../../common/providers.js";
import {
  accountBalance,
  agentAccount,
  lockAccount,
  postJournal,
  resellerAccount,
  type AccountRef,
} from "../ledger/ledger.service.js";
import { withdrawalFeeTzs } from "../settings/settings.service.js";
import { FakeNotificationProvider } from "../notifications/notification.provider.js";

type Tx = Prisma.TransactionClient;
const notifications = new FakeNotificationProvider();

export type Beneficiary = { type: BeneficiaryType; id: string; userId: string };

export function sourceAccount(b: { type: BeneficiaryType; id: string }): AccountRef {
  return b.type === "RESELLER"
    ? resellerAccount(b.id, "RESELLER_PAYABLE")
    : agentAccount(b.id, "AGENT_AVAILABLE_PAYABLE");
}

export function reserveAccount(b: { type: BeneficiaryType; id: string }): AccountRef {
  return b.type === "RESELLER"
    ? resellerAccount(b.id, "WITHDRAWAL_RESERVE")
    : agentAccount(b.id, "WITHDRAWAL_RESERVE");
}

// ───────────────────────────── Destinations ─────────────────────────────

export async function listDestinations(b: Beneficiary) {
  return prisma.payoutDestination.findMany({
    where: { ownerType: b.type, ownerId: b.id, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function createDestination(b: Beneficiary, input: { recipientName: string; phone: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: b.userId } });
  if (!user.emailVerifiedAt) badRequest("Verify your account contact before adding a payout destination");
  const code = String(randomInt(100000, 1000000));
  const created = await prisma.$transaction(async (tx) => {
    const dest = await tx.payoutDestination.create({
      data: { ownerType: b.type, ownerId: b.id, recipientName: input.recipientName, phone: input.phone },
    });
    await tx.verificationToken.create({
      data: {
        userId: b.userId,
        purpose: "PAYOUT_DESTINATION",
        subject: dest.id,
        tokenHash: hashToken(`${dest.id}:${code}`),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    await audit(tx, { actorUserId: b.userId, action: "payout_destination.created", targetType: "PayoutDestination", targetId: dest.id });
    return dest;
  });
  const sent = await notifications.send({ channel: "sms", to: input.phone, body: `Advo TZ payout destination code: ${code}` });
  return {
    destination: created,
    verificationRequired: true,
    notificationSimulated: sent.simulated,
    ...(!isProduction() ? { devVerificationCode: code } : {}),
  };
}

export async function verifyDestination(b: Beneficiary, destinationId: string, code: string) {
  const dest = await prisma.payoutDestination.findFirst({ where: { id: destinationId, ownerType: b.type, ownerId: b.id } });
  if (!dest) notFound();
  const token = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(`${destinationId}:${code}`) } });
  if (!token || token.purpose !== "PAYOUT_DESTINATION" || token.usedAt || token.expiresAt < new Date() || token.userId !== b.userId) {
    badRequest("Invalid or expired verification code");
  }
  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
    prisma.payoutDestination.update({ where: { id: destinationId }, data: { verifiedAt: new Date() } }),
  ]);
  return { verified: true };
}

export async function archiveDestination(b: Beneficiary, destinationId: string) {
  const res = await prisma.payoutDestination.updateMany({
    where: { id: destinationId, ownerType: b.type, ownerId: b.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (res.count === 0) notFound();
  return { archived: true };
}

// ───────────────────────────── Quotes and requests ──────────────────────

export async function quoteWithdrawal(b: Beneficiary, destinationId: string, amountTzs: bigint) {
  const dest = await prisma.payoutDestination.findFirst({
    where: { id: destinationId, ownerType: b.type, ownerId: b.id, archivedAt: null },
  });
  if (!dest) notFound("Payout destination not found");
  if (!dest.verifiedAt) badRequest("Payout destination is not verified");
  if (amountTzs < BigInt(SNIPPE_MIN_PAYOUT_TZS)) {
    badRequest(`Minimum payout is TZS ${SNIPPE_MIN_PAYOUT_TZS}`);
  }
  const provider = getPaymentProvider();
  const quote = await provider.quotePayoutFee(Number(amountTzs));
  if (!Number.isSafeInteger(quote.feeTzs) || quote.feeTzs < 0) {
    // BigInt() on a fractional/NaN fee would throw a RangeError and surface as a 500.
    unprocessable("The payment provider returned an invalid payout fee. Try again later.", ErrorCode.PAYOUT_NEEDS_REVIEW);
  }
  const providerFee = BigInt(quote.feeTzs);
  const platformFee = await withdrawalFeeTzs();
  const total = amountTzs + providerFee + platformFee;
  const available = await accountBalance(prisma, sourceAccount(b));
  return {
    destination: { id: dest.id, recipientName: dest.recipientName, phone: maskPhone(dest.phone) },
    amountTzs,
    providerFeeTzs: providerFee,
    platformFeeTzs: platformFee,
    totalDebitTzs: total,
    availableTzs: available,
    sufficient: available >= total,
    provider: provider.name,
    quotedAt: new Date().toISOString(),
  };
}

export async function requestWithdrawal(b: Beneficiary, input: { destinationId: string; amountTzs: bigint; idempotencyKey: string }) {
  const existing = await prisma.withdrawal.findUnique({
    where: { ownerType_ownerId_requestIdempotencyKey: { ownerType: b.type, ownerId: b.id, requestIdempotencyKey: input.idempotencyKey } },
  });
  if (existing) return existing;

  const quote = await quoteWithdrawal(b, input.destinationId, input.amountTzs);
  const dest = await prisma.payoutDestination.findFirstOrThrow({
    where: { id: input.destinationId, ownerType: b.type, ownerId: b.id },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAccount(tx, sourceAccount(b));
      const available = await accountBalance(tx, sourceAccount(b));
      if (available < quote.totalDebitTzs) {
        unprocessable(`Available TZS ${available} is less than the total debit TZS ${quote.totalDebitTzs}`, ErrorCode.INSUFFICIENT_BALANCE);
      }
      const withdrawal = await tx.withdrawal.create({
        data: {
          ownerType: b.type,
          ownerId: b.id,
          destinationId: dest.id,
          destinationSnapshot: { recipientName: dest.recipientName, phone: dest.phone, verifiedAt: dest.verifiedAt },
          amountTzs: quote.amountTzs,
          providerFeeTzs: quote.providerFeeTzs,
          platformFeeTzs: quote.platformFeeTzs,
          totalDebitTzs: quote.totalDebitTzs,
          feeQuoteSnapshot: {
            provider: quote.provider,
            providerFeeTzs: quote.providerFeeTzs.toString(),
            platformFeeTzs: quote.platformFeeTzs.toString(),
            quotedAt: quote.quotedAt,
          },
          quotedAt: new Date(quote.quotedAt),
          requestIdempotencyKey: input.idempotencyKey,
        },
      });
      await postJournal(tx, {
        sourceKey: `withdrawal-reserve:${withdrawal.id}`,
        sourceType: "withdrawal_reserve",
        description: `Reserve for withdrawal ${withdrawal.id}`,
        actorUserId: b.userId,
        lines: [
          { account: sourceAccount(b), debit: quote.totalDebitTzs },
          { account: reserveAccount(b), credit: quote.totalDebitTzs },
        ],
      });
      if (b.type === "AGENT") await allocateAccruals(tx, b.id, withdrawal.id, quote.totalDebitTzs);
      await audit(tx, { actorUserId: b.userId, action: "withdrawal.requested", targetType: "Withdrawal", targetId: withdrawal.id });
      return withdrawal;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      conflict("You already have a withdrawal in progress. Wait for it to finish before requesting another.");
    }
    throw err;
  }
}

/** FIFO allocation of an Agent reserve across available accruals (supports partial withdrawals). */
async function allocateAccruals(tx: Tx, agentId: string, withdrawalId: string, total: bigint) {
  const accruals = await tx.commissionAccrual.findMany({
    where: { agentId, state: { in: ["AVAILABLE", "RESERVED_FOR_WITHDRAWAL"] } },
    orderBy: { createdAt: "asc" },
  });
  let remaining = total;
  for (const a of accruals) {
    if (remaining === 0n) break;
    const free = a.amountTzs - a.reservedTzs - a.paidTzs - a.reversedTzs;
    if (free <= 0n) continue;
    const take = free < remaining ? free : remaining;
    await tx.withdrawalAllocation.create({ data: { withdrawalId, accrualId: a.id, amountTzs: take } });
    const reserved = a.reservedTzs + take;
    await tx.commissionAccrual.update({
      where: { id: a.id },
      data: {
        reservedTzs: reserved,
        state: reserved + a.paidTzs + a.reversedTzs >= a.amountTzs ? "RESERVED_FOR_WITHDRAWAL" : "AVAILABLE",
      },
    });
    remaining -= take;
  }
  if (remaining > 0n) {
    throw new Error("Available commission ledger balance exceeds allocatable accruals — needs reconciliation");
  }
}

export async function releaseAllocations(tx: Tx, withdrawalId: string, as: "released" | "paid") {
  const allocations = await tx.withdrawalAllocation.findMany({ where: { withdrawalId, state: "reserved" } });
  for (const alloc of allocations) {
    if (!alloc.accrualId) continue;
    const a = await tx.commissionAccrual.findUniqueOrThrow({ where: { id: alloc.accrualId } });
    const reserved = a.reservedTzs - alloc.amountTzs;
    const paid = as === "paid" ? a.paidTzs + alloc.amountTzs : a.paidTzs;
    const done = paid + a.reversedTzs >= a.amountTzs;
    await tx.commissionAccrual.update({
      where: { id: a.id },
      data: {
        reservedTzs: reserved,
        paidTzs: paid,
        state: done ? "PAID" : reserved > 0n ? "RESERVED_FOR_WITHDRAWAL" : "AVAILABLE",
      },
    });
    await tx.withdrawalAllocation.update({ where: { id: alloc.id }, data: { state: as } });
  }
}

export async function listWithdrawals(filter: { ownerType?: BeneficiaryType; ownerId?: string; state?: WithdrawalState }) {
  return prisma.withdrawal.findMany({
    where: {
      ownerType: filter.ownerType,
      ownerId: filter.ownerId,
      state: filter.state,
    },
    include: { attempts: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ───────────────────────────── Admin review ─────────────────────────────

/**
 * The admin board needs the beneficiary behind each request, but `ownerType` /
 * `ownerId` are polymorphic so Prisma cannot join them. Fetch both sides in one
 * round trip and stitch by `type:id`, so the list stays two queries regardless
 * of how many rows come back.
 */
export async function attachOwners<T extends { ownerType: BeneficiaryType; ownerId: string }>(rows: T[]) {
  const resellerIds = [...new Set(rows.filter((r) => r.ownerType === "RESELLER").map((r) => r.ownerId))];
  const agentIds = [...new Set(rows.filter((r) => r.ownerType === "AGENT").map((r) => r.ownerId))];

  const [resellers, agents] = await Promise.all([
    prisma.reseller.findMany({
      where: { id: { in: resellerIds } },
      select: { id: true, businessName: true, slug: true, status: true, owner: { select: { name: true, phone: true } } },
    }),
    prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, referralCode: true, status: true, user: { select: { name: true, phone: true } } },
    }),
  ]);

  const owners = new Map<string, { type: BeneficiaryType; name: string; handle: string; status: string; contact: string | null }>();
  for (const r of resellers) {
    owners.set(`RESELLER:${r.id}`, { type: "RESELLER", name: r.businessName, handle: r.slug, status: r.status, contact: r.owner.phone });
  }
  for (const a of agents) {
    owners.set(`AGENT:${a.id}`, { type: "AGENT", name: a.user.name, handle: a.referralCode, status: a.status, contact: a.user.phone });
  }

  return rows.map((row) => ({ ...row, owner: owners.get(`${row.ownerType}:${row.ownerId}`) ?? null }));
}

/**
 * Everything the admin board renders for one row: the decision trail, the payout
 * attempts (with their provider references so an operator can search the
 * provider's own dashboard) and whether the Agent accrual allocations were
 * reserved, released or paid.
 */
export async function listWithdrawalsForAdmin(filter: {
  state?: WithdrawalState;
  ownerType?: BeneficiaryType;
  ownerId?: string;
}) {
  const rows = await prisma.withdrawal.findMany({
    where: { state: filter.state, ownerType: filter.ownerType, ownerId: filter.ownerId },
    include: {
      attempts: { orderBy: { createdAt: "desc" } },
      allocations: { select: { id: true, amountTzs: true, state: true } },
      destination: { select: { id: true, verifiedAt: true, archivedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return attachOwners(rows);
}

/** Latest attempt for a request, plus the provider fee it actually settled at. */
export async function withdrawalDetail(withdrawalId: string) {
  const row = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    include: { attempts: { orderBy: { createdAt: "desc" } }, allocations: true },
  });
  if (!row) notFound();
  const [withOwner] = await attachOwners([row]);
  return withOwner;
}

export async function reviewWithdrawal(adminUserId: string, withdrawalId: string, decision: "approve" | "reject", reason: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Withdrawal" WHERE id = ${withdrawalId}::uuid FOR UPDATE`;
    const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w) notFound();
    if (w.state !== "REQUESTED") conflict(`Withdrawal is ${w.state}; only REQUESTED can be reviewed`);

    if (decision === "approve") {
      const updated = await tx.withdrawal.update({
        where: { id: w.id },
        data: { state: "APPROVED", reviewedBy: adminUserId, reviewedAt: new Date(), reviewReason: reason },
      });
      await emitOutbox(tx, OutboxEventType.WITHDRAWAL_APPROVED, "Withdrawal", w.id, { withdrawalId: w.id });
      await audit(tx, { actorUserId: adminUserId, action: "withdrawal.approved", targetType: "Withdrawal", targetId: w.id, reason });
      return updated;
    }

    const b = { type: w.ownerType, id: w.ownerId };
    await postJournal(tx, {
      sourceKey: `withdrawal-release:${w.id}`,
      sourceType: "withdrawal_release",
      description: `Rejected withdrawal ${w.id}`,
      actorUserId: adminUserId,
      lines: [
        { account: reserveAccount(b), debit: w.totalDebitTzs },
        { account: sourceAccount(b), credit: w.totalDebitTzs },
      ],
    });
    await releaseAllocations(tx, w.id, "released");
    const updated = await tx.withdrawal.update({
      where: { id: w.id },
      data: { state: "REJECTED", reviewedBy: adminUserId, reviewedAt: new Date(), reviewReason: reason },
    });
    await audit(tx, { actorUserId: adminUserId, action: "withdrawal.rejected", targetType: "Withdrawal", targetId: w.id, reason });
    return updated;
  });
}

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 6)}***${phone.slice(-2)}` : "***";
}

// ───────────────────────────── Admin board ──────────────────────────────
/** States where the money has left the beneficiary's balance but no payout has settled. */
const RESERVED_STATES = ["REQUESTED", "APPROVED", "PROCESSING", "UNKNOWN"] as const;
/** States where the reserve came back to the beneficiary. */
const RELEASED_STATES = ["FAILED", "REJECTED"] as const;
/** Attempt states that a reconcile lookup can still move. */
export const OPEN_ATTEMPT_STATES = ["CREATED", "DISPATCHING", "PENDING", "UNKNOWN"] as const;
/** Snippe keeps idempotency keys for 24h; past that a stuck attempt needs a human. */
const PROVIDER_KEY_WINDOW_MS = 23 * 60 * 60 * 1000;

/**
 * The counts and money behind the admin withdrawals board.
 *
 * Aggregated with `groupBy`/`_sum` rather than by folding the 100 rows the list
 * endpoint returns, so a truncated or filtered list can never misstate a total.
 * The three numbers an operator acts on are separated on purpose: money still
 * reserved (nothing has left the platform yet), money that actually left
 * (`COMPLETED`), and money the reserve released back because the payout never
 * happened. Adding those together would flatter the payout volume.
 */
export async function withdrawalsSummary() {
  const [states, stateAmounts, owners, attemptsByState, completedAttempts, allocations, oldestWaiting, latest] = await Promise.all([
    prisma.withdrawal.groupBy({ by: ["state"], _count: true }),
    prisma.withdrawal.groupBy({
      by: ["state"],
      _sum: { amountTzs: true, providerFeeTzs: true, platformFeeTzs: true, totalDebitTzs: true },
    }),
    prisma.withdrawal.groupBy({ by: ["ownerType"], _count: true, _sum: { amountTzs: true, totalDebitTzs: true } }),
    prisma.payoutAttempt.groupBy({ by: ["state"], _count: true }),
    prisma.payoutAttempt.aggregate({ where: { state: "COMPLETED" }, _sum: { feeTzs: true } }),
    prisma.withdrawalAllocation.groupBy({ by: ["state"], _count: true, _sum: { amountTzs: true } }),
    pluckOldestWaiting(),
    prisma.withdrawal.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  const counts = countByState(states, "state");
  const amount = sumByState(stateAmounts, "state", "amountTzs");
  const providerFee = sumByState(stateAmounts, "state", "providerFeeTzs");
  const platformFee = sumByState(stateAmounts, "state", "platformFeeTzs");
  const debit = sumByState(stateAmounts, "state", "totalDebitTzs");
  const attempts = countByState(attemptsByState, "state");

  const completed = counts.COMPLETED ?? 0;
  const paidOut = amount.COMPLETED ?? 0n;
  const allAmount = sumStates(amount, Object.keys(amount));

  // A payout that sat past the provider's idempotency window cannot be safely retried.
  const stale = await prisma.payoutAttempt.count({
    where: {
      state: { in: [...OPEN_ATTEMPT_STATES] },
      providerReference: null,
      createdAt: { lt: new Date(Date.now() - PROVIDER_KEY_WINDOW_MS) },
    },
  });

  const quotedFeeOnCompleted = providerFee.COMPLETED ?? 0n;
  const actualFeeOnCompleted = completedAttempts._sum.feeTzs ?? 0n;

  return {
    requests: {
      total: states.reduce((sum, row) => sum + row._count, 0),
      byState: counts,
      amountByState: amount,
      awaitingDecision: counts.REQUESTED ?? 0,
      awaitingAmountTzs: amount.REQUESTED ?? 0n,
      inFlight: countStates(counts, ["APPROVED", "PROCESSING", "UNKNOWN"]),
      inFlightAmountTzs: sumStates(amount, ["APPROVED", "PROCESSING", "UNKNOWN"]),
      completed,
      completedAmountTzs: paidOut,
      failed: counts.FAILED ?? 0,
      rejected: counts.REJECTED ?? 0,
      reversed: counts.REVERSED ?? 0,
      needsReview: counts.NEEDS_REVIEW ?? 0,
      /** Largest single payout ever approved, so an outlier is obvious on the board. */
      averagePayoutTzs: completed > 0 ? paidOut / BigInt(completed) : 0n,
      oldestWaitingAt: oldestWaiting,
      oldestWaitingHours: oldestWaiting ? Math.floor((Date.now() - oldestWaiting.getTime()) / 3_600_000) : null,
    },
    reserve: {
      /** Still committed to a payout that has not settled. */
      heldCount: countStates(counts, RESERVED_STATES),
      heldTzs: sumStates(debit, RESERVED_STATES),
      /** Put back on the beneficiary's balance because the payout did not happen. */
      releasedCount: countStates(counts, RELEASED_STATES),
      releasedTzs: sumStates(debit, RELEASED_STATES),
      /** Everything ever quoted, including what never left. */
      committedTzs: allAmount,
    },
    money: {
      totalDebitTzs: sumStates(debit, ["COMPLETED"]),
      paidOutTzs: paidOut,
      providerFeesTzs: quotedFeeOnCompleted,
      platformFeesTzs: platformFee.COMPLETED ?? 0n,
      /** Positive when the provider charged more than quoted — the platform absorbed it. */
      feeVarianceTzs: actualFeeOnCompleted - quotedFeeOnCompleted,
      /** Share of the total debit that was the beneficiary's own principal. */
      principalSharePct: (debit.COMPLETED ?? 0n) > 0n ? Number((paidOut * 100n) / (debit.COMPLETED ?? 1n)) : 0,
    },
    beneficiaries: owners
      .map((row) => ({
        ownerType: row.ownerType,
        count: row._count,
        amountTzs: row._sum.amountTzs ?? 0n,
        debitTzs: row._sum.totalDebitTzs ?? 0n,
      }))
      .sort((a, b) => b.count - a.count),
    payouts: {
      total: attemptsByState.reduce((sum, row) => sum + row._count, 0),
      byState: attempts,
      open: countStates(attempts, OPEN_ATTEMPT_STATES),
      failed: attempts.FAILED ?? 0,
      reversed: attempts.REVERSED ?? 0,
      stale,
    },
    allocations: {
      total: allocations.reduce((sum, row) => sum + row._count, 0),
      byState: countByState(allocations, "state"),
      amountTzs: allocations.reduce((sum, row) => sum + (row._sum.amountTzs ?? 0n), 0n),
    },
    /** The queue that actually wants a human: a decision, a stuck payout, or a stale attempt. */
    attention: (counts.REQUESTED ?? 0) + (counts.NEEDS_REVIEW ?? 0) + (counts.UNKNOWN ?? 0) + stale,
    lastActivityAt: latest?.updatedAt ?? null,
  };
}

/** Kept separate so the summary's `Promise.all` stays a flat list of queries. */
function pluckOldestWaiting() {
  return prisma.withdrawal
    .findFirst({ where: { state: "REQUESTED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })
    .then((row) => row?.createdAt ?? null);
}


