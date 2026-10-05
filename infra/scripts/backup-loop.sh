#!/bin/sh
# Periodic logical backup of the Advo database (custom format, restorable with pg_restore).
# Runs inside the `backup` service; PG* variables come from Compose.
# Copy /backups off this host as well — a backup on the same disk is not disaster recovery.
set -eu

interval="${BACKUP_INTERVAL_SECONDS:-86400}"
keep_days="${BACKUP_KEEP_DAYS:-14}"

while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="/backups/advo-${stamp}.dump"
  if pg_dump --format=custom --no-owner --file="${target}.partial"; then
    mv "${target}.partial" "${target}"
    pg_restore --list "${target}" > /dev/null
    echo "{\"level\":\"info\",\"msg\":\"backup written\",\"file\":\"${target}\",\"bytes\":$(wc -c < "${target}")}"
  else
    rm -f "${target}.partial"
    echo "{\"level\":\"error\",\"msg\":\"backup failed\",\"file\":\"${target}\"}"
  fi
  find /backups -name 'advo-*.dump' -mtime "+${keep_days}" -delete
  sleep "${interval}"
done
