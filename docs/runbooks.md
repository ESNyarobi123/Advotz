# Runbooks

Operational procedures for Advo TZ. Alerts in `infra/observability/alerts.yml` link to the sections below by anchor.

**Status.** These procedures were checked against the local Docker stack and the fake payment and controller adapters. None of them has been run against live Snippe or a real Omada Controller yet.

## Where to look

| Signal | Where |
|---|---|
| Liveness / readiness | `GET /api/v1/health/live`, `GET /api/v1/health/ready` (database, Redis, Snippe credentials) |
| Metrics | `GET /api/v1/internal/metrics` with `Authorization: Bearer $METRICS_TOKEN` (404 when the token is unset). The proxy blocks `/api/v1/internal/*` from the internet; scrape it on the internal network. |
| Outbox, payments, webhooks, withdrawals, network operations | Admin dashboard → Operations (outbox, **Drain outbox**, **Run sweepers**), Payments, Withdrawals, Sites & devices |
| Ledger balance | Admin → Ledger (trial balance must read `BALANCED`) |
| Who did what | Admin → Audit log |
| Logs | `docker compose --env-file .env.production -f infra/docker/compose.prod.yml logs -f api worker proxy` |

Admin actions that recover stuck work, each idempotent and safe to repeat:

- `POST /api/v1/admin/operations/run-sweepers` runs the same sweep the worker runs every 60 s: it retries stale inbox events, reconciles payments and payouts, releases due commissions, expires subscriptions and sweeps grants.
- `POST /api/v1/admin/operations/drain-outbox` dispatches due outbox events now.
- `POST /api/v1/admin/payments/:id/reconcile` asks the provider for the payment status by reference.

Before using any recovery action, write down the order ID, payment reference and customer phone from the ticket. Never mark money as paid or failed by editing the database.

---

## Controller outage

**Alerts:** `ControllerUnreachable`, `ControllerErrors`.

**Impact.** New WiFi authorizations cannot be pushed to the Controller. Guests who have already paid get an access grant, but their device stays `PENDING` until it is authorized. Guests who are already online are not affected, because their traffic never passes through Advo.

1. Confirm the outage on Admin → Controllers with **Inspect now**. This is a read-only call, and the result is stored with the time it was made.
2. Check the Controller directly (Omada web UI or cloud status). Advo cannot repair the Controller.
3. Keep portal sales open **only if** you accept that customers will pay and then wait. Otherwise tell Resellers to pause selling. Advo has no automatic sales pause yet.
4. When the Controller is back, the Reseller presses **Retry** on the failed device (Reseller → Customers & access), or call `POST /api/v1/reseller/grant-devices/:id/retry`. Grants whose activation window has passed are marked `ACTIVATION_FAILED` by the sweeper. Handle those as described in [Paid but not connected](#paid-but-not-connected).
5. Check `advo_network_operation_errors_last_hour` by `code` to make sure the errors have stopped.

The time left on a grant keeps counting from the moment it was **first** confirmed active. A retry never extends it.

## Snippe outage

**Signals:** `PaymentsNeedReview` alert; portal orders stuck at "Waiting for payment"; `https://api.snippe.sh` unreachable in `pnpm verify:integrations`.

1. Check that the outage is on Snippe's side: run `pnpm verify:integrations` from an API host (read-only; it prints only the TLS status code) and check Snippe's status channel.
2. Do **not** retry payments by hand with new idempotency keys. A payment whose create call timed out is recorded as `UNKNOWN`. When Snippe recovers, the sweeper looks it up by reference, or re-sends it with the original idempotency key if no reference was saved.
3. Payouts: leave approved withdrawals alone. A payout attempt in `UNKNOWN` state is looked up by reference, or re-sent with its **original** idempotency key if no reference was saved. It is never sent with a new key. See [Unknown payout](#unknown-payout).
4. Once Snippe is back, run **run-sweepers** once and watch `advo_payment_attempts{state="UNKNOWN"}` go down.
5. If an attempt is still unresolved 23 hours after creation (the provider idempotency window), the system marks it `NEEDS_REVIEW`. Resolve it with Snippe support using the payment reference, and never guess the outcome.

## Redis outage

**Alerts:** `OutboxLag` (outbox not draining); readiness reports `"redis":"down"` with status `degraded`.

**Impact.** BullMQ queues stop, so the worker cannot pick up jobs. Rate limiting falls back as follows: with `RATE_LIMIT_BACKEND=redis`, a Redis error makes the API use its per-process memory limiter. API requests keep working, and outbox rows keep accumulating safely in Postgres.

1. `docker compose … ps redis` and `logs redis`. Redis runs with AOF and `noeviction`. If memory is full it refuses writes rather than dropping jobs, so check `used_memory` against the container limit.
2. Restart Redis: `docker compose … restart redis`. The worker reconnects on its own.
3. Once Redis is back, run **drain-outbox** and then **run-sweepers**. Nothing is lost, because the outbox in Postgres is the source of truth and Redis only carries jobs.
4. Check that `advo_outbox_pending` and `advo_outbox_oldest_pending_age_seconds` fall back to near zero.

## Delayed webhook

**Alerts:** `WebhookInboxBacklog`, `WebhookInboxFailures`, `PaymentsNeedReview`.

Webhooks are verified from the raw request body (`X-Webhook-Signature` = HMAC-SHA256 of `"${timestamp}.${rawBody}"`) and stored in the inbox before any processing.

- **Received but not processed** (`RECEIVED` older than 2 min): the sweeper retries it. Run **run-sweepers** to retry now.
- **Stale event** (timestamp more than 1 h old): stored and flagged. Its payment is confirmed by provider lookup, not by trusting the old event.
- **Rejected signature (401):** check that `SNIPPE_WEBHOOK_SECRET` matches the Snippe dashboard and that nothing between Snippe and the API rewrites the body. Prove the proxy passes exact bytes with `infra/scripts/webhook-probe.mjs`: the untouched body must return 200 and the tampered one 401.
- **`QUARANTINED`:** amount or currency did not match the order. Access is **never** granted. Check the Snippe dashboard, then refund or contact the customer.
- **Webhook never arrived:** payments in `PENDING` state are looked up every sweep once they are more than 2 minutes old, so a lost webhook only delays fulfilment.

## Unknown payout

**Alert:** `PayoutsUnknownOrStale`.

A payout whose send call timed out, or whose result is unclear, is recorded as `UNKNOWN`, and its withdrawal stays `PROCESSING` or `UNKNOWN`. The money stays in `WITHDRAWAL_RESERVE` until the result is known.

1. Do **not** approve a second withdrawal or send money manually. That is how double payouts happen.
2. Run **run-sweepers**. If the attempt has a provider reference, it is looked up. If the send timed out before a reference was saved, it is re-sent with the **same** idempotency key, so Snippe returns the original payout instead of creating a second one. This only happens within 23 hours of creation. After that the withdrawal becomes `NEEDS_REVIEW`.
3. If the lookup still cannot decide, find the payout reference on Admin → Withdrawals and confirm it with Snippe support.
4. Once confirmed, the result arrives through the webhook or lookup:
   - Completed: the reserve moves to payout clearing and the withdrawal becomes `COMPLETED`.
   - Failed: the reserve returns to the beneficiary's available balance (`REVERSED`).
5. Check the ledger is still `BALANCED`.

## Paid but not connected

**Alerts:** `PaidOrdersWithoutFulfilment`, `ActivationFailureRate`.

1. Find the order: Admin → Payments (by phone or reference), or the customer's order status link.
2. Payment state:
   - `PAID` + fulfilment `PENDING`: the grant is waiting on the outbox or the Controller. Run **drain-outbox**, then check the Controller ([Controller outage](#controller-outage)).
   - Grant `ACTIVE`, device `FAILED`: the Reseller retries the device (Customers & access → **Retry**).
   - Grant `ACTIVATION_FAILED`: the activation window passed without a confirmed authorization. The customer paid and received nothing. Refund through Snippe or give a voucher. Refunds are not automated in this release.
3. The customer can join again from the same or another device with the recovery link on their receipt, up to the package's device limit, without paying again.
4. Record the resolution in the support ticket.

## Wrong quota enforcement

**Alert:** `ExpiredAccessStillObserved`.

Quota packages (`TOTAL`, `DAILY`, `MONTHLY`) can be sold only when the Controller capability is **supported and lab-verified**. In production that is currently never true, so only time-based unlimited packages are sold.

1. If guests stay online after their grant expired, compare the grant's `expiresAt` with the Controller's client list for that MAC.
2. Revoke the grant (Reseller → Customers & access → **Revoke**, which asks for a reason). This sends a revoke operation to the Controller.
3. If the Controller ignores the time limit it was given, record it on the Controller's capability list (Admin → Controllers) as not verified so that packages depending on it are refused, and file it as a Controller issue.
4. Advo cannot read usage counters from Omada yet (`readUsage` is unsupported), so data-quota complaints cannot be checked from Advo.

## Stuck adoption

Resellers submit a device claim with the MAC and model, and an Admin approves it after checking the serial or photo (Admin → Sites & devices → Device claims awaiting review). If a claim sits at `SUBMITTED`, the fix is an Admin review, not a Controller call. Approval records the device, but it does **not** mean the Controller adopted it. The fake controller reports adoption as unsupported, and a live Controller supports it only if its Open API contract declares `adoptDevice`. Adoption on real hardware has not been verified. Until it is, adopt the EAP in the Omada UI. If a site stays at `AWAITING_DEVICE` or its mapping is not `PROVISIONED`, check the network operations list for a failed site provisioning, then use **Retry provisioning** on the Reseller's Sites & devices page.

## Missing settlement data

When a `payment.completed` webhook arrives without Snippe settlement figures, the provider fee is unknown. The sale is booked with the Reseller's share in `RESELLER_PENDING_SETTLEMENT`, and that share cannot be withdrawn yet.

1. Get the actual fee from the Snippe statement.
2. Admin → Payments → **Settle fee**, and enter the fee and the statement reference. This posts one settlement journal: pending → payable, fee → provider clearing. It also writes a `payment.settled` audit event with the reason.
3. A sale can be settled only once. A second attempt is refused.

## Mismatched ledger

**Alert:** `LedgerOutOfBalance`.

Journals are append-only, and the database rejects any journal whose debits and credits do not match. An imbalance therefore means data was changed outside the application (a manual SQL edit, a partial restore) or there is a bug.

1. **Stop withdrawal approvals** until this is resolved.
2. Admin → Ledger shows the trial balance per account type and `advo_ledger_imbalance_tzs` shows the size.
3. Check the audit log and database access logs for manual changes since the last balanced state.
4. If a restore is involved, restore the full dump again ([Restore from backup](#restore-from-backup)). A partial restore is the likely cause.
5. Correct with a new, reasoned adjustment journal. Never edit or delete journal lines, because the triggers `Journal_append_only` and `JournalLine_append_only` block that on purpose.

## Dead outbox events

**Alert:** `OutboxDeadEvents`.

An outbox event is retried 12 times with exponential backoff, capped at 1 hour between tries. After that its `lastError` starts with `DEAD:`.

1. Admin → Operations, and read `lastError` in the outbox table.
2. Fix the cause (usually a Controller or provider configuration error), then reset the event so it is picked up again:
   `UPDATE "OutboxEvent" SET attempts = 0, "nextAttemptAt" = now(), "lastError" = NULL WHERE id = '…';`
   and run **drain-outbox**. The handlers are idempotent, so dispatching the event again is safe.

## Restore from backup

The `backup` service writes `pg_dump -Fc` files to `$BACKUP_DIR` (default daily, kept 14 days). Each dump is written to `*.partial`, renamed when complete and checked with `pg_restore --list`. **The backups stay on the same host.** Copy them off the host yourself; this is not bundled.

```bash
ls backups/                                   # choose a dump
infra/scripts/restore.sh backups/advo-YYYYMMDDTHHMMSSZ.dump --env-file .env.production
```

The script stops `api`, `worker` and `backup` and restores with `--clean --if-exists`. It then runs `migrate` (a no-op when the dump is current) and starts the services again. Afterwards:

1. `GET /api/v1/health/ready` returns `ready` with `database: up`.
2. Admin → Ledger reads `BALANCED`.
3. Payments or payouts created after the dump are unknown to the restored database. Run **run-sweepers**, then check Snippe for transactions after the dump time, before re-opening withdrawals.

This procedure was rehearsed on the local Docker stack: the schema was dropped and restored, users, sites, migrations and ledger triggers came back, and an existing session still worked.

## Dev server: `ChunkLoadError` on a route

**Symptom.** The dev server serves a page, then the browser dies on a route layout:

```
Runtime ChunkLoadError
Loading chunk app/(dashboard)/reseller/layout failed.
(error: http://localhost:3000/_next/static/chunks/app/(dashboard)/reseller/layout.js)
```

**Cause.** `next dev` and `next build` write to the **same** `<app>/.next` directory. If a production build runs while the dev server is serving, the build overwrites the dev server's chunks on disk. The dev server still holds the previous manifest in memory, so it hands the browser chunk URLs that no longer exist on disk. The route and its source are fine — `apps/web/src/app/(dashboard)/reseller/layout.tsx` is untouched; nothing is wrong with the code.

**Recovery.** The damage is on disk, so restarting the dev server is *not* enough — the cache has to be deleted first.

```bash
# 1. Stop every dev process, and check for leftovers from an earlier run.
lsof -nP -iTCP:3000 -sTCP:LISTEN     # web
lsof -nP -iTCP:3001 -sTCP:LISTEN     # portal
pkill -f "turbo run dev"

# 2. Drop the corrupt cache. It is regenerated on the next `pnpm dev`.
rm -rf apps/web/.next apps/portal/.next

# 3. Start clean.
pnpm dev
```

Then confirm the chunk that failed serves 200 instead of 404:

```bash
curl -o /dev/null -w '%{http_code}\n' \
  'http://localhost:3000/_next/static/chunks/app/(dashboard)/reseller/layout.js'
```

**Prevention.** `pnpm build` runs `scripts/guard-next-build.mjs` first. When a Next server is already on the app's dev port the guard refuses to build and prints these steps, so a build can no longer wipe a live dev server. Override it only when the port belongs to something else entirely:

```bash
ALLOW_BUILD_WITH_DEV=1 pnpm --filter @advo/web build
```

**Two dev servers at once.** A second `pnpm dev` started while the first is still running makes the API die with `EADDRINUSE: address already in use 0.0.0.0:4000`, while the older web server keeps serving — usually from a stale `.next`. The old run is normally *orphaned* (`ps -o ppid= -p <pid>` reports `1`), so `pkill`/`Ctrl-C` on the visible terminal does not stop it. Always enumerate the listeners above and kill them by PID rather than starting a second pipeline.

---

## Local e2e

Runs the API smoke flow plus Playwright against a disposable `advo_smoke` database. Everything in it is simulated.

```bash
# 1. dev Postgres + Redis, and a smoke database
docker compose -f infra/docker/compose.dev.yml up -d postgres redis
docker compose -f infra/docker/compose.dev.yml exec postgres createdb -U advo advo_smoke
DATABASE_URL=postgresql://advo:…@localhost:5432/advo_smoke pnpm db:migrate:deploy

# 2. API on 4100 against advo_smoke (fake providers, inline outbox)
cd apps/api && DATABASE_URL=…/advo_smoke API_PORT=4100 OUTBOX_INLINE=true PAYMENT_PROVIDER=fake pnpm start

# 3. web + portal pointed at it
cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:4100 NEXT_PUBLIC_PORTAL_URL=http://localhost:3001 pnpm dev
cd apps/portal && NEXT_PUBLIC_API_URL=http://localhost:4100 API_INTERNAL_URL=http://localhost:4100 pnpm dev

# 4. run (the setup truncates advo_smoke and refuses any database not ending in _smoke)
E2E_DATABASE_URL=postgresql://advo:…@localhost:5432/advo_smoke pnpm test:e2e
```

With `RATE_LIMIT_BACKEND=memory`, restart the API between repeated runs or the login limits trip. The admin login test waits for a new 30-second TOTP window, because each code is accepted only once.

## Live validation

Not performed yet. It needs Snippe live credentials and an Omada lab Controller with an EAP. Suggested order:

1. `pnpm verify:config` and `pnpm verify:integrations` with the live values. These are read-only checks: credential presence, the local HMAC self-test, TLS reachability, the Omada contract, and read-only controller inspection.
2. Register the webhook URL in Snippe, run `webhook-probe.mjs` against the public URL, then send one real test payment of the smallest allowed amount (500 TZS) from a staff phone.
3. On the lab Controller: inspect, record the capabilities with evidence, sell a 1-hour unlimited package to a staff device, and measure the time limit and speed limit against the Controller UI.
4. One payout of the minimum (5,000 TZS) to a staff number.
5. Record the dates, versions and results in `docs/acceptance-results.md`. Until then no live result may be claimed.
