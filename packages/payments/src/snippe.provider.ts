import { createRequire } from "node:module";
import type * as SnippeSdk from "@snippe/sdk";
import {
  PaymentProviderError,
  SNIPPE_IDEMPOTENCY_KEY_MAX,
  type CreatePaymentResult,
  type MobilePaymentRequest,
  type MobilePayoutRequest,
  type PaymentLookupResult,
  type PaymentProvider,
  type PayoutFeeQuote,
  type PayoutResult,
} from "./payment-provider.js";

// @snippe/sdk 1.0.0 ships an ESM build with extensionless relative imports that Node's ESM
// resolver rejects; its CommonJS build is complete, so it is loaded through require.
const { Snippe, SnippeError } = createRequire(import.meta.url)("@snippe/sdk") as typeof SnippeSdk;
type Snippe = SnippeSdk.Snippe;

export type SnippeProviderConfig = {
  apiKey: string;
  baseUrl: string;
  accountId: string;
  timeoutMs?: number;
};

/**
 * Snippe adapter over the official @snippe/sdk (API docs version 2026-01-25).
 * Contract notes (SDK 1.0.0 types, docs re-read 30 Sep 2026):
 *  - POST /v1/payments (payments.mobile.create), GET /v1/payments/{reference} (payments.get)
 *  - POST /v1/payouts/send (payouts.mobile.send), GET /v1/payouts/{reference} (payouts.get)
 *  - payouts.mobile.fee → { amount, feeAmount, totalAmount, currency }
 *  - Idempotency-Key ≤ 30 chars; the SDK auto-generates one if omitted, so we always pass ours.
 */
export class SnippePaymentProvider implements PaymentProvider {
  readonly name = "snippe" as const;
  readonly accountId: string;
  private readonly client: Snippe;

  constructor(config: SnippeProviderConfig) {
    if (!config.apiKey) {
      throw new Error("SNIPPE_API_KEY is required for PAYMENT_PROVIDER=snippe");
    }
    this.accountId = config.accountId;
    this.client = new Snippe({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs ?? 20_000,
    });
  }

  async createMobilePayment(req: MobilePaymentRequest, idempotencyKey: string): Promise<CreatePaymentResult> {
    assertKey(idempotencyKey);
    try {
      const payment = await this.client.payments.mobile.create(
        {
          amount: req.amountTzs,
          phoneNumber: req.phoneNumber,
          customer: { firstName: req.firstName, lastName: req.lastName, email: req.email },
          webhookUrl: req.webhookUrl,
          metadata: req.metadata,
        },
        { idempotencyKey },
      );
      return { reference: payment.reference, status: payment.status, expiresAt: payment.expiresAt };
    } catch (err) {
      throw mapError(err);
    }
  }

  async getPayment(reference: string): Promise<PaymentLookupResult> {
    try {
      const payment = await this.client.payments.get(reference);
      return {
        reference: payment.reference,
        status: payment.status,
        amountTzs: payment.amount.value,
        currency: payment.amount.currency,
        expiresAt: payment.expiresAt,
      };
    } catch (err) {
      throw mapError(err);
    }
  }

  async quotePayoutFee(amountTzs: number): Promise<PayoutFeeQuote> {
    try {
      const fee = await this.client.payouts.mobile.fee({ amount: amountTzs });
      return { amountTzs: fee.amount, feeTzs: fee.feeAmount, totalTzs: fee.totalAmount };
    } catch (err) {
      throw mapError(err);
    }
  }

  async sendMobilePayout(req: MobilePayoutRequest, idempotencyKey: string): Promise<PayoutResult> {
    assertKey(idempotencyKey);
    try {
      const payout = await this.client.payouts.mobile.send(
        {
          amount: req.amountTzs,
          phoneNumber: req.phoneNumber,
          recipientName: req.recipientName,
          narration: req.narration,
          webhookUrl: req.webhookUrl,
          metadata: req.metadata,
        },
        { idempotencyKey },
      );
      return {
        reference: payout.reference,
        status: payout.status,
        amountTzs: payout.amount.value,
        feeTzs: payout.fees?.value,
        failureReason: payout.failureReason,
      };
    } catch (err) {
      throw mapError(err);
    }
  }

  async getPayout(reference: string): Promise<PayoutResult> {
    try {
      const payout = await this.client.payouts.get(reference);
      return {
        reference: payout.reference,
        status: payout.status,
        amountTzs: payout.amount.value,
        feeTzs: payout.fees?.value,
        failureReason: payout.failureReason,
      };
    } catch (err) {
      throw mapError(err);
    }
  }
}

function assertKey(key: string) {
  if (key.length === 0 || key.length > SNIPPE_IDEMPOTENCY_KEY_MAX) {
    throw new PaymentProviderError(`Idempotency key must be 1..${SNIPPE_IDEMPOTENCY_KEY_MAX} chars`, "validation", false);
  }
}

function mapError(err: unknown): PaymentProviderError {
  if (err instanceof PaymentProviderError) return err;
  if (err instanceof SnippeError) {
    const code = String(err.errorCode);
    const status = err.status;
    const safe = `${code}: ${err.message}`.slice(0, 300);
    if (code === "timeout") return new PaymentProviderError(safe, "timeout", true, status);
    if (code === "network_error") return new PaymentProviderError(safe, "network", true, status);
    if (code === "rate_limit_exceeded" || status === 429) {
      return new PaymentProviderError(safe, "rate_limit", false, status);
    }
    if (code === "unauthorized" || code === "insufficient_scope" || status === 401 || status === 403) {
      return new PaymentProviderError(safe, "auth", false, status);
    }
    if (code === "not_found" || status === 404) return new PaymentProviderError(safe, "not_found", false, status);
    if (code === "conflict" || status === 409) return new PaymentProviderError(safe, "conflict", false, status);
    if (status >= 500 || status === 0) return new PaymentProviderError(safe, "server", true, status);
    if (status >= 400) return new PaymentProviderError(safe, "validation", false, status);
    return new PaymentProviderError(safe, "unknown", true, status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new PaymentProviderError(message.slice(0, 300), "unknown", true);
}
