# Advo TZ — Smart WiFi Billing & Network Management

Advo TZ lets WiFi Resellers in Tanzania sell hotspot access: guests pay by mobile money (through Snippe) or with a voucher on a captive portal, and access is authorized on the Reseller's TP-Link Omada Controller. Agents recruit Resellers and earn commission on the Resellers' platform subscriptions. Admins run the platform: plans, controllers, settlements and withdrawals.

All money is in whole Tanzanian shillings (TZS). All times are stored in UTC and shown in `Africa/Dar_es_Salaam` unless a site sets its own time zone.

> **What is real and what is simulated.** Everything in this repository runs end to end against a **fake** payment provider and a **fake** Omada controller. Nothing has been verified against live Snippe or real Omada hardware, and no SMS or email is actually delivered (the notification transport is fake). Production startup refuses the fake adapters. See [`docs/implementation-status.md`](docs/implementation-status.md).

## Apps

| App | Port (dev) | What it is |
|---|---|---|
| `apps/web` | 3000 | Marketing site, sign-up and login, plus the Admin, Reseller and Agent dashboards (Next.js App Router) |
| `apps/portal` | 3001 | Guest captive portal, Swahili by default (separate Next.js app) |
| `apps/api` | 4000 | HTTP API (NestJS on Fastify), under `/api/v1` |
| `apps/worker` | none | Outbox relay, BullMQ consumers and the 60-second sweeper (NestJS, no HTTP) |

Dev ports are not pinned in the app scripts: `apps/web` and `apps/portal` start through `scripts/next-run.mjs`, which reads `WEB_PORT` and `PORTAL_PORT` from the root `.env` (the values above are the defaults). If you move them, keep `WEB_PUBLIC_URL`, `PORTAL_PUBLIC_URL`, `NEXT_PUBLIC_*` and `CSRF_TRUSTED_ORIGINS` in step — the API refuses unsafe requests from an origin that is not trusted.

Shared code lives in `packages/*`: `backend` (all business modules, imported by both API and worker), `db` (Prisma schema and migrations), `contracts` (Zod schemas), `payments` (Snippe and fake providers), `omada` (live and fake controller adapters), `config`, `ui`, `i18n`, `api-client` and `test-kit`. See [`docs/architecture.md`](docs/architecture.md).

## Stack

Node 24 LTS (images; ≥24 required) · pnpm 11.10.0 · Turborepo · TypeScript 5.9 · Next.js 15.5 / React 19 · NestJS 11 on Fastify · Prisma 6.19 on PostgreSQL 16 · Redis 7.4 + BullMQ 5 · Zod 4 · Tailwind CSS 4 · Vitest 3 · Playwright 1.63. Exact versions are in [`docs/dependency-versions.md`](docs/dependency-versions.md).

## Local setup

```bash
cp .env.example .env                # then fill in the secrets it asks for
pnpm install
docker compose -f infra/docker/compose.dev.yml up -d postgres redis
pnpm verify:config                  # checks env, Node, pnpm and Prisma versions
pnpm db:generate
pnpm db:migrate:deploy              # or db:migrate:dev while changing the schema

# first Admin: no seeded password exists anywhere
BOOTSTRAP_ADMIN_EMAIL=you@example.com BOOTSTRAP_ADMIN_PASSWORD='a-long-unique-password' pnpm admin:bootstrap

pnpm db:seed:demo                   # optional: demo plan/agent/reseller, all flagged demo, random passwords printed once
pnpm dev                            # api, worker, web, portal
```

The Admin must enrol TOTP MFA at first login before any Admin page opens.

Environment files are loaded from the repository root `.env` by every app, script and Prisma command, and variables already set in your shell win. **Docker Compose behaves the same way**: a stray `POSTGRES_PASSWORD` in your shell overrides `--env-file`. Run Compose from a clean shell when that matters (see [`docs/deployment.md`](docs/deployment.md)).

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start API, worker, web and portal in watch mode |
| `pnpm build` / `lint` / `typecheck` | Across all workspaces (Turborepo) |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Backend integration tests against `advo_test`. Migrations are applied first, and the run refuses any database whose name does not end in `_test` |
| `pnpm smoke` | End-to-end API flow against a running API (fake providers). It truncates the database, so point that API at a `*_smoke` database |
| `pnpm test:e2e` | `smoke`, then Playwright (desktop + mobile portal). See [Local e2e](docs/runbooks.md#local-e2e) |
| `pnpm db:generate` / `db:migrate:dev` / `db:migrate:deploy` | Prisma |
| `pnpm db:seed:demo` | Demo fixtures. Refused when `NODE_ENV=production` or the payment provider is not fake; safe to run twice |
| `pnpm admin:bootstrap` | Create the first Admin from `BOOTSTRAP_ADMIN_*` |
| `pnpm verify:config` | Validate env and toolchain versions |
| `pnpm verify:integrations` | Read-only Snippe and Omada checks. Exits 1 on a live-mode misconfiguration |

## Local journeys (simulated)

With `pnpm dev` running and the demo seed loaded:

1. **Reseller:** log in at `http://localhost:3000/login` with the printed demo Reseller credentials, create a site, then submit a device claim (MAC and model).
2. **Admin:** approve the device claim (Sites & devices). The site becomes ready. Check Ledger (`BALANCED`) and the Audit log.
3. **Reseller:** create a time-based package. Quota packages are refused, because the controller cannot enforce them.
4. **Guest:** open the portal for the site the way an EAP redirect would (`http://localhost:3001/<site-slug>?clientMac=AA:BB:CC:00:00:10&apMac=AC:84:C6:00:00:01&ssidName=Cafe&radioId=1`), choose the package and enter a phone number. The payment page URL contains the order token. Complete the fake payment with `curl -X POST http://localhost:4000/api/v1/dev/simulate/orders/<orderToken>/payment -H 'content-type: application/json' -d '{"outcome":"completed"}'`. That route exists only with the fake provider outside production, and it pushes a signed Snippe-shaped webhook through the real ingest path. The portal then shows "Your WiFi is ready to use."
5. **Vouchers:** the Reseller generates a batch and a guest redeems a code on the portal. The same code on a second device joins the same access, up to the package's device limit.
6. **Agent:** log in with the demo Agent to see referrals, commission and the referral link.

## Documentation

- [Architecture](docs/architecture.md) · [Database](docs/database.md) · [Permissions](docs/permissions.md) · [Business rules](docs/business-rules.md)
- Integrations: [Snippe](docs/integrations/snippe.md) · [Omada contracts](docs/integrations/omada-contracts.md) · [Capabilities](docs/integrations/capabilities.md)
- [Frontend](docs/frontend.md) · [Dependency versions](docs/dependency-versions.md) · [Deployment](docs/deployment.md) · [Runbooks](docs/runbooks.md)
- [Acceptance results](docs/acceptance-results.md) · [Implementation status](docs/implementation-status.md)
