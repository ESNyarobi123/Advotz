import type { MessageKey, Translator } from "@advo/i18n";

/**
 * Enum → message-key maps.
 *
 * The Prisma enums are the wire vocabulary; these maps are the only place that
 * knows how each value is spelled for a human. Keeping them in one module means
 * a new enum member shows up as a single greppable gap instead of a raw
 * `NEEDS_REVIEW` leaking onto a screen.
 */
const PAYMENT_STATES: Record<string, MessageKey> = {
  PAID: "payment.state.PAID",
  OVERPAID: "payment.state.OVERPAID",
  UNPAID: "payment.state.UNPAID",
  CANCELLED: "payment.state.CANCELLED",
  REFUND_PENDING: "payment.state.REFUND_PENDING",
  REFUNDED: "payment.state.REFUNDED",
  NEEDS_REVIEW: "payment.state.NEEDS_REVIEW",
};

const GRANT_STATES: Record<string, MessageKey> = {
  PENDING_ACTIVATION: "grant.state.PENDING_ACTIVATION",
  ACTIVE: "grant.state.ACTIVE",
  EXPIRED: "grant.state.EXPIRED",
  QUOTA_EXHAUSTED: "grant.state.QUOTA_EXHAUSTED",
  REVOKED: "grant.state.REVOKED",
  ACTIVATION_FAILED: "grant.state.ACTIVATION_FAILED",
};

const DEVICE_STATES: Record<string, MessageKey> = {
  RESERVED: "device.state.RESERVED",
  AUTHORIZING: "device.state.AUTHORIZING",
  AUTHORIZED: "device.state.AUTHORIZED",
  UNKNOWN: "device.state.UNKNOWN",
  REVOKE_PENDING: "device.state.REVOKE_PENDING",
  REVOKED: "device.state.REVOKED",
  FAILED: "device.state.FAILED",
};

const FULFILLMENT_STATES: Record<string, MessageKey> = {
  NOT_STARTED: "fulfillment.state.NOT_STARTED",
  PENDING: "fulfillment.state.PENDING",
  FULFILLED: "fulfillment.state.FULFILLED",
  FAILED: "fulfillment.state.FAILED",
  NEEDS_REVIEW: "fulfillment.state.NEEDS_REVIEW",
};

/** User/reseller/agent account lifecycle (`UserStatus`). */
const ACCOUNT_STATES: Record<string, MessageKey> = {
  PENDING_VERIFICATION: "account.state.PENDING_VERIFICATION",
  ACTIVE: "account.state.ACTIVE",
  SUSPENDED: "account.state.SUSPENDED",
};

/** Platform subscription lifecycle (`SubscriptionState`). */
const SUBSCRIPTION_STATES: Record<string, MessageKey> = {
  NONE: "subscription.state.NONE",
  TRIALING: "subscription.state.TRIALING",
  ACTIVE: "subscription.state.ACTIVE",
  PAST_DUE: "subscription.state.PAST_DUE",
  EXPIRED: "subscription.state.EXPIRED",
  SUSPENDED: "subscription.state.SUSPENDED",
  CANCELLED: "subscription.state.CANCELLED",
};

/** Agent lead pipeline (`LeadStatus`). */
const LEAD_STATES: Record<string, MessageKey> = {
  INVITED: "lead.state.INVITED",
  ACCEPTED: "lead.state.ACCEPTED",
  EXPIRED: "lead.state.EXPIRED",
  CANCELLED: "lead.state.CANCELLED",
};

/** Commission accrual lifecycle (`CommissionState`). */
const COMMISSION_STATES: Record<string, MessageKey> = {
  PENDING_HOLD: "commission.state.PENDING_HOLD",
  AVAILABLE: "commission.state.AVAILABLE",
  RESERVED_FOR_WITHDRAWAL: "commission.state.RESERVED_FOR_WITHDRAWAL",
  PAID: "commission.state.PAID",
  REVERSED: "commission.state.REVERSED",
  NEEDS_REVIEW: "commission.state.NEEDS_REVIEW",
};

/** What earned the commission (`CommissionTrigger`). */
const COMMISSION_TRIGGERS: Record<string, MessageKey> = {
  FIRST_SUBSCRIPTION_PAYMENT: "commission.trigger.FIRST_SUBSCRIPTION_PAYMENT",
  SUBSCRIPTION_RENEWAL: "commission.trigger.SUBSCRIPTION_RENEWAL",
};

/**
 * Resolves a mapped enum, falling back to a de-underscored, lower-cased value so
 * an enum added on the server never renders as raw SCREAMING_CASE.
 */
function labelFor(map: Record<string, MessageKey>, t: Translator, value: string): string {
  const key = map[value];
  return key ? t(key) : value.replace(/_/g, " ").toLowerCase();
}

export const paymentStateLabel = (t: Translator, state: string) => labelFor(PAYMENT_STATES, t, state);
export const grantStateLabel = (t: Translator, state: string) => labelFor(GRANT_STATES, t, state);
export const deviceStateLabel = (t: Translator, state: string) => labelFor(DEVICE_STATES, t, state);
export const fulfillmentStateLabel = (t: Translator, state: string) => labelFor(FULFILLMENT_STATES, t, state);
export const accountStatusLabel = (t: Translator, state: string) => labelFor(ACCOUNT_STATES, t, state);
export const subscriptionStateLabel = (t: Translator, state: string) => labelFor(SUBSCRIPTION_STATES, t, state);
export const leadStateLabel = (t: Translator, state: string) => labelFor(LEAD_STATES, t, state);
export const commissionStateLabel = (t: Translator, state: string) => labelFor(COMMISSION_STATES, t, state);
export const commissionTriggerLabel = (t: Translator, trigger: string) => labelFor(COMMISSION_TRIGGERS, t, trigger);
