# Acceptance results

**Run date:** 30 September 2026, on a macOS development host (Node 25.8.1, pnpm 11.10.0, Docker 29.7.2 / Compose 5.5.1). Postgres 16.15 and Redis 7.4.11 ran in containers.

**Scope of the evidence.** Every result below uses the **fake** payment provider and the **fake** Omada controller. None of them is evidence about Snippe, Omada or real EAP hardware. There are **no live or lab results**; see [External blockers](#external-blockers).

## Commands and results (final run, after all code changes)

| Command | Result |
|---|---|
| `pnpm lint --force` | 4/4 tasks pass |
| `pnpm typecheck --force` | 15/15 tasks pass |
| `pnpm build --force` (with `NODE_ENV` unset) | 14/14 tasks pass, no cache |
| `pnpm test --force` | **48 unit tests pass**: config 12, payments 10, omada 8, contracts 2, backend 16 |
| `pnpm test:integration` | **37/37 pass** against `advo_test`: auth 8, domain flows 29 |
| `E2E_DATABASE_URL=…/advo_smoke pnpm test:e2e` | **35/35 smoke checks** plus **9/9 Playwright tests** (desktop and Pixel 7 portal) |
| `pnpm verify:config` (clean env) | OK. Warns that Node 25 is not LTS |
| `pnpm verify:integrations` (clean env) | No blocking problems. Snippe and Omada are reported as fake or unsupported, as expected |
| `pnpm db:migrate:deploy` | All 5 migrations applied on `advo`, `advo_test`, `advo_smoke` and the Docker stack |
| `promtool check rules infra/observability/alerts.yml` | 13 rules OK |
| `caddy validate` (Caddyfile) | Valid |

The Playwright suite opens **every sidebar page** for each role (14 Admin, 9 Reseller, 5 Agent) and fails on a page stuck loading, an error message or any uncaught browser error.

## Docker topology (local)

The production images and `compose.prod.yml` were run locally as project `advo-local-check` with `infra/docker/local-check.env`: fake providers, `NODE_ENV=development`, plain HTTP on port 8080.

| Check | Result |
|---|---|
| Image sizes | backend about 1.57 GB, web about 437 MB, portal about 433 MB |
| Clean start | `migrate` ran once, then `api` became healthy, then web and portal started. The rebuilt image applied the new `totp_replay_guard` migration |
| Non-root, read-only filesystem | Confirmed for api, worker, web and portal |
| Edge routing | `/api/v1/health/*` 200; `/api/v1/internal/metrics` and `/api/docs` 404 at the proxy; web and portal `/api/*` same-origin to the API |
| Metrics auth (internal) | No token 401, wrong token 401, correct token 200 with Prometheus text |
| Webhook through Caddy | `webhook-probe.mjs`: exact bytes 200, one byte changed 401 |
| Session and CSRF through proxy | Reseller login sets an HttpOnly cookie. A POST from an untrusted origin gets 403 |
| Worker via BullMQ | Site provisioning job completed within 2 polls |
| Production guard | With `NODE_ENV=production` and fake providers, **both API and worker refuse to start** |
| Backup and restore | Schema dropped, then `restore.sh`. Users, sites, migrations and ledger triggers came back, and an existing session still worked |
| Graceful stop | Worker exits 0. API exits 143 (Nest re-raises SIGTERM) |
| Admin bootstrap in container | Command runs. It correctly refuses (409) because that database already has an Admin |

## Spec §24 gates

**Status key:**

- **Tested:** an automated test covers it (simulated providers).
- **Code only:** implemented, but no automated test yet.
- **Blocked:** needs live Snippe or lab hardware.
- **N/A:** the feature is intentionally disabled.

### 24.1 Registration and authorization

| Gate | Status | Evidence |
|---|---|---|
| Direct registration creates no attribution | Tested | auth: "registers a reseller without referral…" |
| Referral attributes once; tampered role ignored | Tested | auth: "attributes exactly once…", "ignores client-supplied role elevation…" |
| Invitation binds Agent; token not reusable | Tested | auth: "binds invitation attribution and prevents token reuse"; smoke |
| Agent cannot access guest phone, session or payment data | Tested | auth: "agent role cannot access guest data or perform unauthorized role actions"; Role guard on `/reseller/*` and `/admin/*`; Agent routes expose no guest data; e2e Agent screens |
| Reseller A cannot touch Reseller B's resources | Tested | domain: "tenant isolation…" (site read, voucher list, grant revoke, cross-site voucher); smoke: foreign site 404; e2e: Reseller kept out of Admin |
| Jobs and exports preserve tenant boundaries | Tested | domain: "jobs and exports preserve tenant boundaries: Reseller B cannot export or mutate A's voucher groups" |
| Password reset revokes sessions; token single-use | Tested | auth: "password reset revokes existing sessions and its token works once" (two concurrent resets, one wins) |
| Admin MFA; TOTP single-use | Tested | smoke (MFA required, replayed code refused), auth: "accepts each authenticator code once", e2e: wrong code refused |

### 24.2 Payments and event processing

| Gate | Status | Evidence |
|---|---|---|
| One attempt per order; same request returns same attempt | Tested | domain: "guest purchase…" (replayed idempotency key, one attempt) |
| Duplicate signed events post once | Tested | domain: "duplicate concurrent signed events post money and entitlement once", redelivered and fresh events give one activation, one commission and one journal |
| Bad signature / wrong amount cannot fulfil | Tested | domain: unsigned and tampered rejected; amount mismatch quarantined. Wrong currency and wrong account: code only |
| Failure after completion cannot roll back | Tested | domain: "failure event delivered after completion cannot roll back payment or payout funds" (payout failure after completion sets NEEDS_REVIEW; late payment failure leaves order PAID) |
| Create timeout keeps unknown state; no blind new attempt | Tested | domain: "a payment create timeout becomes UNKNOWN and reconciles…"; payments unit test |
| Completion after UI timeout recovers | Tested | domain: "completion after UI timeout recovers fulfillment via sweeper" |
| Two successful attempts: overpayment and one entitlement | Tested | domain: "two successful payment attempts create overpayment handling and exactly one entitlement" (creates OVERPAYMENT_LIABILITY journal line, exactly 1 grant) |
| Crash after receipt before enqueue recovered by outbox | Code only (by design) | The outbox row is written in the same transaction, and leases expire. No crash-injection test |
| Redis outage does not lose paid fulfilment | Code only (by design) | The Postgres outbox is the source of truth. No Redis-kill test was run |
| Raw body verified exactly | Tested | payments unit: "rejects a modified body even by one byte"; Caddy probe |
| Timestamp tolerance | Tested | payments unit: future skew and stale window |

### 24.3 Omada and access

| Gate | Status | Evidence |
|---|---|---|
| Serializer fixtures; unknown profiles refused | Tested | omada unit: 8 tests |
| Failed site creation does not duplicate | Tested | domain: "failed site creation does not duplicate remote sites on retry" |
| Authorization only after verified payment or voucher | Tested | domain: quarantine gives no grant; purchase and voucher flows |
| Payment stays completed if activation fails | Tested | domain: "a definite Controller rejection fails the device…" |
| Retries do not restart grant duration | Tested | domain: second device and timeout reconciliation keep the expiry |
| Controller accepted but DB not confirmed: expiry recovered | Tested | domain: "Controller timeout after acceptance is reconciled with the same candidate expiry" |
| Device limit | Tested | domain: "multiple concurrent devices cannot exceed package device limit"; e2e: second device beyond limit refused |
| Quota counters, reset and roaming | N/A | Quota packages cannot be sold (`readUsage` unsupported) |
| Quota only with verified enforcement | Tested | domain: "refuses to sell a quota package…"; unit `canEnforce` |
| Revoke and expiry prevent reconnection on real hardware | **Blocked** | Needs a lab EAP |
| Controller timeout gives an uncertain state, then reconciliation | Tested | domain (see above) |
| Offline Controller does not grant soft-fail access | Tested | domain: rejection and timeout never mark a device authorized |
| Invalid redirect context cannot authorize another client or site | Tested | domain: Reseller A's voucher refused at B's context; e2e: portal without context cannot buy |

### 24.4 Commission and wallet

| Gate | Status | Evidence |
|---|---|---|
| Registration and trial create no commission | Tested | domain: "a trial alone never creates commission"; auth tests |
| Failed subscription payment creates no commission | Tested | domain: "subscription renewal uses renewal policy..." (unpaid invoice evaluated as not_eligible) |
| First payment and renewal use the right policy | Tested | domain: first payment 10% = 2,000; renewal uses renewal policy 5% = 1,000; smoke 1,500 |
| Duplicate paid events create one accrual | Tested | domain (unique source, Agent and trigger) |
| Rate changes do not rewrite old commission | Tested | domain: policy snapshot stored on each accrual, policy rate change preserves existing accrual |
| Reversal before payout; adjustment after payout | Code only | `reverseAccrual` sets `REVERSED` or `NEEDS_REVIEW`. Automated refunds are not implemented |
| Journals balance | Tested | domain: trial balance plus append-only triggers ("the ledger balances and journals are append-only"); smoke; e2e ledger `BALANCED` |
| Concurrent withdrawals cannot overspend | Tested | domain: 5 parallel requests, 1 succeeds |
| Unknown payout holds its reserve | Tested | domain: "an uncertain payout keeps its reserve, reuses its key…" |
| Payout webhook retries cannot debit twice | Tested | same test: duplicate `payout.failed` gives one release journal. Completed path: the concurrent-withdrawal test plus the `payout-complete:` unique key |
| Partial withdrawals allocate earnings correctly | Tested | domain: "partial withdrawals allocate Agent earnings across accruals without marking an entire accrual paid prematurely" |
| Fee change cannot exceed the approved debit | Tested | domain: "a payout with provider fee higher than quoted is absorbed by the platform without overcharging the beneficiary" (platform absorbs difference as PROVIDER_FEE_EXPENSE) |
| Failure or reversal returns funds before crediting | Tested | domain: failure returns funds once; "payout reversal restores principal to beneficiary wallet and resets allocations to AVAILABLE" |

### 24.5 UI and hardware evidence

| Gate | Status |
|---|---|
| Role journeys, voucher redemption, purchase states, Agent commission (Playwright) | Tested: 9 tests covering 28 pages |
| Subscription checkout | API smoke flow only (checkout, signed webhook, `ACTIVE`), not Playwright |
| Onboarding and withdrawal review through the UI | Not covered by Playwright. Withdrawal review is covered at the service level by the integration tests |
| Mobile and desktop screenshot review (overflow, contrast) | Not done systematically. Playwright runs the portal on a mobile profile, but no visual assertions or screenshot review are recorded |
| Real-device record (Controller version, EAP firmware, observed lifetime, throughput) | **Blocked**: no lab hardware |
| Manual live payment test | **Blocked**: no Snippe credentials |

## External blockers

| Needed | For |
|---|---|
| Snippe live API key, webhook secret and account | Any real collection, payout or webhook. Snippe's sandbox availability was not confirmed |
| Omada Controller plus EAP in a lab, with Open API client credentials and a hotspot operator account | The contract file, capability verification, authorization, time semantics, speed and quota measurements, revoke and reconnect behaviour |
| Real SMS/email provider | Delivering verification, reset and payout-destination codes. The current transport is fake and never delivers |

Follow [Live validation](runbooks.md#live-validation) when these are available, and record results here.
