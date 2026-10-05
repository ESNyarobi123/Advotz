import { prisma, type Prisma } from "@advo/db";
import { PaymentProviderError, type MobilePayoutRequest } from "@advo/payments";
import { compactIdempotencyKey, sha256Hex, stableStringify } from "../../common/crypto.js";
import { audit, emitOutbox, OutboxEventType } from "../../common/events.js";
import { getPaymentProvider, webhookUrl } from "../../common/providers.js";
import { platformAccount, postJournal, type PostingLine } from "../ledger/ledger.service.js";
import { releaseAllocations, reserveAccount, sourceAccount } from "./withdrawals.service.js";

const QUOTE_MAX_AGE_MS = 30 * 60 * 1000;
const PROVIDER_KEY_WINDOW_MS = 23 * 60 * 60 * 1000;

/**
 * Worker: dispatch an APPROVED withdrawal. Revalidates destination and fees; persists the
 * PayoutAttempt (stable key + exact request) before calling the provider.
 */
export async function dispatchWithdrawal(withdrawalId: string): Promise<string> {
  const provider = getPaymentProvider();
  const prepared = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Withdrawal" WHERE id = ${withdrawalId}::uuid FOR UPDATE`;
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { destination: true } });
    if (w.state !== "APPROVED") return null;
    const existing = await tx.payoutAttempt.findFirst({ where: { withdrawalId, state: { notIn: ["FAILED"] } } });
    if (existing) return { attemptId: existing.id, w };

    if (w.destination.archivedAt || !w.destination.verifiedAt) {
      await tx.withdrawal.update({ where: { id: w.id }, data: { state: "NEEDS_REVIEW", failureReason: "Destination no longer verified/active" } });
      return null;
    }
    return { attemptId: null as string | null, w };
  });
  if (!prepared) return "not_dispatchable";

  let attemptId = prepared.attemptId;
  if (!attemptId) {
    const w = prepared.w;
    if (Date.now() - w.quotedAt.getTime() > QUOTE_MAX_AGE_MS) {
      const fresh = await provider.quotePayoutFee(Number(w.amountTzs));
      if (BigInt(fresh.feeTzs) > w.providerFeeTzs) {
        await prisma.withdrawal.update({
          where: { id: w.id },
          data: {
            state: "NEEDS_REVIEW",
            failureReason: `Provider fee rose from TZS ${w.providerFeeTzs} to TZS ${fresh.feeTzs}; new approval required`,
          },
        });
        return "fee_increase_needs_review";
      }
    }
    const snapshot = w.destinationSnapshot as { recipientName: string; phone: string };
    const request: MobilePayoutRequest = {
      amountTzs: Number(w.amountTzs),
      phoneNumber: snapshot.phone,
      recipientName: snapshot.recipientName,
      narration: "Advo TZ payout",
      webhookUrl: webhookUrl(),
      metadata: { withdrawalId: w.id },
    };
    const attempt = await prisma.$transaction(async (tx) => {
      const a = await tx.payoutAttempt.create({
        data: {
          withdrawalId: w.id,
          provider: provider.name,
          providerAccountId: provider.accountId,
          idempotencyKey: compactIdempotencyKey("w"),
          requestPayload: request as unknown as Prisma.InputJsonValue,
          requestHash: sha256Hex(stableStringify(request)),
          state: "CREATED",
        },
      });
      await tx.withdrawal.update({ where: { id: w.id }, data: { state: "PROCESSING" } });
      return a;
    });
    attemptId = attempt.id;
  }
  return sendPayoutAttempt(attemptId);
}

async function sendPayoutAttempt(attemptId: string): Promise<string> {
  const claimed = await prisma.payoutAttempt.updateMany({
    where: { id: attemptId, state: { in: ["CREATED", "UNKNOWN"] }, providerReference: null },
    data: { state: "DISPATCHING" },
  });
  if (claimed.count === 0) return "already_dispatched";
  const attempt = await prisma.payoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const provider = getPaymentProvider();
  try {
    const result = await provider.sendMobilePayout(attempt.requestPayload as unknown as MobilePayoutRequest, attempt.idempotencyKey);
    await prisma.payoutAttempt.update({
      where: { id: attemptId },
      data: { providerReference: result.reference, state: "PENDING", lastError: null },
    });
    if (result.status !== "pending") {
      return applyPayoutOutcome({
        providerAccountId: attempt.providerAccountId,
        reference: result.reference,
        status: result.status,
        feeTzs: result.feeTzs !== undefined ? BigInt(result.feeTzs) : undefined,
        failureReason: result.failureReason,
      });
    }
    return "pending";
  } catch (err) {
    const e = err instanceof PaymentProviderError ? err : new PaymentProviderError(String(err), "unknown", true);
    if (e.ambiguous) {
      // Never retry an uncertain payout with a new key; the reserve stays in place.
      await prisma.$transaction(async (tx) => {
        await tx.payoutAttempt.update({ where: { id: attemptId }, data: { state: "UNKNOWN", lastError: `${e.kind}: ${e.message}`.slice(0, 500) } });
        await tx.withdrawal.update({ where: { id: attempt.withdrawalId }, data: { state: "UNKNOWN" } });
        await emitOutbox(tx, OutboxEventType.PAYOUT_RECONCILE, "PayoutAttempt", attemptId, { attemptId });
      });
      return "unknown";
    }
    await prisma.payoutAttempt.update({ where: { id: attemptId }, data: { state: "FAILED", lastError: `${e.kind}: ${e.message}`.slice(0, 500) } });
    await finalizeFailure(attempt.withdrawalId, attemptId, `Provider rejected payout: ${e.message}`);
    return "failed";
  }
}

/**
 * Operator-triggered reconciliation from the admin board.
 *
 * Asks the provider for the truth about the newest attempt instead of letting an
 * operator guess, which is the same contract the payments screen uses. Nothing is
 * mutated when the provider cannot answer — the attempt stays where it is and the
 * caller reports the outcome verbatim.
 */
export async function reconcileWithdrawal(withdrawalId: string): Promise<string> {
  const attempt = await prisma.payoutAttempt.findFirst({
    where: { withdrawalId },
    orderBy: { createdAt: "desc" },
    select: { id: true, state: true },
  });
  if (!attempt) return "no_attempt";
  if (!["CREATED", "DISPATCHING", "PENDING", "UNKNOWN"].includes(attempt.state)) return attempt.state;
  return reconcilePayoutAttempt(attempt.id);
}

export async function reconcilePayoutAttempt(attemptId: string): Promise<string> {  const attempt = await prisma.payoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (!["PENDING", "UNKNOWN", "DISPATCHING"].includes(attempt.state)) return attempt.state;
  if (!attempt.providerReference) {
    if (Date.now() - attempt.createdAt.getTime() < PROVIDER_KEY_WINDOW_MS) {
      await prisma.payoutAttempt.update({ where: { id: attemptId }, data: { state: "UNKNOWN" } });
      return sendPayoutAttempt(attemptId);
    }
    await prisma.withdrawal.update({
      where: { id: attempt.withdrawalId },
      data: { state: "NEEDS_REVIEW", failureReason: "Payout outcome unknown beyond provider idempotency window" },
    });
    return "needs_review";
  }
  const truth = await getPaymentProvider().getPayout(attempt.providerReference);
  await prisma.payoutAttempt.update({ where: { id: attemptId }, data: { lastCheckedAt: new Date() } });
  return applyPayoutOutcome({
    providerAccountId: attempt.providerAccountId,
    reference: truth.reference,
    status: truth.status,
    feeTzs: truth.feeTzs !== undefined ? BigInt(truth.feeTzs) : undefined,
    failureReason: truth.failureReason,
  });
}

/** Single place where payout truth changes money state. Idempotent per attempt and outcome. */
export async function applyPayoutOutcome(input: {
  providerAccountId: string;
  reference: string;
  status: string;
  feeTzs?: bigint;
  failureReason?: string;
}): Promise<string> {
  const attempt = await prisma.payoutAttempt.findUnique({
    where: { providerAccountId_providerReference: { providerAccountId: input.providerAccountId, providerReference: input.reference } },
  });
  if (!attempt) return "unmatched";
  if (input.status === "pending") return "pending";

  if (input.status === "completed") {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Withdrawal" WHERE id = ${attempt.withdrawalId}::uuid FOR UPDATE`;
      const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: attempt.withdrawalId } });
      if (w.state === "COMPLETED" || w.state === "REVERSED") return "duplicate";
      const b = { type: w.ownerType, id: w.ownerId };
      const actualFee = input.feeTzs ?? w.providerFeeTzs;
      const quotedFee = w.providerFeeTzs;
      const lines: PostingLine[] = [
        { account: reserveAccount(b), debit: w.totalDebitTzs },
        { account: platformAccount("PROVIDER_CLEARING"), credit: w.amountTzs + actualFee },
        { account: platformAccount("PLATFORM_WITHDRAWAL_FEE_REVENUE"), credit: w.platformFeeTzs },
      ];
      if (actualFee > quotedFee) {
        // The beneficiary was never charged more than approved; the platform absorbs the difference.
        lines.push({ account: platformAccount("PROVIDER_FEE_EXPENSE"), debit: actualFee - quotedFee });
      } else if (quotedFee > actualFee) {
        lines.push({ account: sourceAccount(b), credit: quotedFee - actualFee });
      }
      await postJournal(tx, {
        sourceKey: `payout-complete:${attempt.id}`,
        sourceType: "payout_completed",
        description: `Payout completed for withdrawal ${w.id}`,
        lines,
      });
      await releaseAllocations(tx, w.id, "paid");
      await tx.payoutAttempt.update({ where: { id: attempt.id }, data: { state: "COMPLETED", feeTzs: actualFee } });
      await tx.withdrawal.update({ where: { id: w.id }, data: { state: "COMPLETED" } });
      await audit(tx, { action: "withdrawal.completed", targetType: "Withdrawal", targetId: w.id, metadata: { reference: input.reference } });
      return "completed";
    });
  }

  if (input.status === "failed") {
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: attempt.withdrawalId } });
    if (w.state === "COMPLETED") {
      await prisma.withdrawal.update({ where: { id: w.id }, data: { state: "NEEDS_REVIEW", failureReason: "Failure reported after completion" } });
      return "needs_review";
    }
    await prisma.payoutAttempt.update({ where: { id: attempt.id }, data: { state: "FAILED", lastError: input.failureReason ?? "failed" } });
    await finalizeFailure(w.id, attempt.id, input.failureReason ?? "Payout failed");
    return "failed";
  }

  if (input.status === "reversed") {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Withdrawal" WHERE id = ${attempt.withdrawalId}::uuid FOR UPDATE`;
      const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: attempt.withdrawalId } });
      if (w.state === "REVERSED") return "duplicate";
      if (w.state !== "COMPLETED") {
        await tx.withdrawal.update({ where: { id: w.id }, data: { state: "NEEDS_REVIEW", failureReason: "Reversal reported before completion" } });
        return "needs_review";
      }
      const b = { type: w.ownerType, id: w.ownerId };
      // Restore only the principal the provider returned; fees are not assumed refunded.
      await postJournal(tx, {
        sourceKey: `payout-reversed:${attempt.id}`,
        sourceType: "payout_reversed",
        description: `Payout reversed for withdrawal ${w.id}`,
        lines: [
          { account: platformAccount("PROVIDER_CLEARING"), debit: w.amountTzs },
          { account: sourceAccount(b), credit: w.amountTzs },
        ],
      });
      if (b.type === "AGENT") await restoreReversedAllocations(tx, w.id, w.amountTzs);
      await tx.payoutAttempt.update({ where: { id: attempt.id }, data: { state: "REVERSED" } });
      await tx.withdrawal.update({ where: { id: w.id }, data: { state: "REVERSED", failureReason: input.failureReason ?? "Reversed by provider" } });
      await audit(tx, { action: "withdrawal.reversed", targetType: "Withdrawal", targetId: w.id });
      return "reversed";
    });
  }
  return "ignored";
}

async function restoreReversedAllocations(tx: Prisma.TransactionClient, withdrawalId: string, returned: bigint) {
  const allocations = await tx.withdrawalAllocation.findMany({ where: { withdrawalId, state: "paid" }, orderBy: { createdAt: "asc" } });
  let remaining = returned;
  for (const alloc of allocations) {
    if (remaining === 0n || !alloc.accrualId) break;
    const give = alloc.amountTzs < remaining ? alloc.amountTzs : remaining;
    const a = await tx.commissionAccrual.findUniqueOrThrow({ where: { id: alloc.accrualId } });
    await tx.commissionAccrual.update({ where: { id: a.id }, data: { paidTzs: a.paidTzs - give, state: "AVAILABLE" } });
    remaining -= give;
  }
}

async function finalizeFailure(withdrawalId: string, attemptId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Withdrawal" WHERE id = ${withdrawalId}::uuid FOR UPDATE`;
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    if (w.state === "FAILED" || w.state === "COMPLETED") return;
    const b = { type: w.ownerType, id: w.ownerId };
    await postJournal(tx, {
      sourceKey: `payout-failed:${attemptId}`,
      sourceType: "payout_failed",
      description: `Payout failed for withdrawal ${w.id}; reserve released`,
      lines: [
        { account: reserveAccount(b), debit: w.totalDebitTzs },
        { account: sourceAccount(b), credit: w.totalDebitTzs },
      ],
    });
    await releaseAllocations(tx, w.id, "released");
    await tx.withdrawal.update({ where: { id: w.id }, data: { state: "FAILED", failureReason: reason.slice(0, 300) } });
    await audit(tx, { action: "withdrawal.failed", targetType: "Withdrawal", targetId: w.id, reason });
  });
}
