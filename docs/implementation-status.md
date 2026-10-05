# Implementation status — Advo TZ

**Updated:** 30 September 2026
**Checkpoint:** Phases 0–8 are implemented as far as they can go without external systems. Everything runs end to end against the fake payment provider and fake Omada controller. The parts of Phases 3, 4 and 8 that need live Snippe or lab hardware are **blocked**, not done.

## How to read this

| Label | Meaning |
|---|---|
| **Implemented** | Code exists and is exercised by automated tests (unit, integration, smoke or Playwright) |
| **Simulated** | Works end to end only against the fake provider or controller. It proves our logic, not the vendor's behaviour |
| **Lab-verified** | Checked against real hardware or live services. **Nothing is in this category yet** |
| **Blocked** | Needs credentials or hardware we do not have |

Detailed test evidence: [acceptance-results.md](acceptance-results.md).

## Phase summary

| Phase | Status | Notes |
|---|---|---|
| 0: Repository and contracts | Implemented | pnpm/Turborepo monorepo, validated env (`@advo/config`), dev Compose, `verify:config` and `verify:integrations`. CI workflow `.github/workflows/ci.yml` passes `actionlint` but **has never run on GitHub** (no remote configured) |
| 1: Identity, tenancy, registration | Implemented | Opaque sessions, Argon2id, Admin TOTP MFA (single-use codes), CSRF origin check, rate limits, self-registration, Agent invitations, attribution, safe Admin bootstrap. Two Resellers and two Agents in the integration fixtures |
| 2: Catalog and billing model | Implemented | Plans, subscriptions, invoices, sites, mappings, device claims, package revisions, orders with price and fee snapshots, vouchers. Double-entry ledger with SQL balance and append-only triggers |
| 3: Snippe collection and fulfilment | Implemented + simulated; live **blocked** | SDK adapter, raw-body HMAC verification, inbox, outbox, reconciliation, unknown-state handling, settlement. No live Snippe call has been made |
| 4: Omada provisioning and access | Implemented + simulated; lab **blocked** | Version profiles, contract-driven Open API client, hotspot operator portal client, capability gating, device claims, grants with fixed expiry, portal and vouchers. No real Controller or EAP has been used |
| 5: Sessions, quota, commission | Implemented + simulated | Commission accrual, hold, release and reversal with policy snapshots. Grant expiry sweeps. Quota packages are refused (unsupported). Usage reading from Omada is unsupported |
| 6: Withdrawals and payouts | Implemented + simulated | Destination verification, fee quote, locked reserves, Admin review, payout dispatch, unknown, failure and reversal. No live payout has been made |
| 7: Full UI and operations | Implemented | Marketing, 28 dashboard pages, Swahili-first portal, support tickets, audit log, operations screen, metrics and alerts, runbooks. Notifications use a **fake** transport |
| 8: Production readiness | Implemented locally; production deployment not done | Docker images, production Compose, Caddy, migrate service, backups and restore drill, production guards, metrics and alert rules, all run on the local Docker stack. Not deployed to a server |

## Changes in this final pass

- **Audited settlement.** `POST /admin/payments/:id/settle` now requires a reason, writes a `payment.settled` audit event and refuses a second settlement. Covered by an integration test.
- **Enum-checked list filters.** Admin and Reseller `state` query filters are validated. An unknown value returns 400 `VALIDATION_ERROR` instead of reaching Prisma and causing a 500 (`enumQuery` helper, with unit tests; checked live against the API).
- **TOTP replay protection.** Migration `20260930120000_totp_replay_guard` adds `User.mfaLastStep`. A code, or an older code inside the drift window, is accepted once. Covered by an integration test and a smoke check. The e2e admin login waits for a fresh 30-second step.
- **Atomic password reset.** The reset token is consumed with a conditional update, so two concurrent resets cannot both succeed. Covered by an integration test.
- **Full money & lifecycle test coverage.** Added 14 new integration test scenarios (bringing total to 37/37): overpayment liabilities, subscription renewal policies, `PAST_DUE` grace period and recovery, partial withdrawal allocations, payout fee absorption, payout reversal restoration, late webhook delivery rejection, concurrent duplicate webhook handling, sweeper fulfillment recovery, concurrent device limits, idempotent site retries, tenant export isolation, agent data isolation, and idle session revocation.
- **Metrics.** Controllers never inspected are excluded from the reachability and age gauges, and counted in `advo_controllers_never_inspected`.
- **Smaller fixes.** `admin:bootstrap` prints a clear refusal. The dev Compose images are pinned to the production tags. The alert runbook links point at `docs/runbooks.md` anchors.
- **Documentation.** All §28 documents were written from the code as it stands.

## Commands run for this checkpoint

```bash
pnpm lint --force                 # 4/4
pnpm typecheck --force            # 15/15
pnpm build --force                # 14/14 (NODE_ENV unset)
pnpm test --force                 # 48 unit tests
pnpm test:integration             # 37/37 (advo_test: auth 8, domain flows 29)
E2E_DATABASE_URL=…/advo_smoke pnpm test:e2e   # 35/35 smoke + 9/9 Playwright
pnpm verify:config && pnpm verify:integrations   # clean env; OK
pnpm db:migrate:deploy            # advo, advo_test, advo_smoke; and the Docker migrate service
docker compose -p advo-local-check --env-file infra/docker/local-check.env -f infra/docker/compose.prod.yml build migrate web && … up -d
actionlint .github/workflows/ci.yml
promtool check rules infra/observability/alerts.yml   # 13 rules
```

## Migrations

`20260930040345_phase1_identity`, `20260930041207_phase2_6_domain`, `20260930041313_ledger_account_types`, `20260930041619_payout_destination_verification`, `20260930120000_totp_replay_guard`.

## Fixtures

- The integration tests reset `advo_test`. They create one Admin, two Resellers and two Agents with invitations, a demo plan, a demo 10% commission policy, a 10% sale fee and a FAKE controller.
- `pnpm smoke` / `test:e2e` truncate `advo_smoke` and create their own demo data. The smoke Admin uses a fixed test password, and that database is only ever local.
- `pnpm db:seed:demo` creates local demo data with **random** passwords, all flagged `isDemo`. It is refused in production or with a real provider.

## Known gaps

| Gap | Impact |
|---|---|
| No live Snippe validation | Payment and payout behaviour is proven only against our reading of the docs and the SDK types |
| No Omada lab validation | Contract file, capability verification, time semantics and measured limits are all outstanding. Production cannot sell until `authorizeClient` is verified |
| Notification transport is fake | Email and SMS codes (verification, reset, payout destination) are never delivered. Dev responses include the codes |
| Refunds not automated | Handled manually in Snippe plus a support note |
| No account lockout after failed attempts | Rate limits on auth endpoints only |
| Fake provider state is in memory | Restarting a dev API forgets pending fake payments |
| Web app is English-only | The portal is bilingual. The web app does not use `@advo/i18n` |
| Invitation notification | `createInvitation` always reports `notificationSimulated` because the transport is fake |
| Operations | No off-host backups, no bundled Alertmanager, no controller latency metric. The backend image is large (SWC runtime) |
| Repository has no commits and no remote | The CI workflow has not run |

## Next tasks

1. Obtain Snippe credentials, then follow [Live validation](runbooks.md#live-validation) steps 1–2 and 4, and record the results.
2. Set up an Omada lab Controller and EAP: write the contract, verify `authorizeClient` and `perClientRateLimit`, record the time semantics, and measure the lifetime and throughput.
3. Connect a real SMS/email provider behind `NotificationProvider`.
4. Push to a remote, run CI, then deploy to a staging host with TLS and off-host backups.
