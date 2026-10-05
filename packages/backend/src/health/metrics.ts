import { prisma } from "@advo/db";
import { outboxStats } from "../modules/outbox/outbox.dispatcher.js";

type Sample = { labels?: Record<string, string>; value: number };
type Metric = { name: string; help: string; samples: Sample[] };

const MINUTE = 60_000;

function ageSeconds(date: Date | null | undefined, now: number) {
  return date ? Math.max(0, Math.round((now - date.getTime()) / 1000)) : 0;
}

function escapeLabel(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function renderPrometheus(metrics: Metric[]) {
  const out: string[] = [];
  for (const m of metrics) {
    out.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} gauge`);
    for (const s of m.samples) {
      const labels = s.labels && Object.keys(s.labels).length
        ? `{${Object.entries(s.labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",")}}`
        : "";
      out.push(`${m.name}${labels} ${s.value}`);
    }
  }
  return `${out.join("\n")}\n`;
}

/**
 * Point-in-time gauges derived from the database — the source of truth for money and access.
 * These back the alert rules in infra/observability; they are not request-rate metrics.
 */
export async function collectMetrics(now = Date.now()): Promise<Metric[]> {
  const hourAgo = new Date(now - 60 * MINUTE);
  const [
    outbox,
    oldestOutbox,
    inbox,
    oldestInbox,
    paidUnfulfilled,
    payments,
    stalePayouts,
    withdrawals,
    activations,
    operations,
    opErrors,
    controllers,
    ledger,
    expiredObserved,
    overdueGrants,
  ] = await Promise.all([
    outboxStats(),
    prisma.outboxEvent.findFirst({ where: { dispatchedAt: null }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.webhookInboxEvent.groupBy({ by: ["state"], _count: true }),
    prisma.webhookInboxEvent.findFirst({ where: { state: "RECEIVED" }, orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }),
    prisma.order.count({
      where: { paymentState: "PAID", fulfillmentState: { in: ["NOT_STARTED", "PENDING", "FAILED"] }, paidAt: { lt: new Date(now - 10 * MINUTE) } },
    }),
    prisma.paymentAttempt.groupBy({ by: ["state"], where: { state: { in: ["UNKNOWN", "NEEDS_REVIEW", "PENDING"] } }, _count: true }),
    prisma.payoutAttempt.count({ where: { state: { in: ["UNKNOWN", "PENDING", "DISPATCHING"] }, updatedAt: { lt: new Date(now - 30 * MINUTE) } } }),
    prisma.withdrawal.groupBy({ by: ["state"], where: { state: { in: ["REQUESTED", "UNKNOWN", "NEEDS_REVIEW", "PROCESSING"] } }, _count: true }),
    prisma.accessGrantDevice.groupBy({ by: ["authState"], where: { updatedAt: { gte: hourAgo } }, _count: true }),
    prisma.networkOperation.groupBy({ by: ["state"], where: { state: { in: ["FAILED", "UNKNOWN", "NEEDS_REVIEW", "PENDING", "RUNNING"] } }, _count: true }),
    prisma.networkOperation.groupBy({ by: ["lastErrorCode"], where: { updatedAt: { gte: hourAgo }, lastErrorCode: { not: null } }, _count: true }),
    prisma.controller.findMany({ select: { name: true, mode: true, healthStatus: true, lastHealthAt: true } }),
    prisma.journalLine.aggregate({ _sum: { debitTzs: true, creditTzs: true } }),
    prisma.networkSession.count({ where: { endedAt: null, grant: { expiresAt: { lt: new Date(now - 5 * MINUTE) } } } }),
    prisma.accessGrant.count({ where: { state: "ACTIVE", expiresAt: { lt: new Date(now - 5 * MINUTE) } } }),
  ]);

  const inspected = controllers.filter((c) => c.lastHealthAt !== null);
  const debits = ledger._sum.debitTzs ?? 0n;
  const credits = ledger._sum.creditTzs ?? 0n;

  return [
    { name: "advo_outbox_pending_events", help: "Undispatched outbox events still being retried", samples: [{ value: outbox.pending }] },
    { name: "advo_outbox_dead_events", help: "Outbox events that exhausted retries", samples: [{ value: outbox.dead }] },
    { name: "advo_outbox_oldest_pending_age_seconds", help: "Age of the oldest undispatched outbox event", samples: [{ value: ageSeconds(oldestOutbox?.createdAt, now) }] },
    {
      name: "advo_webhook_inbox_events",
      help: "Webhook inbox events by state",
      samples: inbox.map((r) => ({ labels: { state: r.state }, value: r._count })),
    },
    { name: "advo_webhook_inbox_oldest_unprocessed_age_seconds", help: "Age of the oldest RECEIVED webhook", samples: [{ value: ageSeconds(oldestInbox?.receivedAt, now) }] },
    { name: "advo_paid_orders_unfulfilled", help: "Orders paid more than 10 minutes ago without fulfilment", samples: [{ value: paidUnfulfilled }] },
    {
      name: "advo_payment_attempts",
      help: "Payment attempts in non-terminal or review states",
      samples: payments.map((r) => ({ labels: { state: r.state }, value: r._count })),
    },
    { name: "advo_payout_attempts_stale", help: "Payout attempts unresolved for more than 30 minutes", samples: [{ value: stalePayouts }] },
    {
      name: "advo_withdrawals",
      help: "Withdrawals awaiting a decision or provider outcome",
      samples: withdrawals.map((r) => ({ labels: { state: r.state }, value: r._count })),
    },
    {
      name: "advo_grant_device_updates_last_hour",
      help: "Access-device authorisation outcomes updated in the last hour",
      samples: activations.map((r) => ({ labels: { state: r.authState }, value: r._count })),
    },
    {
      name: "advo_network_operations",
      help: "Controller operations not yet succeeded",
      samples: operations.map((r) => ({ labels: { state: r.state }, value: r._count })),
    },
    {
      name: "advo_network_operation_errors_last_hour",
      help: "Controller operation errors by recorded error code in the last hour",
      samples: opErrors.map((r) => ({ labels: { code: r.lastErrorCode ?? "none" }, value: r._count })),
    },
    {
      name: "advo_controller_reachable",
      help: "1 when the last Controller inspection reached it (inspected Controllers only)",
      samples: inspected.map((c) => ({ labels: { controller: c.name, mode: c.mode }, value: c.healthStatus === "reachable" ? 1 : 0 })),
    },
    {
      name: "advo_controller_last_inspection_age_seconds",
      help: "Seconds since the Controller was last inspected",
      samples: inspected.map((c) => ({ labels: { controller: c.name, mode: c.mode }, value: ageSeconds(c.lastHealthAt, now) })),
    },
    {
      name: "advo_controllers_never_inspected",
      help: "Registered Controllers with no inspection recorded",
      samples: [{ value: controllers.length - inspected.length }],
    },
    { name: "advo_ledger_balanced", help: "1 when total debits equal total credits", samples: [{ value: debits === credits ? 1 : 0 }] },
    { name: "advo_ledger_imbalance_tzs", help: "Absolute difference between total debits and credits (TZS)", samples: [{ value: Number(debits > credits ? debits - credits : credits - debits) }] },
    { name: "advo_sessions_observed_after_expiry", help: "Open network sessions whose grant expired more than 5 minutes ago", samples: [{ value: expiredObserved }] },
    { name: "advo_grants_active_past_expiry", help: "Grants still ACTIVE more than 5 minutes after expiry (sweeper lag)", samples: [{ value: overdueGrants }] },
  ];
}
