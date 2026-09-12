#!/usr/bin/env bash
#
# Restore a dump produced by backup-db.sh.
#
#   ./scripts/restore-db.sh /var/backups/event-booking/event_booking-20260101T031500Z.dump
#
# This DESTROYS the current contents of the target database. It stops the API
# first, because restoring underneath a live connection pool produces a
# half-restored schema and a Hibernate validation failure on the next restart.
set -euo pipefail

cd "$(dirname "$0")/.."
DUMP="${1:-}"
[[ -f "$DUMP" ]] || { echo "usage: $0 <dump-file>" >&2; exit 2; }

COMPOSE=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
DB_NAME="$(sed -n 's/^DB_NAME=//p' .env.prod | head -n1)"
DB_USERNAME="$(sed -n 's/^DB_USERNAME=//p' .env.prod | head -n1)"

cat <<WARN
About to restore
  from : $DUMP
  into : $DB_NAME  (every table in it is dropped and recreated)

The API will be stopped for the duration.
WARN
read -r -p "type the database name to confirm: " CONFIRM
[[ "$CONFIRM" == "$DB_NAME" ]] || { echo "aborted"; exit 1; }

echo "══ stopping the API"
"${COMPOSE[@]}" stop api

echo "══ restoring"
# --clean --if-exists drops each object before recreating it, so this works on a
# populated database. Restoring into an EMPTY one is cleaner still; see the
# runbook for the drop-and-recreate variant.
docker exec -i eb-postgres pg_restore \
  -U "$DB_USERNAME" -d "$DB_NAME" \
  --clean --if-exists --no-owner --single-transaction < "$DUMP"

echo "══ starting the API"
"${COMPOSE[@]}" start api

echo
echo "Restored. Watch the log — Flyway will report the schema version it found,"
echo "and Hibernate validates the entities against it before the port opens:"
echo "  ${COMPOSE[*]} logs -f api"
