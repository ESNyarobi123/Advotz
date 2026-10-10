# Snippe integration

**API docs version:** `2026-01-25` (`SNIPPE_API_DOC_VERSION`). **SDK:** `@snippe/sdk` 1.0.0.
**Status:** the adapter is implemented against the SDK types and the published docs. It has **not been exercised against live Snippe**: no credentials were available, so no real collection or payout has been made. All end-to-end runs use the fake provider.

Sources to re-read before going live:

- <https://docs.snippe.sh/docs/2026-01-25/authentication>
- <https://docs.snippe.sh/docs/2026-01-25/payments> and `/payments/mobile-money`
- <https://docs.snippe.sh/docs/2026-01-25/disbursements/mobile-money>
- <https://docs.snippe.sh/docs/2026-01-25/webhooks>
- <https://docs.snippe.sh/docs/2026-01-25/sdks/javascript>

## Adapter (`packages/payments/src/snippe.provider.ts`)

| Operation | SDK call | HTTP (per SDK and docs) |
|---|---|---|
| Collect by mobile money | `payments.mobile.create` | `POST /v1/payments` |
| Look up a payment | `payments.get` | `GET /v1/payments/{reference}` |
| Payout fee quote | `payouts.mobile.fee` | `POST /v1/payouts/fee` |
| Send a payout | `payouts.mobile.send` | `POST /v1/payouts/send` |
| Look up a payout | `payouts.get` | `GET /v1/payouts/{reference}` |

- **Auth:** Bearer API key (`SNIPPE_API_KEY`), sent by the SDK. Base URL `SNIPPE_BASE_URL`, default `https://api.snippe.sh`.
- **Idempotency:** every create and send passes our own `Idempotency-Key` of 1–30 characters (compact hash of the business key). The SDK would otherwise generate one, which would break safe retries.
- **Timeout:** 20 s per call. The adapter itself does not retry. Retries come from the outbox and sweeper, reusing the same key.
- **Minimums** (enforced before calling): payment 500 TZS, payout 5,000 TZS.
- **Customer block:** the mobile API refuses a payment without `customer.firstName`/`lastName`/`email`, but the guest portal collects none of them — there are no guest accounts, so a device is authorized by RADIUS and a name or email would be stored and never used. `providerCustomerDetails` therefore sends an explicit placeholder (`Advo Guest`, and `<phone digits>@$PORTAL_PAYER_EMAIL_DOMAIN`, whose default `example.com` is reserved by RFC 2606 and cannot deliver). The real name arrives with the payment and replaces it (see below), so nothing invented is ever shown to a Reseller.
- **Error mapping:**
  - Timeout, network error, HTTP 5xx and unrecognised errors are **retryable**. For a payment create or payout send they leave the attempt `UNKNOWN`. Reconciliation looks it up by reference, or, if no reference was saved, re-sends the original body with the **original** `Idempotency-Key` so the provider returns the first result. It never uses a new key.
  - 401/403 (auth), 404, 409, 429 and other 4xx are **not retryable** and become `FAILED` with the provider message, truncated to 300 characters.
- **Idempotency window:** the same-key re-send is attempted only within 23 hours of creation, as a safety margin inside the provider's de-duplication window. After that the payment or withdrawal is marked `NEEDS_REVIEW` for a human.

## Webhooks (`POST /api/v1/webhooks/snippe`)

- **Signature:** `X-Webhook-Signature = hex(HMAC-SHA256(SNIPPE_WEBHOOK_SECRET, "${X-Webhook-Timestamp}.${rawBody}"))`, compared in constant time over the **exact raw bytes**. The API keeps `rawBody`. Caddy passes the body through untouched, which `infra/scripts/webhook-probe.mjs` checks (exact bytes 200, one changed byte 401).
- **Timestamp:** more than 300 s in the future is rejected. Older than `SNIPPE_WEBHOOK_MAX_AGE_SECONDS` (default 3600) is accepted but flagged stale, and its outcome is confirmed by a provider lookup rather than trusted.
- **Inbox:** each verified event is stored once per provider event ID before processing, so redelivery returns 200 without side effects. A redelivery with the same ID but a different body is audited as `webhook.conflicting_duplicate`.
- **Matching:** the amount and currency must match the order, otherwise the event is `QUARANTINED` and no access is granted. Overpayment is booked as a liability.
- **Settlement figures** (`settlement.gross/fees/net`) set the provider fee. When they are missing, the Reseller's share stays pending until an Admin settles it (see [business rules](../business-rules.md)).
- **Payer name:** the guest portal asks for a phone number only, so the customer record starts with no name. Snippe reports the mobile-money account holder in `data.customer.name`; a completed payment fills `Customer.firstName`/`lastName` from it when they are empty, and never overwrites a name already stored. The field is read defensively (`payerName`) — a malformed `customer` must never quarantine a real payment.
- Payout events (`payout.completed`, `payout.failed`, …) finish withdrawals the same way.

## Configuration

| Variable | Required when | Notes |
|---|---|---|
| `PAYMENT_PROVIDER` | always | `snippe` in production (the fake provider is refused) |
| `SNIPPE_API_KEY`, `SNIPPE_WEBHOOK_SECRET` | `PAYMENT_PROVIDER=snippe` | Production startup fails without them. Readiness reports `snippeCredentials: missing` (503) |
| `SNIPPE_WEBHOOK_URL` | live | Sent as `webhookUrl` with each payment and payout. Defaults to `${API_PUBLIC_URL}/api/v1/webhooks/snippe` |
| `SNIPPE_ACCOUNT_ID` | live | Scopes webhook event IDs (the inbox is unique per account and event) and is recorded on payout attempts |
| `SNIPPE_BASE_URL`, `SNIPPE_WEBHOOK_MAX_AGE_SECONDS` | optional | Defaults above |
| `PORTAL_PAYER_EMAIL_DOMAIN` | optional | Domain for the placeholder customer email Snippe requires (default `example.com`, reserved by RFC 2606). Change it only if Snippe refuses the domain |

`pnpm verify:integrations` checks credential presence, the account ID and the webhook URL, runs a local HMAC self-test and makes a TLS reachability check of the base URL (status code only). It never creates a payment.

## Fake provider (development and tests only)

`FakePaymentProvider` keeps its state **in memory**, so restarting the API forgets pending fake payments. It never moves money. Scenario phone numbers:

| Phone | Behaviour |
|---|---|
| `+255700000001` | Payment create times out (attempt becomes `UNKNOWN`, then is reconciled) |
| `+255700000002` | Payment declined (validation) |
| `+255700000003` | Payout send times out |
| `+255700000004` | Payout fails |

The simulated payout fee is a flat 1,000 TZS. **It is not a Snippe tariff.** Delayed-webhook and duplicate-webhook fixtures are not built into the fake provider. The tests reproduce those cases by delivering signed events directly.
