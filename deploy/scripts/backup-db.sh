#!/usr/bin/env bash
#
# Dump the production database to /var/backups/event-booking and prune old
# dumps. Designed to be run from cron:
#
#   sudo crontab -e
#   15 3 * * *  /srv/event-booking/deploy/scripts/backup-db.sh >> /var/log/eb-backup.log 2>&1
#
# A dump that has never been restored is a hypothesis, not a backup. Test one
# with restore-db.sh against a scratch database before you need it for real.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-/var/backups/event-booking}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

DB_NAME="$(sed -n 's/^DB_NAME=//p' .env.prod | head -n1)"
DB_USERNAME="$(sed -n 's/^DB_USERNAME=//p' .env.prod | head -n1)"
[[ -n "$DB_NAME" && -n "$DB_USERNAME" ]] || { echo "error: could not read DB_NAME/DB_USERNAME from .env.prod" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

OUT="$BACKUP_DIR/${DB_NAME}-${STAMP}.dump"

# -Fc is the custom format: compressed, and restorable selectively with
# pg_restore. A plain SQL dump would need the whole file replayed to recover one
# table. No password is passed — pg_dump runs INSIDE the container as the
# postgres superuser over the local socket, so the credential never appears in a
# process list or a shell history.
echo "[$(date -u +%FT%TZ)] dumping $DB_NAME"
docker exec eb-postgres pg_dump -U "$DB_USERNAME" -d "$DB_NAME" -Fc > "$OUT"
chmod 600 "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date -u +%FT%TZ)] wrote $OUT ($SIZE)"

# A zero-length file means pg_dump failed after the shell had already created
# the redirect target. Catching it here keeps a broken dump from aging into the
# retention window as though it were good.
if [[ ! -s "$OUT" ]]; then
  echo "error: dump is empty — removing it" >&2
  rm -f "$OUT"
  exit 1
fi

DELETED="$(find "$BACKUP_DIR" -name "${DB_NAME}-*.dump" -type f -mtime "+${RETAIN_DAYS}" -print -delete | wc -l)"
echo "[$(date -u +%FT%TZ)] pruned $DELETED dump(s) older than ${RETAIN_DAYS} days"

# These dumps are on the same disk as the database they protect. That covers a
# bad migration or a mistaken DELETE; it does not cover the VPS being gone.
# Copy them somewhere else — rclone to object storage, or rsync to a machine you
# control — and do it before you need it.
