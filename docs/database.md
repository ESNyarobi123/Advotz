# Database

PostgreSQL 16 with Prisma 6.19. The schema is `packages/db/prisma/schema.prisma`. The migrations in `packages/db/prisma/migrations` are applied in order and never edited after they are merged:

| Migration | Adds |
|---|---|
| `20260930040345_phase1_identity` | Users, sessions, tokens, Resellers, Agents, leads, invitations, referral attribution, audit, outbox |
| `20260930041207_phase2_6_domain` | Plans, subscriptions, controllers, sites, devices, packages, orders, payments, webhook inbox, vouchers, grants, commissions, ledger, withdrawals, payouts, network operations, notifications, support, settings, plus the raw-SQL invariants below |
| `20260930041313_ledger_account_types` | Account types `PLATFORM_WITHDRAWAL_FEE_REVENUE` and `RESELLER_PENDING_SETTLEMENT` |
| `20260930041619_payout_destination_verification` | Payout destination verification fields |
| `20260930120000_totp_replay_guard` | `User.mfaLastStep`, the last accepted TOTP time step |

Apply them with `pnpm db:migrate:deploy`. In Docker, the one-shot `migrate` service runs this before the API starts. `GET /health/ready` reports `database: "unmigrated"` (HTTP 503) when no finished migration is recorded.

## Units

- **Money:** whole TZS in `BIGINT` columns named `*Tzs`. Floats are never used.
- **Percentages:** basis points (`10000` = 100%) in integer columns named `*BasisPoints` / `basisPoints`.
- **Time:** `timestamptz` in UTC. Display is in `Africa/Dar_es_Salaam` or the site's IANA time zone.
- **Bandwidth:** integer Kbps. **Data quota:** bytes as `BIGINT`.

## Models

Identity: `User`, `AuthSession`, `VerificationToken`, `Reseller`, `Agent`, `Lead`, `ResellerInvitation`, `ReferralAttribution`, `AuditEvent`.
Platform: `PlatformPlan`, `Subscription`, `SubscriptionInvoice`, `SystemSetting`.
Network: `Controller`, `ControllerCapability`, `Site`, `ControllerSiteMapping`, `DeviceClaim`, `Device`, `NetworkOperation`, `NetworkSession`.
Catalog and sales: `WifiPackage`, `PackageRevision` (immutable price and limit snapshot), `PackageSiteAssignment`, `Customer`, `PortalContext`, `Order`, `PaymentAttempt`, `WebhookInboxEvent`, `VoucherGroup`, `Voucher`.
Access: `AccessGrant` (the entitlement), `AccessGrantDevice` (the authorization of one MAC under it).
Money: `CommissionPolicy`, `CommissionAccrual`, `LedgerAccount`, `Journal`, `JournalLine`, `PayoutDestination`, `Withdrawal`, `WithdrawalAllocation`, `PayoutAttempt`.
Other: `OutboxEvent`, `Notification`, `SupportTicket`, `SupportMessage`.

## Ledger

Double-entry bookkeeping. Every movement of money is a `Journal` with at least two `JournalLine`s whose debits equal their credits. `Journal.sourceKey` is unique, so posting the same business event twice is a no-op.

Account types (`LedgerAccountType`):

- **Platform:** `PROVIDER_CLEARING`, `PLATFORM_SUBSCRIPTION_REVENUE`, `PLATFORM_SALE_FEE_REVENUE`, `PLATFORM_WITHDRAWAL_FEE_REVENUE`, `PROVIDER_FEE_EXPENSE`, `COMMISSION_EXPENSE`, `OVERPAYMENT_LIABILITY`, `PAYOUT_CLEARING`.
- **Reseller:** `RESELLER_PAYABLE` (withdrawable), `RESELLER_PENDING_SETTLEMENT` (sale booked, provider fee not yet known).
- **Agent:** `AGENT_PENDING_PAYABLE` (on hold), `AGENT_AVAILABLE_PAYABLE`.
- **Both beneficiaries:** `WITHDRAWAL_RESERVE`.

Journal sources (`sourceKey` pattern → `sourceType`):

| Key | Type | When |
|---|---|---|
| `payment:<attemptId>` | `subscription_receipt` / `wifi_sale_receipt` | Payment confirmed |
| `settlement:<attemptId>` | `wifi_sale_settlement` | Admin records the provider fee for a sale booked without one |
| `overpayment:<attemptId>` | `overpayment` | Paid more than the order amount |
| `commission:<accrualId>` | `commission_accrual` | Commission accrued (pending) |
| `commission-release:<accrualId>` | `commission_release` | Hold ended: pending → available |
| `commission-reversal:<accrualId>:<total>` | `commission_reversal` | Admin reversal |
| `withdrawal-reserve:<id>` / `withdrawal-release:<id>` | `withdrawal_reserve` / `withdrawal_release` | Withdrawal requested / rejected |
| `payout-complete:<attemptId>` / `payout-failed:<attemptId>` / `payout-reversed:<attemptId>` | `payout_completed` / `payout_failed` / `payout_reversed` | Payout result |

## Invariants enforced in SQL

These are in raw SQL in the `phase2_6_domain` migration, because Prisma cannot express them:

- `JournalLine_amounts_check`: both amounts ≥ 0, and exactly one of debit and credit is non-zero.
- `JournalLine_balanced`: a deferred constraint trigger. At commit, each journal must have at least 2 lines and debits equal to credits.
- `Journal_append_only`, `JournalLine_append_only`: `UPDATE` and `DELETE` raise an exception. Corrections are new journals.
- `Order_amount_check` (amount > 0), `PackageRevision_values_check` (price > 0, duration > 0, max devices ≥ 1).
- `CommissionPolicy_mode_check`: FIXED needs `fixedTzs > 0`; PERCENTAGE needs `basisPoints` between 1 and 10000.
- `CommissionAccrual_amounts_check`: reserved + paid + reversed ≤ amount.
- `Withdrawal_amounts_check`: `totalDebitTzs = amountTzs + providerFeeTzs + platformFeeTzs`.
- `Withdrawal_active_reserve_key`: a partial unique index allowing one open withdrawal per beneficiary.
- `DeviceClaim_open_mac_key`: a partial unique index allowing one open claim per MAC.

## Tenancy

- Tenant-owned rows carry `resellerId` (or `agentId`/`ownerId` for Agent money). Services always take the tenant ID from the session and filter by it.
- `ReferralAttribution.resellerId` is unique, so a Reseller is attributed to at most one Agent. Changes go through an audited Admin correction.
- Guest data (`Customer` phone, sessions) is visible to the owning Reseller and to Admin support only.

## Test databases

- `advo_test` is used by `pnpm test:integration`. It is migrated automatically and truncated per suite, and the run refuses any database not named `*_test`.
- `advo_smoke` is used by `pnpm smoke` / `pnpm test:e2e`. It is truncated per run, and the run refuses any database not named `*_smoke`.
