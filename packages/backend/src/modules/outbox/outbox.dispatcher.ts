import { prisma, type OutboxEvent } from "@advo/db";
import { handleOutboxEvent } from "./handlers.js";

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 12;

export function outboxBackoffMs(attempt: number) {
  return Math.min(60 * 60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Lease due events with FOR UPDATE SKIP LOCKED so several relays never take the same row.
 * The lease (nextAttemptAt pushed forward) makes a crashed relay's events reappear later.
 */
export async function leaseOutboxEvents(limit = 50): Promise<OutboxEvent[]> {
  // nextAttemptAt is written with the application clock, so compare against it (not DB now()).
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OutboxEvent"
      WHERE "dispatchedAt" IS NULL AND "nextAttemptAt" <= ${now} AND attempts < ${MAX_ATTEMPTS}
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { nextAttemptAt: new Date(Date.now() + LEASE_MS) } });
    return tx.outboxEvent.findMany({ where: { id: { in: ids } } });
  });
}

export async function markDispatched(id: string) {
  await prisma.outboxEvent.update({ where: { id }, data: { dispatchedAt: new Date(), lastError: null } });
}

export async function markFailed(event: Pick<OutboxEvent, "id" | "attempts">, err: unknown) {
  const attempts = event.attempts + 1;
  const message = err instanceof Error ? err.message : String(err);
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: {
      attempts,
      lastError: (attempts >= MAX_ATTEMPTS ? `DEAD: ${message}` : message).slice(0, 1000),
      nextAttemptAt: new Date(Date.now() + outboxBackoffMs(attempts)),
    },
  });
}

/** Runs one event through its handler and records the result. */
export async function runOutboxEvent(event: OutboxEvent): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    const result = await handleOutboxEvent(event.eventType, event.payload as Record<string, string>);
    await markDispatched(event.id);
    return { ok: true, result };
  } catch (err) {
    await markFailed(event, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Inline drain (tests, dev without Redis, OUTBOX_INLINE=true). Loops until no due events
 * remain or maxRounds is hit, so cascades (paid → grant → authorize) finish in one call.
 */
export async function drainOutbox(maxRounds = 10) {
  let processed = 0;
  let failed = 0;
  for (let round = 0; round < maxRounds; round++) {
    const events = await leaseOutboxEvents(100);
    if (events.length === 0) break;
    for (const ev of events) {
      const r = await runOutboxEvent(ev);
      if (r.ok) processed++;
      else failed++;
    }
  }
  return { processed, failed };
}

export function outboxInlineEnabled() {
  return process.env.OUTBOX_INLINE === "true";
}

/** Fire-and-forget drain after a request commits, when inline mode is on. */
export function kickOutbox() {
  if (!outboxInlineEnabled()) return;
  setImmediate(() => {
    drainOutbox().catch((err) => console.error("[outbox] inline drain failed", err));
  });
}

export async function outboxStats() {
  const [pending, dead] = await Promise.all([
    prisma.outboxEvent.count({ where: { dispatchedAt: null, attempts: { lt: MAX_ATTEMPTS } } }),
    prisma.outboxEvent.count({ where: { dispatchedAt: null, attempts: { gte: MAX_ATTEMPTS } } }),
  ]);
  return { pending, dead };
}
