#!/bin/sh
# Restore an Advo backup into the Compose postgres service.
#
#   infra/scripts/restore.sh backups/advo-20261001T000000Z.dump [--env-file .env.production]
#
# Stops api/worker first so nothing writes during the restore, restores with --clean, runs
# `prisma migrate deploy` (a no-op when the dump already has every migration), then restarts.
# Rehearse on a scratch host before relying on it; see docs/runbooks.md#restore-from-backup.
set -eu

dump="${1:?usage: restore.sh <dump-file> [--env-file FILE]}"
shift
env_file=".env.production"
if [ "${1:-}" = "--env-file" ]; then env_file="${2:?--env-file needs a path}"; fi
[ -f "$dump" ] || { echo "dump not found: $dump" >&2; exit 1; }

compose="docker compose --env-file ${env_file} -f infra/docker/compose.prod.yml"
set -a; . "./${env_file}"; set +a

echo "Stopping writers (api, worker, backup)…"
$compose stop api worker backup

echo "Restoring ${dump} into ${POSTGRES_DB}…"
$compose exec -T postgres pg_restore --clean --if-exists --no-owner --exit-on-error \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${dump}"

echo "Applying any newer migrations…"
$compose run --rm migrate

echo "Starting services…"
$compose up -d api worker backup
echo "Restore complete. Check /api/v1/health/ready and the admin ledger trial balance."
