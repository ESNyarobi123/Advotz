export type ProviderName = "fake" | "snippe";

export type MobilePaymentRequest = {
  amountTzs: number;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
};

export type ProviderPaymentStatus = "pending" | "completed" | "failed" | "voided" | "expired";

export type CreatePaymentResult = {
  reference: string;
  status: ProviderPaymentStatus;
  expiresAt?: string;
};

export type PaymentLookupResult = {
  reference: string;
  status: ProviderPaymentStatus;
  amountTzs: number;
  currency: string;
  expiresAt?: string;
};

export type MobilePayoutRequest = {
  amountTzs: number;
  phoneNumber: string;
  recipientName: string;
  narration?: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
};

export type ProviderPayoutStatus = "pending" | "completed" | "failed" | "reversed";

export type PayoutResult = {
  reference: string;
  status: ProviderPayoutStatus;
  amountTzs: number;
  feeTzs?: number;
  failureReason?: string;
};

export type PayoutFeeQuote = {
  amountTzs: number;
  feeTzs: number;
  totalTzs: number;
};

export type ProviderErrorKind =
  | "timeout"
  | "network"
  | "validation"
  | "auth"
  | "rate_limit"
  | "conflict"
  | "not_found"
  | "server"
  | "unknown";

/**
 * `ambiguous` means the request may have been accepted by the provider. Callers must
 * reconcile (look up) before any retry that could create a second charge or payout.
 */
export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly ambiguous: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

export interface PaymentProvider {
  readonly name: ProviderName;
  /** Stable identifier of the merchant account; scopes provider references and event IDs. */
  readonly accountId: string;
  createMobilePayment(req: MobilePaymentRequest, idempotencyKey: string): Promise<CreatePaymentResult>;
  getPayment(reference: string): Promise<PaymentLookupResult>;
  quotePayoutFee(amountTzs: number): Promise<PayoutFeeQuote>;
  sendMobilePayout(req: MobilePayoutRequest, idempotencyKey: string): Promise<PayoutResult>;
  getPayout(reference: string): Promise<PayoutResult>;
}

export const SNIPPE_MIN_PAYMENT_TZS = 500;
export const SNIPPE_MIN_PAYOUT_TZS = 5000;
export const SNIPPE_IDEMPOTENCY_KEY_MAX = 30;
