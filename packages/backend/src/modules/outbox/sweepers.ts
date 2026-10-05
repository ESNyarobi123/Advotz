import { prisma } from "@advo/db";
import { sweepGrants } from "../access/grants.service.js";
import { releaseDueCommissions } from "../commissions/commissions.service.js";
import { processInboxEvent } from "../payments/inbox.service.js";
import { reconcilePaymentAttempt } from "../payments/payments.service.js";
import { expireSubscriptions } from "../subscriptions/subscriptions.service.js";
import { reconcilePayoutAttempt } from "../withdrawals/payouts.service.js";

const STALE_MS = 2 * 60_000;

/**
 * Safety net for lost webhooks, lost outbox deliveries and crashed workers. Each step is
 * idempotent; the provider lookup is the source of truth for payments/payouts.
 */
export async function runSweepers(now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_MS);
  const report: Record<string, number | string> = {};

  const inbox = await prisma.webhookInboxEvent.findMany({
    where: { state: "RECEIVED", receivedAt: { lt: staleBefore } },
    select: { id: true },
    take: 100,
  });
  for (const e of inbox) await safe(() => processInboxEvent(e.id));
  report.inboxRetried = inbox.length;

  const payments = await prisma.paymentAttempt.findMany({
    where: {
      state: { in: ["PENDING", "UNKNOWN"] },
      updatedAt: { lt: staleBefore },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: staleBefore } }],
    },
    select: { id: true },
    take: 100,
  });
  for (const p of payments) await safe(() => reconcilePaymentAttempt(p.id));
  report.paymentsReconciled = payments.length;

  const payouts = await prisma.payoutAttempt.findMany({
    where: {
      state: { in: ["PENDING", "UNKNOWN"] },
      updatedAt: { lt: staleBefore },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: staleBefore } }],
    },
    select: { id: true },
    take: 100,
  });
  for (const p of payouts) await safe(() => reconcilePayoutAttempt(p.id));
  report.payoutsReconciled = payouts.length;

  report.commissionsReleased = await safe(() => releaseDueCommissions(now));
  report.subscriptionsExpired = await safe(() => expireSubscriptions(now));
  const grants = await safe(() => sweepGrants(now));
  if (typeof grants === "object") {
    report.grantsExpired = grants.expired;
    report.grantsActivationFailed = grants.activationFailed;
  }
  await prisma.portalContext.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 3600_000) } } });
  return report;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | string> {
  try {
    return await fn();
  } catch (err) {
    console.error("[sweeper]", err);
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
