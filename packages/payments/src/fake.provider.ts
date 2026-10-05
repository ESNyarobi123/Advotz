import { createHash } from "node:crypto";
import {
  PaymentProviderError,
  SNIPPE_MIN_PAYMENT_TZS,
  SNIPPE_MIN_PAYOUT_TZS,
  type CreatePaymentResult,
  type MobilePaymentRequest,
  type MobilePayoutRequest,
  type PaymentLookupResult,
  type PaymentProvider,
  type PayoutFeeQuote,
  type PayoutResult,
} from "./payment-provider.js";

/** Phone numbers that trigger deterministic failure scenarios in the fake provider. */
export const FAKE_SCENARIO_PHONES = {
  createTimeout: "+255700000001",
  createDeclined: "+255700000002",
  payoutTimeout: "+255700000003",
  payoutFails: "+255700000004",
} as const;

/**
 * Development/test simulation only. It never moves money and its results are not evidence
 * of Snippe behaviour. Production configuration rejects PAYMENT_PROVIDER=fake.
 * References are derived from the idempotency key so retries with the same key are stable.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake" as const;
  readonly accountId: string;
  private readonly payments = new Map<string, PaymentLookupResult>();
  private readonly payouts = new Map<string, PayoutResult>();
  /** Flat fee used by the simulation only; not a Snippe tariff. */
  static readonly SIMULATED_PAYOUT_FEE_TZS = 1000;

  constructor(accountId = "fake-merchant") {
    this.accountId = accountId;
  }

  async createMobilePayment(req: MobilePaymentRequest, idempotencyKey: string): Promise<CreatePaymentResult> {
    if (req.amountTzs < SNIPPE_MIN_PAYMENT_TZS) {
      throw new PaymentProviderError(`Amount below TZS ${SNIPPE_MIN_PAYMENT_TZS} minimum`, "validation", false, 400);
    }
    const reference = fakeReference("pi", idempotencyKey);
    const existing = this.payments.get(reference);
    if (existing) return { reference, status: existing.status, expiresAt: existing.expiresAt };

    const record: PaymentLookupResult = {
      reference,
      status: "pending",
      amountTzs: req.amountTzs,
      currency: "TZS",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    if (req.phoneNumber === FAKE_SCENARIO_PHONES.createDeclined) {
      throw new PaymentProviderError("Simulated validation decline", "validation", false, 400);
    }
    this.payments.set(reference, record);
    if (req.phoneNumber === FAKE_SCENARIO_PHONES.createTimeout) {
      // Provider accepted the request but the response was lost.
      throw new PaymentProviderError("Simulated timeout after acceptance", "timeout", true);
    }
    return { reference, status: "pending", expiresAt: record.expiresAt };
  }

  async getPayment(reference: string): Promise<PaymentLookupResult> {
    const found = this.payments.get(reference);
    if (!found) throw new PaymentProviderError(`Payment ${reference} not found`, "not_found", false, 404);
    return found;
  }

  async quotePayoutFee(amountTzs: number): Promise<PayoutFeeQuote> {
    const feeTzs = FakePaymentProvider.SIMULATED_PAYOUT_FEE_TZS;
    return { amountTzs, feeTzs, totalTzs: amountTzs + feeTzs };
  }

  async sendMobilePayout(req: MobilePayoutRequest, idempotencyKey: string): Promise<PayoutResult> {
    if (req.amountTzs < SNIPPE_MIN_PAYOUT_TZS) {
      throw new PaymentProviderError(`Payout below TZS ${SNIPPE_MIN_PAYOUT_TZS} minimum`, "validation", false, 400);
    }
    const reference = fakeReference("po", idempotencyKey);
    const existing = this.payouts.get(reference);
    if (existing) return existing;
    const record: PayoutResult = {
      reference,
      status: req.phoneNumber === FAKE_SCENARIO_PHONES.payoutFails ? "failed" : "pending",
      amountTzs: req.amountTzs,
      feeTzs: FakePaymentProvider.SIMULATED_PAYOUT_FEE_TZS,
      failureReason: req.phoneNumber === FAKE_SCENARIO_PHONES.payoutFails ? "Simulated recipient rejection" : undefined,
    };
    this.payouts.set(reference, record);
    if (req.phoneNumber === FAKE_SCENARIO_PHONES.payoutTimeout) {
      throw new PaymentProviderError("Simulated payout timeout", "timeout", true);
    }
    return record;
  }

  async getPayout(reference: string): Promise<PayoutResult> {
    const found = this.payouts.get(reference);
    if (!found) throw new PaymentProviderError(`Payout ${reference} not found`, "not_found", false, 404);
    return found;
  }

  /** Test helpers — mutate simulated provider state. */
  setPaymentStatus(reference: string, status: PaymentLookupResult["status"]) {
    const found = this.payments.get(reference);
    if (found) this.payments.set(reference, { ...found, status });
  }

  setPayoutStatus(reference: string, status: PayoutResult["status"]) {
    const found = this.payouts.get(reference);
    if (found) this.payouts.set(reference, { ...found, status });
  }
}

export function fakeReference(prefix: string, idempotencyKey: string): string {
  return `${prefix}_fake_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 20)}`;
}
