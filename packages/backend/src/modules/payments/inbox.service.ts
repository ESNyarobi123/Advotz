import { prisma, type Prisma } from "@advo/db";
import {
  PAYMENT_EVENT_TYPES,
  PAYOUT_EVENT_TYPES,
  snippeWebhookEnvelopeSchema,
  verifySnippeWebhook,
} from "@advo/payments";
import { sha256Hex } from "../../common/crypto.js";
import { isUniqueViolation } from "../../common/errors.js";
import { audit, emitOutbox, OutboxEventType } from "../../common/events.js";
import { getPaymentProvider, getWebhookSecret } from "../../common/providers.js";
import { applyPayoutOutcome } from "../withdrawals/payouts.service.js";
import { applyPaymentOutcome } from "./payments.service.js";

export const MAX_WEBHOOK_BYTES = 256 * 1024;

/**
 * The account holder's name from a payment payload, when it is there.
 *
 * Read defensively because it arrives as unvalidated JSON: this name is a
 * nicety — it is the only real name we ever learn for a guest who typed just a
 * phone number — and it must never be a reason to reject a payment.
 */
function payerName(customer: unknown): string | null {
  if (!customer || typeof customer !== "object" || !("name" in customer)) return null;
  const name = (customer as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export type IngestResult =
  | { status: 200; body: { received: true; duplicate?: boolean } }
  | { status: 400 | 401 | 413 | 503; body: { code: string; message: string } };

/**
 * Receives Snippe webhooks. Acknowledges only after the verified event and its dispatch
 * record are durably committed; database failure returns 503 so Snippe retries.
 */
export async function ingestSnippeWebhook(
  rawBody: Buffer | undefined,
  headers: Record<string, string | string[] | undefined>,
): Promise<IngestResult> {
  if (!rawBody) return { status: 400, body: { code: "VALIDATION_ERROR", message: "Raw body unavailable" } };
  if (rawBody.length > MAX_WEBHOOK_BYTES) {
    return { status: 413, body: { code: "VALIDATION_ERROR", message: "Payload too large" } };
  }
  const header = (name: string) => {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const verification = verifySnippeWebhook({
    rawBody,
    signature: header("x-webhook-signature"),
    timestamp: header("x-webhook-timestamp"),
    secret: getWebhookSecret(),
    maxAgeSeconds: Number(process.env.SNIPPE_WEBHOOK_MAX_AGE_SECONDS ?? 3600),
  });
  if (!verification.ok) {
    return { status: 401, body: { code: "UNAUTHENTICATED", message: `Webhook rejected: ${verification.reason}` } };
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: "Body is not JSON" } };
  }
  const provider = getPaymentProvider();
  const payloadHash = sha256Hex(rawBody.toString("utf8"));
  const parsed = snippeWebhookEnvelopeSchema.safeParse(json);
  const eventId =
    parsed.success ? parsed.data.id : typeof (json as { id?: unknown })?.id === "string" ? String((json as { id: string }).id) : `unparsed_${payloadHash.slice(0, 32)}`;
  const eventType = parsed.success ? parsed.data.type : "unparseable";

  try {
    await prisma.$transaction(async (tx) => {
      const inbox = await tx.webhookInboxEvent.create({
        data: {
          provider: "snippe",
          providerAccountId: provider.accountId,
          eventId,
          eventType,
          payload: json as Prisma.InputJsonValue,
          payloadHash,
          state: parsed.success ? "RECEIVED" : "QUARANTINED",
          reason: !parsed.success
            ? "Schema validation failed"
            : verification.stale
              ? "stale_timestamp: confirm via provider lookup"
              : null,
        },
      });
      if (parsed.success) {
        await emitOutbox(tx, OutboxEventType.PAYMENT_INBOX_RECEIVED, "WebhookInboxEvent", inbox.id, { inboxId: inbox.id });
      }
    });
    return { status: 200, body: { received: true } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await prisma.webhookInboxEvent.findUnique({
        where: { providerAccountId_eventId: { providerAccountId: provider.accountId, eventId } },
      });
      if (existing && existing.payloadHash !== payloadHash) {
        await prisma.$transaction((tx) =>
          audit(tx, {
            action: "webhook.conflicting_duplicate",
            targetType: "WebhookInboxEvent",
            targetId: existing.id,
            reason: "Same event ID delivered with different signed content",
            metadata: { eventId, firstHash: existing.payloadHash, newHash: payloadHash },
          }),
        );
      }
      return { status: 200, body: { received: true, duplicate: true } };
    }
    return { status: 503, body: { code: "INTERNAL_ERROR", message: "Temporarily unable to persist event" } };
  }
}

/** Idempotent processing of a stored inbox event (worker or sweeper). */
export async function processInboxEvent(inboxId: string) {
  const claimed = await prisma.webhookInboxEvent.updateMany({
    where: { id: inboxId, state: { in: ["RECEIVED", "FAILED"] } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";
  const event = await prisma.webhookInboxEvent.findUniqueOrThrow({ where: { id: inboxId } });
  const parsed = snippeWebhookEnvelopeSchema.safeParse(event.payload);
  if (!parsed.success) {
    await finish(inboxId, "QUARANTINED", "Schema validation failed");
    return "quarantined";
  }
  const { type, data } = parsed.data;
  const stale = event.reason?.startsWith("stale_timestamp") ?? false;

  try {
    if ((PAYMENT_EVENT_TYPES as readonly string[]).includes(type)) {
      let status = data.status;
      let amount = BigInt(data.amount.value);
      let currency = data.amount.currency;
      if (stale) {
        // Signed but outside the freshness window: act only on authenticated provider state.
        const truth = await getPaymentProvider().getPayment(data.reference);
        status = truth.status;
        amount = BigInt(truth.amountTzs);
        currency = truth.currency;
      }
      const outcome = await applyPaymentOutcome({
        providerAccountId: event.providerAccountId,
        reference: data.reference,
        status: type === "payment.completed" && !stale ? "completed" : status,
        amountTzs: amount,
        currency,
        feeTzs: !stale && data.settlement ? BigInt(data.settlement.fees.value) : null,
        source: "webhook",
        // The only real name we ever learn for a guest who typed just a phone number.
        customerName: payerName(data.customer),
      });
      if (outcome.kind === "unmatched") {
        await finish(inboxId, "QUARANTINED", "No local payment attempt for this provider reference");
        return "quarantined";
      }
      if (outcome.kind === "mismatch") {
        await finish(inboxId, "QUARANTINED", `Amount/currency mismatch (${outcome.reason})`);
        return "quarantined";
      }
      await finish(inboxId, "PROCESSED", outcome.kind === "ignored" ? outcome.reason : outcome.kind);
      return outcome.kind;
    }

    if ((PAYOUT_EVENT_TYPES as readonly string[]).includes(type)) {
      let status = data.status;
      if (stale) status = (await getPaymentProvider().getPayout(data.reference)).status;
      const outcome = await applyPayoutOutcome({
        providerAccountId: event.providerAccountId,
        reference: data.reference,
        status: type === "payout.completed" && !stale ? "completed" : type === "payout.reversed" && !stale ? "reversed" : status,
        feeTzs: !stale && data.fees ? BigInt(data.fees.value) : undefined,
        failureReason: data.failure_reason,
      });
      if (outcome === "unmatched") {
        await finish(inboxId, "QUARANTINED", "No local payout attempt for this provider reference");
        return "quarantined";
      }
      await finish(inboxId, "PROCESSED", outcome);
      return outcome;
    }

    await finish(inboxId, "IGNORED", `Unhandled event type ${type}`);
    return "ignored";
  } catch (err) {
    await prisma.webhookInboxEvent.update({
      where: { id: inboxId },
      data: { state: "FAILED", reason: err instanceof Error ? err.message.slice(0, 500) : String(err) },
    });
    throw err;
  }
}

async function finish(id: string, state: "PROCESSED" | "QUARANTINED" | "IGNORED", reason: string | null) {
  await prisma.webhookInboxEvent.update({
    where: { id },
    data: { state, reason, processedAt: new Date() },
  });
}
