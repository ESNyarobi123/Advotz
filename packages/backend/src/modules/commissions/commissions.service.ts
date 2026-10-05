import { prisma, type CommissionPolicy, type CommissionState, type CommissionTrigger, type Prisma } from "@advo/db";
import { badRequest, conflict, isUniqueViolation, notFound } from "../../common/errors.js";
import { audit } from "../../common/events.js";
import { agentAccount, platformAccount, postJournal } from "../ledger/ledger.service.js";

type Tx = Prisma.TransactionClient;

/** floor(base × bps / 10000) with BigInt; bps is bounded 1..10000 by DB constraint. */
export function calculateCommission(
  policy: Pick<CommissionPolicy, "mode" | "fixedTzs" | "basisPoints" | "maxPerInvoiceTzs">,
  eligibleBaseTzs: bigint,
): bigint {
  let amount: bigint;
  if (policy.mode === "FIXED") {
    amount = policy.fixedTzs ?? 0n;
  } else {
    const bps = BigInt(policy.basisPoints ?? 0);
    if (bps < 0n || bps > 10000n) throw new Error("basisPoints out of range");
    amount = (eligibleBaseTzs * bps) / 10000n;
  }
  if (policy.maxPerInvoiceTzs !== null && policy.maxPerInvoiceTzs !== undefined && amount > policy.maxPerInvoiceTzs) {
    amount = policy.maxPerInvoiceTzs;
  }
  if (amount > eligibleBaseTzs) amount = eligibleBaseTzs;
  return amount < 0n ? 0n : amount;
}

export async function selectEffectivePolicy(
  tx: Tx | typeof prisma,
  agentId: string,
  trigger: CommissionTrigger,
  at: Date,
): Promise<CommissionPolicy | null> {
  const where = {
    trigger,
    effectiveFrom: { lte: at },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
  };
  const specific = await tx.commissionPolicy.findFirst({ where: { ...where, agentId }, orderBy: { effectiveFrom: "desc" } });
  if (specific) return specific;
  return tx.commissionPolicy.findFirst({ where: { ...where, agentId: null }, orderBy: { effectiveFrom: "desc" } });
}

export type CommissionEvaluation =
  | { result: "accrued"; accrualId: string; amountTzs: bigint }
  | { result: "duplicate" }
  | { result: "not_eligible"; reason: string };

/**
 * Evaluates one verified subscription receipt. Attribution alone, trials, failed payments
 * and WiFi sales never reach here. Unique (sourcePaymentId, agentId, trigger) stops duplicates.
 */
export async function evaluateSubscriptionCommission(invoiceId: string, paymentAttemptId: string): Promise<CommissionEvaluation> {
  try {
    return await prisma.$transaction(async (tx) => {
      const invoice = await tx.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      if (invoice.status !== "PAID" || !invoice.paidAt) return { result: "not_eligible", reason: "invoice_not_paid" } as const;
      const payment = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: paymentAttemptId } });
      if (payment.state !== "COMPLETED") return { result: "not_eligible", reason: "payment_not_completed" } as const;

      const attribution = await tx.referralAttribution.findUnique({
        where: { resellerId: invoice.resellerId },
        include: { agent: true },
      });
      if (!attribution) return { result: "not_eligible", reason: "no_attribution" } as const;
      if (attribution.agent.status !== "ACTIVE") return { result: "not_eligible", reason: "agent_not_active" } as const;
      if (attribution.expiresAt && attribution.expiresAt < invoice.paidAt) {
        return { result: "not_eligible", reason: "attribution_expired" } as const;
      }

      const trigger: CommissionTrigger = invoice.isFirstPayment ? "FIRST_SUBSCRIPTION_PAYMENT" : "SUBSCRIPTION_RENEWAL";
      const policy = await selectEffectivePolicy(tx, attribution.agentId, trigger, invoice.paidAt);
      if (!policy) return { result: "not_eligible", reason: "no_effective_policy" } as const;

      const planCode = (invoice.planSnapshot as { code?: string }).code ?? "";
      if (policy.eligiblePlanCodes.length > 0 && !policy.eligiblePlanCodes.includes(planCode)) {
        return { result: "not_eligible", reason: "plan_not_eligible" } as const;
      }
      if (policy.referralEligibilityDays) {
        const until = new Date(attribution.effectiveAt.getTime() + policy.referralEligibilityDays * 86400_000);
        if (invoice.paidAt > until) return { result: "not_eligible", reason: "referral_eligibility_elapsed" } as const;
      }

      const base = invoice.amountTzs;
      const amount = calculateCommission(policy, base);
      if (amount === 0n) return { result: "not_eligible", reason: "zero_amount" } as const;

      const availableAt = new Date(invoice.paidAt.getTime() + policy.holdDays * 86400_000);
      const accrual = await tx.commissionAccrual.create({
        data: {
          agentId: attribution.agentId,
          resellerId: invoice.resellerId,
          invoiceId: invoice.id,
          sourcePaymentId: payment.id,
          trigger,
          policyId: policy.id,
          policySnapshot: {
            name: policy.name,
            mode: policy.mode,
            fixedTzs: policy.fixedTzs?.toString() ?? null,
            basisPoints: policy.basisPoints,
            maxPerInvoiceTzs: policy.maxPerInvoiceTzs?.toString() ?? null,
            holdDays: policy.holdDays,
            effectiveFrom: policy.effectiveFrom.toISOString(),
            isDemo: policy.isDemo,
            planCode,
          },
          eligibleBaseTzs: base,
          amountTzs: amount,
          availableAt,
          state: "PENDING_HOLD",
        },
      });
      await postJournal(tx, {
        sourceKey: `commission:${accrual.id}`,
        sourceType: "commission_accrual",
        description: `Commission ${trigger} for invoice ${invoice.id}`,
        lines: [
          { account: platformAccount("COMMISSION_EXPENSE"), debit: amount },
          { account: agentAccount(attribution.agentId, "AGENT_PENDING_PAYABLE"), credit: amount },
        ],
      });
      if (policy.holdDays === 0) await releaseAccrual(tx, accrual.id);
      return { result: "accrued", accrualId: accrual.id, amountTzs: amount } as const;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { result: "duplicate" };
    throw err;
  }
}

async function releaseAccrual(tx: Tx, accrualId: string) {
  const a = await tx.commissionAccrual.findUniqueOrThrow({ where: { id: accrualId } });
  if (a.state !== "PENDING_HOLD") return false;
  await postJournal(tx, {
    sourceKey: `commission-release:${a.id}`,
    sourceType: "commission_release",
    description: `Commission hold released (${a.id})`,
    lines: [
      { account: agentAccount(a.agentId, "AGENT_PENDING_PAYABLE"), debit: a.amountTzs },
      { account: agentAccount(a.agentId, "AGENT_AVAILABLE_PAYABLE"), credit: a.amountTzs },
    ],
  });
  await tx.commissionAccrual.update({ where: { id: a.id }, data: { state: "AVAILABLE" } });
  return true;
}

/** Scheduled: move accruals whose hold elapsed from pending to available. */
export async function releaseDueCommissions(now = new Date()) {
  const due = await prisma.commissionAccrual.findMany({
    where: { state: "PENDING_HOLD", availableAt: { lte: now } },
    select: { id: true },
    take: 500,
  });
  let released = 0;
  for (const { id } of due) {
    const ok = await prisma.$transaction((tx) => releaseAccrual(tx, id));
    if (ok) released++;
  }
  return released;
}

/**
 * Reverses the unpaid part of an accrual (e.g. subscription refund). Amounts already paid out
 * are left for an explicit Admin adjustment — an external payout is never "undone" here.
 */
export async function reverseAccrual(accrualId: string, adminUserId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CommissionAccrual" WHERE id = ${accrualId}::uuid FOR UPDATE`;
    const a = await tx.commissionAccrual.findUniqueOrThrow({ where: { id: accrualId } });
    if (a.reservedTzs > 0n) {
      throw new Error("Commission is reserved for a withdrawal in progress; resolve the withdrawal first");
    }
    const reversible = a.amountTzs - a.paidTzs - a.reversedTzs;
    if (reversible <= 0n) {
      await tx.commissionAccrual.update({ where: { id: a.id }, data: { state: "NEEDS_REVIEW", reason: `Already paid; manual adjustment required: ${reason}` } });
      return { reversedTzs: 0n, needsAdjustmentTzs: a.paidTzs };
    }
    const fromAccount = a.state === "PENDING_HOLD" ? "AGENT_PENDING_PAYABLE" : "AGENT_AVAILABLE_PAYABLE";
    await postJournal(tx, {
      sourceKey: `commission-reversal:${a.id}:${a.reversedTzs + reversible}`,
      sourceType: "commission_reversal",
      description: `Commission reversed: ${reason}`,
      actorUserId: adminUserId,
      lines: [
        { account: agentAccount(a.agentId, fromAccount), debit: reversible },
        { account: platformAccount("COMMISSION_EXPENSE"), credit: reversible },
      ],
    });
    await tx.commissionAccrual.update({
      where: { id: a.id },
      data: {
        reversedTzs: a.reversedTzs + reversible,
        state: a.paidTzs > 0n ? "NEEDS_REVIEW" : "REVERSED",
        reason,
      },
    });
    await audit(tx, { actorUserId: adminUserId, action: "commission.reversed", targetType: "CommissionAccrual", targetId: a.id, reason });
    return { reversedTzs: reversible, needsAdjustmentTzs: a.paidTzs };
  });
}

export async function createPolicy(adminUserId: string, input: {
  name: string;
  agentId?: string;
  trigger: CommissionTrigger;
  mode: "FIXED" | "PERCENTAGE";
  fixedTzs?: bigint;
  basisPoints?: number;
  eligiblePlanCodes: string[];
  referralEligibilityDays?: number;
  holdDays: number;
  maxPerInvoiceTzs?: bigint;
  effectiveFrom: Date;
  isDemo: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    // Close the currently open policy for the same scope so history stays effective-dated.
    await tx.commissionPolicy.updateMany({
      where: { trigger: input.trigger, agentId: input.agentId ?? null, effectiveTo: null, effectiveFrom: { lt: input.effectiveFrom } },
      data: { effectiveTo: input.effectiveFrom },
    });
    const policy = await tx.commissionPolicy.create({
      data: {
        name: input.name,
        agentId: input.agentId ?? null,
        trigger: input.trigger,
        mode: input.mode,
        fixedTzs: input.mode === "FIXED" ? input.fixedTzs : null,
        basisPoints: input.mode === "PERCENTAGE" ? input.basisPoints : null,
        eligiblePlanCodes: input.eligiblePlanCodes,
        referralEligibilityDays: input.referralEligibilityDays ?? null,
        holdDays: input.holdDays,
        maxPerInvoiceTzs: input.maxPerInvoiceTzs ?? null,
        effectiveFrom: input.effectiveFrom,
        isDemo: input.isDemo,
        createdBy: adminUserId,
      },
    });
    await audit(tx, { actorUserId: adminUserId, action: "commission_policy.created", targetType: "CommissionPolicy", targetId: policy.id });
    return policy;
  });
}

/**
 * Admin policy list with the usage each policy actually saw.
 *
 * Accrual totals are aggregated server-side with `_sum` rather than counted from a
 * truncated client list, so a card can never misstate what a rate has cost.
 */
export async function listPolicies() {
  const [policies, usage] = await Promise.all([
    prisma.commissionPolicy.findMany({
      include: { agent: { select: { id: true, referralCode: true, user: { select: { name: true } } } } },
      orderBy: [{ effectiveFrom: "desc" }],
    }),
    prisma.commissionAccrual.groupBy({
      by: ["policyId"],
      _sum: { amountTzs: true, paidTzs: true },
      _count: true,
    }),
  ]);

  const byPolicy = new Map(usage.map((row) => [row.policyId, row]));

  return policies.map((policy) => ({
    ...policy,
    accrualCount: byPolicy.get(policy.id)?._count ?? 0,
    accruedTzs: byPolicy.get(policy.id)?._sum.amountTzs ?? 0n,
    paidTzs: byPolicy.get(policy.id)?._sum.paidTzs ?? 0n,
  }));
}

/**
 * Stops a running policy from a point in time.
 *
 * Policies are effective-dated, so this sets `effectiveTo` instead of deleting: accruals
 * already produced keep pointing at the rate they were calculated from. A policy that has
 * not started yet has nothing to stop and should be deleted instead.
 */
export async function endPolicy(adminUserId: string, policyId: string, reason: string) {
  const policy = await prisma.commissionPolicy.findUnique({ where: { id: policyId } });
  if (!policy) notFound("Policy not found");
  if (policy.effectiveFrom > new Date()) {
    badRequest("This policy has not started yet — delete it instead of ending it.");
  }
  if (policy.effectiveTo) conflict("This policy has already ended.");

  const effectiveTo = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.commissionPolicy.update({ where: { id: policyId }, data: { effectiveTo } });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "commission_policy.ended",
      targetType: "CommissionPolicy",
      targetId: policyId,
      reason,
      metadata: {
        name: policy.name,
        trigger: policy.trigger,
        agentId: policy.agentId,
        effectiveFrom: policy.effectiveFrom.toISOString(),
        effectiveTo: effectiveTo.toISOString(),
      },
    });
    return updated;
  });
}

/**
 * Removes a policy outright.
 *
 * Only allowed while it has produced nothing. Once accruals exist the policy is the only
 * record of the rate they were paid at, and `CommissionAccrual.policyId` is `Restrict`.
 */
export async function deletePolicy(adminUserId: string, policyId: string, reason: string) {
  const policy = await prisma.commissionPolicy.findUnique({
    where: { id: policyId },
    include: { _count: { select: { accruals: true } } },
  });
  if (!policy) notFound("Policy not found");
  if (policy._count.accruals > 0) {
    conflict(
      `"${policy.name}" already produced ${policy._count.accruals} accrual(s) — end it instead of deleting, so the historical rate stays intact.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.commissionPolicy.delete({ where: { id: policyId } });
    await audit(tx, {
      actorUserId: adminUserId,
      action: "commission_policy.deleted",
      targetType: "CommissionPolicy",
      targetId: policyId,
      reason,
      metadata: { name: policy.name, trigger: policy.trigger, mode: policy.mode, agentId: policy.agentId },
    });
  });
  return { deleted: true };
}

/**
 * Commission money at a glance, grouped by accrual state.
 *
 * `outstanding` is derived per state rather than read from one column: an accrual can be
 * partly paid and partly reversed, so what an agent is still owed is
 * `amountTzs − paidTzs − reversedTzs`. Already-paid out is reported separately.
 */
export async function commissionSummary() {
  const rows = await prisma.commissionAccrual.groupBy({
    by: ["state"],
    _sum: { amountTzs: true, paidTzs: true, reversedTzs: true, reservedTzs: true },
    _count: true,
  });

  let accruedTzs = 0n;
  let onHoldTzs = 0n;
  let availableTzs = 0n;
  let paidTzs = 0n;
  let reversedTzs = 0n;
  let needsReviewTzs = 0n;
  let needsReviewCount = 0;
  let totalCount = 0;

  const states = rows.map((row) => {
    const state = row.state as CommissionState;
    const amount = row._sum.amountTzs ?? 0n;
    const paid = row._sum.paidTzs ?? 0n;
    const reversed = row._sum.reversedTzs ?? 0n;
    const outstanding = amount - paid - reversed;

    accruedTzs += amount;
    paidTzs += paid;
    reversedTzs += reversed;
    totalCount += row._count;

    if (state === "PENDING_HOLD") onHoldTzs += outstanding;
    if (state === "AVAILABLE" || state === "RESERVED_FOR_WITHDRAWAL") availableTzs += outstanding;
    if (state === "NEEDS_REVIEW") {
      needsReviewTzs += outstanding;
      needsReviewCount += row._count;
    }

    return { state, count: row._count, amountTzs: amount, paidTzs: paid, reversedTzs: reversed, outstandingTzs: outstanding };
  });

  return {
    accruedTzs,
    onHoldTzs,
    availableTzs,
    paidTzs,
    reversedTzs,
    needsReviewTzs,
    needsReviewCount,
    totalCount,
    states,
  };
}
