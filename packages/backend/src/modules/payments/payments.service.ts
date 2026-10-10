import { ErrorCode } from "@advo/contracts";
import { prisma, type Order, type PaymentAttempt, type Prisma } from "@advo/db";
import { PaymentProviderError, type MobilePaymentRequest, type ProviderPaymentStatus } from "@advo/payments";
import { countByState } from "../../common/aggregate.js";
import { compactIdempotencyKey, sha256Hex, stableStringify } from "../../common/crypto.js";
import { audit, emitOutbox, OutboxEventType } from "../../common/events.js";
import { getPaymentProvider, webhookUrl } from "../../common/providers.js";
import {
  platformAccount,
  postJournal,
  resellerAccount,
  type PostingLine,
} from "../ledger/ledger.service.js";
import { saleFeeBasisPoints } from "../settings/settings.service.js";

type Tx = Prisma.TransactionClient;

const OPEN_ATTEMPT_STATES = ["CREATED", "DISPATCHING", "PENDING", "UNKNOWN"] as const;
/** Snippe keeps Idempotency-Key results for 24h; re-dispatch with the same key only inside that window. */
const PROVIDER_KEY_WINDOW_MS = 23 * 60 * 60 * 1000;

/**
 * What the portal knows about the payer.
 *
 * Only the phone is required. The guest portal has no accounts — a device is
 * authorized by RADIUS — so a guest is a phone number and nothing else, and the
 * order screen stopped asking for more. The name and email stay accepted for API
 * clients that do know them; see `providerCustomerDetails` for what Snippe is
 * sent when they are absent.
 */
export type Payer = { phone: string; firstName?: string; lastName?: string; email?: string };

/** Digits only, so a placeholder address stays unique per payer. */
function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

/**
 * The `customer` block Snippe requires, built from what we actually know.
 *
 * Snippe's mobile-money API will not accept a payment without a name and an
 * email, but this portal deliberately collects neither: there is no account to
 * attach them to (devices are authorized by RADIUS) and nothing was ever emailed
 * to the address. Both are therefore filled with an explicit placeholder rather
 * than invented facts about a person:
 *
 *  - The name is replaced by the mobile-money account holder's real name as soon
 *    as Snippe reports the payment (`fillCustomerName`), so the reseller's
 *    customer list shows a real name the guest never had to type.
 *  - The email sits on a reserved domain that can never deliver, tagged with the
 *    phone number so two payers are still distinguishable in the provider's
 *    dashboard. `PORTAL_PAYER_EMAIL_DOMAIN` overrides the domain if Snippe ever
 *    needs a routable one.
 */
function providerCustomerDetails(payer: Payer) {
  return {
    firstName: payer.firstName ?? "Advo",
    lastName: payer.lastName ?? "Guest",
    email:
      payer.email ??
      `${phoneDigits(payer.phone)}@${process.env.PORTAL_PAYER_EMAIL_DOMAIN ?? "example.com"}`,
  };
}

/**
 * Returns the order's open attempt if one exists (repeated submits/clicks), otherwise creates
 * a new attempt whose exact normalized request and compact key are persisted before dispatch.
 */
export async function ensurePaymentAttempt(orderId: string, payer: Payer): Promise<PaymentAttempt> {
  const provider = getPaymentProvider();
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const open = await tx.paymentAttempt.findFirst({
      where: { orderId, state: { in: [...OPEN_ATTEMPT_STATES] } },
      orderBy: { createdAt: "desc" },
    });
    if (open) return open;
    const completed = await tx.paymentAttempt.findFirst({ where: { orderId, state: "COMPLETED" } });
    if (completed) return completed;
    if (order.paymentState !== "UNPAID") {
      throw new PaymentProviderError(`Order is ${order.paymentState}; no new payment attempt allowed`, "conflict", false);
    }

    const request: MobilePaymentRequest = {
      amountTzs: safeAmount(order.amountTzs),
      phoneNumber: payer.phone,
      ...providerCustomerDetails(payer),
      webhookUrl: webhookUrl(),
      metadata: { orderId: order.id, purpose: order.purpose },
    };
    return tx.paymentAttempt.create({
      data: {
        orderId,
        provider: provider.name,
        providerAccountId: provider.accountId,
        idempotencyKey: compactIdempotencyKey("p"),
        requestPayload: request as unknown as Prisma.InputJsonValue,
        requestHash: sha256Hex(stableStringify(request)),
        state: "CREATED",
      },
    });
  });
  if (attempt && attempt.state === "CREATED") {
    return dispatchPaymentAttempt(attempt.id);
  }
  return attempt;
}

function safeAmount(amount: bigint): number {
  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Order amount outside provider-safe integer bounds");
  }
  return Number(amount);
}

/** Sends the saved request once. Ambiguous failures become UNKNOWN and are reconciled. */
export async function dispatchPaymentAttempt(attemptId: string): Promise<PaymentAttempt> {
  const claimed = await prisma.paymentAttempt.updateMany({
    where: { id: attemptId, state: { in: ["CREATED", "UNKNOWN"] }, providerReference: null },
    data: { state: "DISPATCHING" },
  });
  const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (claimed.count === 0) return attempt;

  const provider = getPaymentProvider();
  try {
    const result = await provider.createMobilePayment(
      attempt.requestPayload as unknown as MobilePaymentRequest,
      attempt.idempotencyKey,
    );
    await prisma.paymentAttempt.update({
      where: { id: attemptId },
      data: {
        providerReference: result.reference,
        state: "PENDING",
        expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
        lastError: null,
      },
    });
    if (result.status !== "pending") {
      await reconcilePaymentAttempt(attemptId);
    }
  } catch (err) {
    const e = err instanceof PaymentProviderError ? err : new PaymentProviderError(String(err), "unknown", true);
    await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: { state: e.ambiguous ? "UNKNOWN" : "FAILED", lastError: `${e.kind}: ${e.message}`.slice(0, 500) },
      });
      if (e.ambiguous) {
        await emitOutbox(tx, OutboxEventType.PAYMENT_RECONCILE, "PaymentAttempt", attemptId, { attemptId });
      }
    });
  }
  return prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
}

/**
 * Resolves PENDING/UNKNOWN attempts from provider truth. An UNKNOWN attempt without a
 * reference is re-sent with its original key and body (provider de-duplicates within 24h);
 * after that window it needs review rather than a blind new charge.
 */
export async function reconcilePaymentAttempt(attemptId: string) {
  const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  if (!["PENDING", "UNKNOWN", "DISPATCHING"].includes(attempt.state)) return attempt.state;

  if (!attempt.providerReference) {
    if (Date.now() - attempt.createdAt.getTime() < PROVIDER_KEY_WINDOW_MS) {
      if (attempt.state === "DISPATCHING" && Date.now() - attempt.updatedAt.getTime() < 60_000) {
        return attempt.state;
      }
      await prisma.paymentAttempt.update({ where: { id: attemptId }, data: { state: "UNKNOWN" } });
      const after = await dispatchPaymentAttempt(attemptId);
      return after.state;
    }
    await prisma.paymentAttempt.update({
      where: { id: attemptId },
      data: { state: "NEEDS_REVIEW", lastError: "Outcome unknown beyond provider idempotency window" },
    });
    return "NEEDS_REVIEW";
  }

  const provider = getPaymentProvider();
  try {
    const found = await provider.getPayment(attempt.providerReference);
    await prisma.paymentAttempt.update({ where: { id: attemptId }, data: { lastCheckedAt: new Date() } });
    const outcome = await applyPaymentOutcome({
      providerAccountId: attempt.providerAccountId,
      reference: found.reference,
      status: found.status,
      amountTzs: BigInt(found.amountTzs),
      currency: found.currency,
      source: "lookup",
    });
    return outcome.kind;
  } catch (err) {
    await prisma.paymentAttempt.update({
      where: { id: attemptId },
      data: { lastCheckedAt: new Date(), lastError: err instanceof Error ? err.message.slice(0, 500) : String(err) },
    });
    return "lookup_failed";
  }
}

export type PaymentOutcome =
  | { kind: "applied"; orderId: string }
  | { kind: "duplicate"; orderId: string }
  | { kind: "overpaid"; orderId: string }
  | { kind: "ignored"; reason: string }
  | { kind: "pending" }
  | { kind: "unmatched" }
  | { kind: "mismatch"; reason: string };

/**
 * The single place where provider payment truth changes local state. Called by verified
 * webhook processing and by authenticated status lookups; safe to call repeatedly.
 */
export async function applyPaymentOutcome(input: {
  providerAccountId: string;
  reference: string;
  status: ProviderPaymentStatus | string;
  amountTzs: bigint;
  currency: string;
  feeTzs?: bigint | null;
  source: "webhook" | "lookup";
  /**
   * The payer's name as the mobile-money provider reports it. For a guest who
   * only typed a phone number this is the first real name we ever see, so it
   * fills the customer record.
   */
  customerName?: string | null;
}): Promise<PaymentOutcome> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.paymentAttempt.findUnique({
      where: {
        providerAccountId_providerReference: {
          providerAccountId: input.providerAccountId,
          providerReference: input.reference,
        },
      },
    });
    if (!found) return { kind: "unmatched" } as const;
    await tx.$queryRaw`SELECT id FROM "PaymentAttempt" WHERE id = ${found.id}::uuid FOR UPDATE`;
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: found.id } });

    if (input.status === "pending") {
      return { kind: "pending" } as const;
    }

    if (input.status !== "completed") {
      if (attempt.state === "COMPLETED") {
        return { kind: "ignored", reason: `late ${input.status} after completion` } as const;
      }
      const terminal = input.status === "voided" ? "VOIDED" : input.status === "expired" ? "EXPIRED" : "FAILED";
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { state: terminal } });
      return { kind: "ignored", reason: `attempt ${terminal.toLowerCase()}` } as const;
    }

    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${attempt.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: attempt.orderId } });

    if (input.currency !== "TZS" || input.amountTzs !== order.amountTzs) {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          state: "NEEDS_REVIEW",
          amountReceivedTzs: input.amountTzs,
          lastError: `${ErrorCode.PAYMENT_AMOUNT_MISMATCH}: expected ${order.amountTzs} TZS, got ${input.amountTzs} ${input.currency}`,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { paymentState: "NEEDS_REVIEW" } });
      return { kind: "mismatch", reason: "amount_or_currency" } as const;
    }

    if (attempt.state === "COMPLETED") return { kind: "duplicate", orderId: order.id } as const;

    await fillCustomerName(tx, order.customerId, input.customerName);

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        state: "COMPLETED",
        completedAt: new Date(),
        amountReceivedTzs: input.amountTzs,
        feeTzs: input.feeTzs ?? null,
      },
    });

    if (order.paymentState === "UNPAID" || order.paymentState === "CANCELLED") {
      await tx.order.update({
        where: { id: order.id },
        data: { paymentState: "PAID", paidAt: new Date(), fulfillmentState: "PENDING" },
      });
      await postReceiptJournal(tx, order, attempt.id, input.amountTzs, input.feeTzs ?? null);
      await emitOutbox(tx, OutboxEventType.ORDER_PAID, "Order", order.id, {
        orderId: order.id,
        paymentAttemptId: attempt.id,
      });
      return { kind: "applied", orderId: order.id } as const;
    }

    // A second successful attempt for an already-paid order: keep the receipt, never grant twice.
    await tx.order.update({ where: { id: order.id }, data: { paymentState: "OVERPAID" } });
    await postJournal(tx, {
      sourceKey: `overpayment:${attempt.id}`,
      sourceType: "overpayment",
      description: `Duplicate receipt for order ${order.id}`,
      lines: [
        { account: platformAccount("PROVIDER_CLEARING"), debit: input.amountTzs },
        { account: platformAccount("OVERPAYMENT_LIABILITY"), credit: input.amountTzs },
      ],
    });
    return { kind: "overpaid", orderId: order.id } as const;
  });
}

/**
 * Records the payer's real name, as the mobile-money provider reported it.
 *
 * A guest who typed only a phone number has no name on file, so this is the first
 * true one we get. Split on the first space to keep the two columns the rest of
 * the product reads, and never overwrite a name already stored — a name the guest
 * or an API client supplied outranks a derived one.
 */
async function fillCustomerName(tx: Tx, customerId: string | null, name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!customerId || !trimmed) return;
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { firstName: true, lastName: true },
  });
  if (!customer || customer.firstName || customer.lastName) return;
  const [firstName, ...rest] = trimmed.split(/\s+/);
  await tx.customer.update({
    where: { id: customerId },
    data: { firstName: firstName ?? null, lastName: rest.join(" ") || null },
  });
}

async function postReceiptJournal(tx: Tx, order: Order, attemptId: string, gross: bigint, fee: bigint | null) {
  if (order.purpose === "PLATFORM_SUBSCRIPTION") {
    const lines: PostingLine[] = [
      { account: platformAccount("PROVIDER_CLEARING"), debit: gross },
      { account: platformAccount("PLATFORM_SUBSCRIPTION_REVENUE"), credit: gross },
    ];
    if (fee && fee > 0n) {
      lines.push(
        { account: platformAccount("PROVIDER_FEE_EXPENSE"), debit: fee },
        { account: platformAccount("PROVIDER_CLEARING"), credit: fee },
      );
    }
    await postJournal(tx, {
      sourceKey: `payment:${attemptId}`,
      sourceType: "subscription_receipt",
      description: `Platform subscription receipt (order ${order.id})`,
      lines,
    });
    return;
  }

  const snapshot = order.priceSnapshot as { saleFeeBasisPoints?: number };
  const bps = BigInt(snapshot.saleFeeBasisPoints ?? (await saleFeeBasisPoints()));
  let platformFee = (gross * bps) / 10000n;
  const lines: PostingLine[] = [{ account: platformAccount("PROVIDER_CLEARING"), debit: gross }];
  if (fee !== null) {
    if (platformFee > gross - fee) platformFee = gross - fee > 0n ? gross - fee : 0n;
    lines.push(
      { account: platformAccount("PROVIDER_CLEARING"), credit: fee },
      { account: resellerAccount(order.resellerId, "RESELLER_PAYABLE"), credit: gross - fee - platformFee },
      { account: platformAccount("PLATFORM_SALE_FEE_REVENUE"), credit: platformFee },
    );
  } else {
    // Provider fee unknown: keep reseller funds unavailable until settlement is reconciled.
    lines.push(
      { account: resellerAccount(order.resellerId, "RESELLER_PENDING_SETTLEMENT"), credit: gross - platformFee },
      { account: platformAccount("PLATFORM_SALE_FEE_REVENUE"), credit: platformFee },
    );
  }
  await postJournal(tx, {
    sourceKey: `payment:${attemptId}`,
    sourceType: "wifi_sale_receipt",
    description: `WiFi package sale (order ${order.id})`,
    lines,
  });
}

/** Admin reconciliation: record the actual provider fee for a sale whose settlement was unknown. */
export async function settlePendingSale(attemptId: string, feeTzs: bigint, actorUserId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { order: true } });
    if (attempt.state !== "COMPLETED" || attempt.order.purpose !== "WIFI_PACKAGE") {
      throw new Error("Only completed WiFi sale receipts can be settled");
    }
    const receipt = await tx.journal.findUnique({ where: { sourceKey: `payment:${attemptId}` }, include: { lines: { include: { account: true } } } });
    const pendingLine = receipt?.lines.find((l) => l.account.type === "RESELLER_PENDING_SETTLEMENT");
    if (!pendingLine) throw new Error("Receipt has no pending settlement");
    if (await tx.journal.findUnique({ where: { sourceKey: `settlement:${attemptId}` }, select: { id: true } })) {
      throw new Error("This sale has already been settled");
    }
    const pending = pendingLine.creditTzs;
    if (feeTzs < 0n || feeTzs > pending) throw new Error("Fee exceeds pending settlement");
    await tx.paymentAttempt.update({ where: { id: attemptId }, data: { feeTzs } });
    await audit(tx, {
      actorUserId,
      action: "payment.settled",
      targetType: "PaymentAttempt",
      targetId: attemptId,
      resellerId: attempt.order.resellerId,
      reason,
      metadata: { feeTzs: feeTzs.toString(), pendingTzs: pending.toString() },
    });
    return postJournal(tx, {
      sourceKey: `settlement:${attemptId}`,
      sourceType: "wifi_sale_settlement",
      description: `Settlement reconciled for order ${attempt.orderId}`,
      actorUserId,
      lines: [
        { account: resellerAccount(attempt.order.resellerId, "RESELLER_PENDING_SETTLEMENT"), debit: pending },
        { account: resellerAccount(attempt.order.resellerId, "RESELLER_PAYABLE"), credit: pending - feeTzs },
        { account: platformAccount("PROVIDER_CLEARING"), credit: feeTzs },
      ],
    });
  });
}

/**
 * The counts and money behind the admin payments board.
 *
 * Every figure is aggregated in the database (`groupBy`/`_sum`) rather than by
 * adding up the 200 rows the list endpoint returns, so a truncated list can
 * never misstate a total. `unsettled` is the queue that actually needs an
 * operator: a completed WiFi sale whose provider fee was never known, so the
 * reseller's money is still held in `RESELLER_PENDING_SETTLEMENT`.
 */
export async function paymentsSummary() {
  const [attemptsByState, collected, orderStates, webhooksByState, providers, unsettled, settledCount, latestAttempt, latestWebhook] =
    await Promise.all([
      prisma.paymentAttempt.groupBy({ by: ["state"], _count: true }),
      prisma.paymentAttempt.aggregate({
        where: { state: "COMPLETED" },
        _sum: { amountReceivedTzs: true, feeTzs: true },
        _count: true,
      }),
      prisma.order.groupBy({ by: ["paymentState"], _count: true }),
      prisma.webhookInboxEvent.groupBy({ by: ["state"], _count: true }),
      prisma.paymentAttempt.groupBy({
        by: ["provider"],
        _count: true,
        _sum: { amountReceivedTzs: true },
      }),
      prisma.paymentAttempt.aggregate({
        where: { state: "COMPLETED", feeTzs: null, order: { purpose: "WIFI_PACKAGE" } },
        _sum: { amountReceivedTzs: true },
        _count: true,
      }),
      prisma.paymentAttempt.count({ where: { state: "COMPLETED", feeTzs: { not: null } } }),
      prisma.paymentAttempt.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      prisma.webhookInboxEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    ]);

  const attempts = countByState(attemptsByState, "state");
  const orders = countByState(orderStates, "paymentState");
  const webhooks = countByState(webhooksByState, "state");
  const total = attemptsByState.reduce((sum, row) => sum + row._count, 0);
  const completed = attempts.COMPLETED ?? 0;
  const grossTzs = collected._sum.amountReceivedTzs ?? 0n;
  const feesTzs = collected._sum.feeTzs ?? 0n;

  return {
    attempts: {
      total,
      byState: attempts,
      completed,
      open: (attempts.CREATED ?? 0) + (attempts.DISPATCHING ?? 0) + (attempts.PENDING ?? 0),
      unknown: attempts.UNKNOWN ?? 0,
      failed: attempts.FAILED ?? 0,
      expired: attempts.EXPIRED ?? 0,
      voided: attempts.VOIDED ?? 0,
      needsReview: attempts.NEEDS_REVIEW ?? 0,
      /** Share of finished attempts that ended in money received, as a whole percent. */
      successRatePct: completed > 0 ? Math.round((completed / Math.max(1, total)) * 100) : 0,
    },
    collected: {
      count: collected._count,
      grossTzs,
      feesTzs,
      netTzs: grossTzs - feesTzs,
    },
    settlement: {
      unsettled: unsettled._count,
      unsettledAmountTzs: unsettled._sum.amountReceivedTzs ?? 0n,
      settled: settledCount,
    },
    orders: {
      total: orderStates.reduce((sum, row) => sum + row._count, 0),
      byPaymentState: orders,
      paid: (orders.PAID ?? 0) + (orders.OVERPAID ?? 0),
      unpaid: orders.UNPAID ?? 0,
      needsReview: orders.NEEDS_REVIEW ?? 0,
    },
    webhooks: {
      total: webhooksByState.reduce((sum, row) => sum + row._count, 0),
      byState: webhooks,
      received: webhooks.RECEIVED ?? 0,
      processed: webhooks.PROCESSED ?? 0,
      quarantined: webhooks.QUARANTINED ?? 0,
      ignored: webhooks.IGNORED ?? 0,
      failed: webhooks.FAILED ?? 0,
    },
    providers: providers
      .map((row) => ({
        provider: row.provider,
        count: row._count,
        grossTzs: row._sum.amountReceivedTzs ?? 0n,
      }))
      .sort((a, b) => b.count - a.count),
    attention:
      (attempts.NEEDS_REVIEW ?? 0) +
      (attempts.UNKNOWN ?? 0) +
      (webhooks.QUARANTINED ?? 0) +
      (webhooks.FAILED ?? 0) +
      unsettled._count,
    lastActivityAt: [latestAttempt?.createdAt, latestWebhook?.receivedAt]
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
  };
}
