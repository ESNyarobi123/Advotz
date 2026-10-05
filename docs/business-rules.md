# Business rules

These are the rules as implemented. Where a value is a business decision (prices, commission rates, fees), the code has **no default**. An Admin must set it, and production refuses to move money until they do. Demo seeds set sample values that are labelled demo.

## Concepts that must not be confused

- **Platform subscription:** what a Reseller pays Advo to use the platform (`PlatformPlan` → `Subscription`, `SubscriptionInvoice`).
- **WiFi package:** what a Reseller sells to guests (`WifiPackage` with immutable `PackageRevision`s).
- **Access grant:** the guest's entitlement to one package purchase or voucher (`AccessGrant`).
- **Authorization:** one client MAC allowed on the Controller under a grant (`AccessGrantDevice`).
- **Network session:** what the Controller observes (`NetworkSession`). Read-only evidence.

## Currency and amounts

- TZS only, as whole shillings. Percentages are basis points, and results round **down** (integer division).
- Snippe minimums, enforced before calling the provider: payment **500 TZS**, payout **5,000 TZS**.

## Platform subscriptions

- An Admin creates plans with a price, period in days, limits (sites, devices, packages) and an optional trial length. A plan change creates a new version, and existing invoices keep their snapshot.
- **Trial:** once per Reseller, and only for a verified, active Reseller on a trial-eligible plan. The length comes from the plan and is not hard-coded.
- **Payment:** activation happens once per paid invoice, even if the webhook is redelivered. A renewal extends from the later of now and the current period end.
- **Expiry:** the sweeper marks lapsed subscriptions `EXPIRED`. There is **no grace period** and `PAST_DUE` is never set. A Reseller with an expired subscription cannot make new sales, but paid guest grants that already exist are honoured.

## WiFi sales (portal)

- The guest arrives from the EAP redirect. The portal context (client MAC, AP or gateway MAC, SSID, radio or VLAN) is stored server-side, and its token replaces the query parameters in the URL.
- The order snapshots the package revision **and** the platform sale fee (`platform.saleFeeBasisPoints`, 0–5000 bps). Changing the fee later does not affect orders already created. In production, without a configured fee, the sale is refused.
- An order carries an idempotency key, so a repeat request returns the same order.
- **Payment confirmation** comes only from a verified webhook or a provider lookup. The browser's redirect never confirms a payment.
  - Amount or currency mismatch: the event is **quarantined** and access is never granted.
  - Overpayment: the extra amount is booked to `OVERPAYMENT_LIABILITY`.
- **Ledger on a confirmed sale:** gross → provider clearing. The provider fee comes back out of clearing, the platform fee goes to sale-fee revenue, and the rest goes to `RESELLER_PAYABLE`. If Snippe sent no settlement figures, the Reseller's share goes to `RESELLER_PENDING_SETTLEMENT` until an Admin records the fee (**Settle fee**, which is audited, needs a reason, and can be done once).

## Access grants

- A grant is created when payment is confirmed or a voucher is redeemed. It must be activated within the package's activation window, or it becomes `ACTIVATION_FAILED`.
- **The expiry is fixed at first confirmed activation** (`activatedAt + duration`). Retries, Controller timeouts that are later reconciled, and extra devices never extend it.
- Extra devices join with the recovery token or the same voucher, up to `maxDevices`. Beyond that the guest sees "Device limit reached for this package."
- A definite Controller rejection fails that device and clears its unconfirmed clock. A timeout is reconciled with the same candidate expiry.
- A Reseller can revoke a grant with a reason. The revoke goes to the Controller through the outbox.
- **Enforceability:** a package can be created only if the site's Controller can enforce it. That means client authorization always, the per-client rate limit if speeds are set, and total or daily/monthly quota if a quota is set. In production a capability counts only when it is supported **and verified** with recorded lab evidence. Simulated capabilities count only outside production.

## Vouchers

- Codes are random, stored encrypted, and looked up by HMAC. Input is normalised (case, spaces and dashes).
- Each voucher creates exactly one grant. Using it again joins that grant, within the device limit. A code from another Reseller is invalid at your sites.
- Batches can be exported as CSV (audited). Unused codes can be deleted, and batches archived.

## Agent commissions

- **Commission is paid only on a Reseller's platform-subscription payments.** Registration, trials, failed payments and WiFi sales never earn commission.
- Triggers: `FIRST_SUBSCRIPTION_PAYMENT` (the Reseller's first paid invoice) and `SUBSCRIPTION_RENEWAL`. Each needs its own policy, and a missing policy means no commission.
- Policy selection: an Agent-specific policy effective at the payment time, otherwise the global one. Filters are eligible plan codes and an optional referral eligibility window in days.
- Modes: `FIXED` (TZS) or `PERCENTAGE` (bps of the invoice amount), with an optional per-invoice cap. The policy is snapshotted on the accrual.
- Conditions: the attribution must exist and not be expired, and the Agent must be `ACTIVE`. There is at most one accrual per payment, Agent and trigger (unique key).
- **Hold:** the accrual starts in `AGENT_PENDING_PAYABLE` and moves to `AGENT_AVAILABLE_PAYABLE` after `holdDays` (immediately when 0).
- **Reversal (Admin, with a reason):** reverses whatever has not yet been paid out. If part was already paid, the accrual becomes `NEEDS_REVIEW` with the amount that needs adjusting. Paid money is never clawed back automatically.
- **Attribution:** bound when an invitation is accepted, one per Reseller. Correction is an audited, effective-dated Admin action and never rewrites past accruals.

## Withdrawals (Resellers and Agents)

- The payout destination (mobile money number) must be verified with a code, valid 15 minutes, sent through the notification provider. **That provider is fake in this release**, and in development the code is returned in the API response.
- Minimum 5,000 TZS. **One open withdrawal per beneficiary** (a partial unique index). Concurrent requests cannot overspend, as covered by an integration test.
- The quote shows the amount, provider fee and platform withdrawal fee (`platform.withdrawalFeeTzs`, a fixed TZS amount set by an Admin; production refuses withdrawals until it is set). The total is reserved in `WITHDRAWAL_RESERVE` on request.
- An Admin approves or rejects with a reason. Rejection releases the reserve. Approval sends the payout through the outbox.
- Payout result:
  - Completed: reserve → payout clearing.
  - Failed or reversed: reserve → back to available.
  - Unknown: the reserve stays in place. The payout is looked up, or retried only with its original idempotency key within 23 hours, then goes to `NEEDS_REVIEW` (see [runbooks](runbooks.md#unknown-payout)).

## Refunds

Not automated in this release. Refund in the Snippe dashboard and record the resolution in the support ticket.
