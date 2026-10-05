import { prisma } from "@advo/db";
import { OutboxEventType } from "../../common/events.js";
import { authorizeGrantDevice, createGrantForOrder, revokeGrantDevice } from "../access/grants.service.js";
import { evaluateSubscriptionCommission } from "../commissions/commissions.service.js";
import { provisionSite } from "../network/sites.service.js";
import { processInboxEvent } from "../payments/inbox.service.js";
import { reconcilePaymentAttempt } from "../payments/payments.service.js";
import { activateSubscriptionForOrder } from "../subscriptions/subscriptions.service.js";
import { dispatchWithdrawal, reconcilePayoutAttempt } from "../withdrawals/payouts.service.js";

type Payload = Record<string, string | undefined>;

function need(payload: Payload, key: string): string {
  const v = payload[key];
  if (!v) throw new Error(`Outbox payload missing ${key}`);
  return v;
}

/** Every handler is idempotent: replays and concurrent deliveries converge on one outcome. */
export async function handleOutboxEvent(eventType: string, payload: Payload): Promise<unknown> {
  switch (eventType) {
    case OutboxEventType.PAYMENT_INBOX_RECEIVED:
      return processInboxEvent(need(payload, "inboxId"));
    case OutboxEventType.PAYMENT_RECONCILE:
      return reconcilePaymentAttempt(need(payload, "attemptId"));
    case OutboxEventType.ORDER_PAID: {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: need(payload, "orderId") } });
      if (order.purpose === "PLATFORM_SUBSCRIPTION") {
        return activateSubscriptionForOrder(order.id, need(payload, "paymentAttemptId"));
      }
      return createGrantForOrder(order.id);
    }
    case OutboxEventType.GRANT_AUTHORIZE:
      return authorizeGrantDevice(need(payload, "grantDeviceId"));
    case OutboxEventType.GRANT_REVOKE:
      return revokeGrantDevice(need(payload, "grantDeviceId"));
    case OutboxEventType.SUBSCRIPTION_ACTIVATED:
      return evaluateSubscriptionCommission(need(payload, "invoiceId"), need(payload, "paymentAttemptId"));
    case OutboxEventType.SITE_PROVISION:
      return provisionSite(need(payload, "operationId"));
    case OutboxEventType.WITHDRAWAL_APPROVED:
      return dispatchWithdrawal(need(payload, "withdrawalId"));
    case OutboxEventType.PAYOUT_RECONCILE:
      return reconcilePayoutAttempt(need(payload, "attemptId"));
    case OutboxEventType.RESELLER_REGISTERED:
    case OutboxEventType.NOTIFICATION_SEND:
      return "noop";
    default:
      throw new Error(`No handler for outbox event ${eventType}`);
  }
}
