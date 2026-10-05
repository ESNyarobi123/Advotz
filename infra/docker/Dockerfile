# syntax=docker/dockerfile:1.7
# One multi-stage file, four runtime targets: backend (api, worker, migrate), web, portal.
#   docker build -f infra/docker/Dockerfile --target backend -t advo/backend .
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

# ── toolchain ───────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate
WORKDIR /repo

# ── dependency download (cached on the lockfile only) ───────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=advo-pnpm,target=/pnpm/store pnpm fetch

# ── workspace install + Prisma client ───────────────────────────────────────
FROM deps AS workspace
COPY . .
RUN --mount=type=cache,id=advo-pnpm,target=/pnpm/store pnpm install --offline --frozen-lockfile
RUN pnpm --filter @advo/db generate

# ── Next.js builds (NEXT_PUBLIC_* are inlined at build time) ────────────────
FROM workspace AS web-build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_WEB_URL
RUN test -n "$NEXT_PUBLIC_API_URL" && test -n "$NEXT_PUBLIC_PORTAL_URL" \
 && pnpm --filter @advo/web build

FROM workspace AS portal-build
ARG NEXT_PUBLIC_API_URL
RUN test -n "$NEXT_PUBLIC_API_URL" && pnpm --filter @advo/portal build

# ── backend runtime: API, worker and the one-shot migration task ────────────
# The API/worker execute TypeScript through @swc-node/register (no separate dist), so the
# image keeps the installed workspace. See docs/deployment.md "Known limitations".
FROM base AS backend
ENV NODE_ENV=production \
    SWC_NODE_PROJECT=/repo/tsconfig.runtime.json
COPY --from=workspace --chown=node:node /repo /repo
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "@swc-node/register/esm-register", "src/main.ts"]

# ── web runtime (Next standalone server) ────────────────────────────────────
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=web-build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ── portal runtime (Next standalone server) ─────────────────────────────────
FROM ${NODE_IMAGE} AS portal
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=portal-build --chown=node:node /repo/apps/portal/.next/standalone ./
COPY --from=portal-build --chown=node:node /repo/apps/portal/.next/static ./apps/portal/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/portal/server.js"]
