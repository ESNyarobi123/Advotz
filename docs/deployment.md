# Deployment

**Status.** The production topology below was built and run **locally** (Docker Desktop, project `advo-local-check`) with fake providers over plain HTTP. It has not been deployed to a real server or run with live Snippe or Omada. See [acceptance results](acceptance-results.md#docker-topology-local) for what was actually checked.

## Topology (one host)

`infra/docker/compose.prod.yml`:

| Service | Image | Role |
|---|---|---|
| `postgres` | `postgres:16.15-alpine` | Database (volume `pg_data`) |
| `redis` | `redis:7.4.11-alpine` | BullMQ and rate limits (AOF on, `noeviction`) |
| `migrate` | `advo/backend` | One-shot `prisma migrate deploy`. API and worker start only after it succeeds |
| `api` | `advo/backend` | HTTP API. Healthcheck on `/api/v1/health/ready`, 30 s stop grace |
| `worker` | `advo/backend` | Outbox relay, jobs and sweeper. 90 s stop grace |
| `web`, `portal` | `advo/web`, `advo/portal` | Next.js standalone servers |
| `proxy` | `caddy:2.11.4-alpine` | TLS (automatic ACME certificates), routing, security headers |
| `backup` | `postgres:16.15-alpine` | `pg_dump -Fc` loop to `$BACKUP_DIR` |
| `prometheus` | `prom/prometheus:v3.5.0` | Optional (`--profile observability`); scrapes the API privately and evaluates `alerts.yml` |

The Omada Controller is **not** part of this stack. It is managed separately and reached over HTTPS.

**Hardening.** All app containers run as the non-root `node` user with a read-only root filesystem, a tmpfs `/tmp` and `no-new-privileges`. Logs use json-file with rotation at 20 MB × 5.

## Images (`infra/docker/Dockerfile`)

One multi-stage file:

- `deps` runs `pnpm fetch` against the lockfile.
- `workspace` does an offline frozen install and runs `prisma generate`.
- Build stages produce `web-build` and `portal-build`.
- Runtime targets are `backend`, `web` and `portal`.

The backend image runs TypeScript source through SWC. It is simple, but large (about 1.57 GB, against about 435 MB for web and portal). Compiling to JavaScript and pruning dev dependencies is the obvious next optimisation.

Tag images with a release identifier (`ADVO_IMAGE_TAG=<git sha>`) rather than the default `latest`.

## Proxy (`infra/proxy/Caddyfile`)

- Three sites: `WEB_PUBLIC_URL`, `PORTAL_PUBLIC_URL` and `API_PUBLIC_URL`.
  - On the web and portal hosts, `/api/*` goes to the API, so the browser stays same-origin, and everything else goes to Next.js.
  - The API host proxies everything to `api:4000`.
- Every site has a 1 MB request body limit, security headers, HSTS (swap in the `nohsts` snippet for local HTTP only) and JSON access logs.
- **404 at the edge** for `/api/v1/internal/*` (metrics) and `/api/docs*`.
- The request body is forwarded byte for byte, which webhook signatures depend on. `node infra/scripts/webhook-probe.mjs` checks this.

## First deployment

```bash
cp .env.example .env.production        # fill every value; see "Secrets" below
docker compose --env-file .env.production -f infra/docker/compose.prod.yml build
docker compose --env-file .env.production -f infra/docker/compose.prod.yml up -d
docker compose --env-file .env.production -f infra/docker/compose.prod.yml run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL=… -e BOOTSTRAP_ADMIN_PASSWORD=… api \
  node --import @swc-node/register/esm-register src/admin-bootstrap.ts
```

Then log in, enrol MFA, and set in Admin → Settings the platform sale fee and withdrawal fee. Until they are set, production refuses sales and withdrawals. Next, add plans, commission policies and the LIVE Controller with its contract (see [Omada contracts](integrations/omada-contracts.md)).

> **Compose environment gotcha.** Compose gives variables in your shell priority over `--env-file`. If your shell exports `POSTGRES_PASSWORD`, `DATABASE_URL` or similar (for example from a development `.env`), they silently override production values. Run Compose from a clean environment:
> `env -i PATH="$PATH" HOME="$HOME" docker compose --env-file .env.production -f infra/docker/compose.prod.yml up -d`

## Secrets and required production values

The API and worker validate the environment at startup and **refuse to start** in production when:

- `PAYMENT_PROVIDER` is not `snippe`, or `SNIPPE_API_KEY` / `SNIPPE_WEBHOOK_SECRET` is missing.
- Any secret still has a placeholder value (`replace_…`, `change_me`, …).
- `RATE_LIMIT_BACKEND=memory`.
- `METRICS_TOKEN` is set but shorter than 24 characters or a placeholder.
- `REVALIDATE_TOKEN` is set but shorter than 24 characters or a placeholder.

Generate secrets with `openssl rand -hex 32`:

- `POSTGRES_PASSWORD`
- `SECRETS_ENCRYPTION_KEY` (encrypts TOTP secrets, Controller credentials and voucher codes; **losing it makes those unreadable**)
- `VOUCHER_LOOKUP_HMAC_KEY`
- `METRICS_TOKEN` (also written to `infra/observability/metrics-token` for Prometheus; git-ignored)
- `REVALIDATE_TOKEN` (shared by the API and the web app; guards `POST /internal/revalidate`, which drops the cached marketing plan catalog so an Admin's plan change shows up immediately). Empty disables on-demand revalidation and the marketing pages then refresh on their own 60-second window instead.

Also set `CSRF_TRUSTED_ORIGINS` to the exact web and portal origins, `AUTH_COOKIE_SECURE=true`, `TRUST_PROXY=true` (already forced by Compose) and the three `*_PUBLIC_URL`s.

`NEXT_PUBLIC_*` values are compiled into the web and portal images at build time. Rebuild after changing public URLs.

## Upgrades

1. `git pull`, then `docker compose … build`.
2. `docker compose … up -d`. The `migrate` service runs `prisma migrate deploy` once, before new `api` and `worker` containers start. Migrations must be backward compatible with the running version: add columns first and remove them in a later release.
3. Check `/api/v1/health/ready` and Admin → Operations.

Stopping is graceful:

- The worker closes BullMQ (waiting for jobs in flight) and exits 0. Unfinished outbox leases are retried after they expire.
- The API finishes open requests and exits with 143 (Nest re-raises SIGTERM). Compose treats that as a normal stop.

## Scaling

- **API:** stateless. Sessions live in Postgres and rate limits in Redis, so replicas can be added behind Caddy.
- **Worker:** several replicas are safe. Outbox rows are leased, BullMQ job IDs are unique per row and attempt, and all handlers are idempotent. `WORKER_CONCURRENCY` (default 8) sets jobs per replica.
- **Postgres** is the limit on a single host. Move it to a managed instance with point-in-time recovery before it becomes one.

## Backups

The `backup` service writes daily dumps (`BACKUP_INTERVAL_SECONDS`, default 86400) and keeps them for `BACKUP_KEEP_DAYS` (default 14). Each dump is verified with `pg_restore --list`. Restore with `infra/scripts/restore.sh` (see [runbook](runbooks.md#restore-from-backup)).

**Dumps stay on the same host. Copy `$BACKUP_DIR` off the host** (object storage, another server). That is not bundled.

## Observability

- `/api/v1/health/live` shows the process is up.
- `/api/v1/health/ready` checks the database is migrated, Redis and the Snippe credentials. It returns 503 when not ready, and reports `degraded` when Redis is down.
- `/api/v1/internal/metrics` returns Prometheus text with a Bearer token. The gauges cover the outbox backlog and dead events, webhook inbox states and age, paid-but-unfulfilled orders, payment, payout and withdrawal states, stale payouts, grant-device results, network operation states and errors, Controller reachability and last inspection, ledger balance and imbalance, and expired access still observed.
- `infra/observability/alerts.yml` holds 13 alert rules (validated with `promtool`), each linked to a [runbook](runbooks.md) section. **No Alertmanager is bundled.** Connect Prometheus to your paging tool.

## Local production-topology check

Uses the production images with fake providers over plain HTTP on port 8080. `NODE_ENV` stays `development`, because production refuses fakes.

```bash
env -i PATH="$PATH" HOME="$HOME" docker compose -p advo-local-check \
  --env-file infra/docker/local-check.env -f infra/docker/compose.prod.yml up -d --build
open http://app.localhost:8080
# tear down (deletes its volumes):
env -i PATH="$PATH" HOME="$HOME" docker compose -p advo-local-check \
  --env-file infra/docker/local-check.env -f infra/docker/compose.prod.yml down -v
```

## Known limitations

- No off-host backups and no bundled Alertmanager.
- The backend image is large (SWC runtime and dev dependencies).
- The fake payment provider keeps its state in memory (development only).
- There is no idle-session timeout (absolute lifetime only) and no account lockout beyond rate limits.
