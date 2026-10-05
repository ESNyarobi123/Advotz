import type { Prisma } from "@advo/db";

type Tx = Prisma.TransactionClient;

export const OutboxEventType = {
  PAYMENT_INBOX_RECEIVED: "payment.inbox.received",
  PAYMENT_RECONCILE: "payment.reconcile",
  ORDER_PAID: "order.paid",
  GRANT_AUTHORIZE: "grant.authorize",
  GRANT_REVOKE: "grant.revoke",
  SUBSCRIPTION_ACTIVATED: "subscription.activated",
  SITE_PROVISION: "site.provision",
  WITHDRAWAL_APPROVED: "withdrawal.approved",
  PAYOUT_RECONCILE: "payout.reconcile",
  RESELLER_REGISTERED: "reseller.registered",
  NOTIFICATION_SEND: "notification.send",
} as const;
export type OutboxEventType = (typeof OutboxEventType)[keyof typeof OutboxEventType];

export async function emitOutbox(
  tx: Tx,
  eventType: OutboxEventType,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
) {
  return tx.outboxEvent.create({
    data: { eventType, aggregateType, aggregateId, payload: payload as Prisma.InputJsonValue },
  });
}

export async function audit(
  tx: Tx,
  entry: {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    resellerId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    requestId?: string | null;
  },
) {
  return tx.auditEvent.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      resellerId: entry.resellerId ?? null,
      reason: entry.reason ?? null,
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      requestId: entry.requestId ?? null,
    },
  });
}
