# Dependency versions

Versions **actually installed** from `pnpm-lock.yaml`, read from `node_modules` on 30 September 2026. `pnpm verify:config` checks the Node, pnpm and Prisma CLI/client versions.

## Toolchain

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24.21.0 in Docker images (`node:24.21.0-bookworm-slim`), `engines: >=24` | Development host ran 25.8.1. `verify:config` warns on non-LTS versions |
| pnpm | 11.10.0 | `packageManager` in the root `package.json`, activated through corepack in Docker |
| Turborepo | 2.11.5 | |
| TypeScript | 5.9.3 | Strict shared `tsconfig.base.json` |
| tsx | 4.23.15 | Root scripts (`verify:*`) |
| @swc/core / @swc-node/register | 1.16.2 / 1.12.1 | API and worker run TypeScript source through SWC at runtime (`tsconfig.runtime.json`) |

## Runtime libraries

| Package | Version |
|---|---|
| next | 15.5.26 |
| react / react-dom | 19.3.0 |
| @nestjs/core, @nestjs/platform-fastify | 11.2.6 |
| @nestjs/swagger | 11.4.7 |
| @fastify/cookie / @fastify/helmet | 11.1.2 / 13.1.1 |
| prisma / @prisma/client | 6.19.3 |
| zod | 4.6.5 |
| bullmq | 5.81.5 |
| ioredis | 6.0.0 |
| argon2 | 0.44.0 |
| @snippe/sdk | 1.0.0 |
| dotenv | 17.4.2 |
| tailwindcss | 4.3.3 |
| @heroui/react / @heroui/styles | 3.2.6 |
| react-aria / react-aria-components | 3.52.1 / 1.21.1 |
| @internationalized/date | 3.12.4 |

## Testing

| Package | Version |
|---|---|
| vitest | 3.2.7 |
| @playwright/test | 1.63.0 (Chromium build 1243) |

## Infrastructure images

| Image | Tag |
|---|---|
| PostgreSQL | `postgres:16.15-alpine` |
| Redis | `redis:7.4.11-alpine` (AOF on, `noeviction`) |
| Caddy | `caddy:2.11.4-alpine` |
| Prometheus | `prom/prometheus:v3.5.0` (optional `observability` profile) |

Verified with Docker 29.7.2 and Docker Compose 5.5.1.

## Rules

- Install with `pnpm install --frozen-lockfile`. Never float to `latest` in builds.
- Upgrade one family at a time, then run `lint`, `typecheck`, `test`, `test:integration` and `test:e2e`, and update this table.
- `msgpackr-extract` (an optional native dependency of BullMQ) fails to compile in the slim image because there is no Python. This is harmless: msgpackr falls back to its JavaScript implementation.
- **HeroUI:** v3 (`@heroui/react` + `@heroui/styles` 3.2.6) is the component library for both apps; see [frontend](frontend.md#ui-library) for the `@advo/ui` brand layer and theming.
