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

# The API is about to be stopped, and `set -e` means any failure below exits the
# script immediately - which, without this, skips the restart at the bottom and
# leaves the site down with no API. That is the worst possible moment for it:
# you are running this script because something is ALREADY wrong, and a failed
# restore would quietly turn a data problem into an outage as well.
#
# Installed AFTER the confirmation prompt, so declining still exits without
# touching anything. From here down every exit path is one where the API may
# already be stopped; `start` on a running container is a no-op, so firing it
# unconditionally is safe.
API_RESTARTED=false
restart_api() {
  $API_RESTARTED && return 0
  echo "══ restarting the API" >&2
  "${COMPOSE[@]}" start api \
    || echo "error: could not restart the API. Do it by hand: ${COMPOSE[*]} start api" >&2
}
trap restart_api EXIT

echo "══ stopping the API"
"${COMPOSE[@]}" stop api

# Take a copy of what is about to be destroyed.
#
# --clean --if-exists drops every object before recreating it, and the file
# names here are timestamps, so restoring the wrong one is an easy mistake with
# no undo. This costs seconds and is the only thing standing between a misread
# filename and a lost database.
SAFETY="$(dirname "$DUMP")/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
echo "══ dumping the CURRENT database first -> $SAFETY"
if docker exec eb-postgres pg_dump -U "$DB_USERNAME" -d "$DB_NAME" -Fc > "$SAFETY" && [[ -s "$SAFETY" ]]; then
  chmod 600 "$SAFETY"
  echo "     $(du -h "$SAFETY" | cut -f1) - restore this file to undo what follows"
else
  rm -f "$SAFETY"
  echo "error: could not dump the current database, so this restore has no undo." >&2
  echo "       Refusing to continue. Check that eb-postgres is running." >&2
  exit 1
fi

echo "══ restoring"
# --clean --if-exists drops each object before recreating it, so this works on a
# populated database. Restoring into an EMPTY one is cleaner still; see the
# runbook for the drop-and-recreate variant.
docker exec -i eb-postgres pg_restore \
  -U "$DB_USERNAME" -d "$DB_NAME" \
  --clean --if-exists --no-owner --single-transaction < "$DUMP"

echo "══ starting the API"
"${COMPOSE[@]}" start api
API_RESTARTED=true

echo
echo "Restored. Watch the log — Flyway will report the schema version it found,"
echo "and Hibernate validates the entities against it before the port opens:"
echo "  ${COMPOSE[*]} logs -f api"
