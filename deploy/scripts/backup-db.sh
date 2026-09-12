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

# .env.prod is an env_file, not a shell script, so it is read rather than
# sourced — a value in it is a literal, and sourcing would execute anything a
# stray backtick happened to contain.
read_env() { sed -n "s/^$1=//p" .env.prod | head -n1; }

DB_NAME="$(read_env DB_NAME)"
DB_USERNAME="$(read_env DB_USERNAME)"
[[ -n "$DB_NAME" && -n "$DB_USERNAME" ]] || { echo "error: could not read DB_NAME/DB_USERNAME from .env.prod" >&2; exit 1; }
BACKUP_REMOTE="${BACKUP_REMOTE:-$(read_env BACKUP_REMOTE)}"
BACKUP_REMOTE="${BACKUP_REMOTE%/}"
REMOTE_RETAIN_DAYS="${REMOTE_RETAIN_DAYS:-$(read_env BACKUP_REMOTE_RETAIN_DAYS)}"
REMOTE_RETAIN_DAYS="${REMOTE_RETAIN_DAYS:-30}"

# Cron runs with a minimal environment and often a different HOME than the
# shell you tested in, so rclone's config is located explicitly instead of by
# discovery. The R2 access key and secret live in THAT file, chmod 600, and
# deliberately not in .env.prod: a credential that can delete every backup you
# own does not belong in the same file the application reads.
export RCLONE_CONFIG="${RCLONE_CONFIG:-/root/.config/rclone/rclone.conf}"

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

# ── Offsite ────────────────────────────────────────────────────────────────
# Everything above this line is on the same disk as the database it protects.
# That covers a bad migration or a mistaken DELETE; it does not cover the VPS
# being gone, which is the failure the paid backup add-on was going to cover.
if [[ -z "$BACKUP_REMOTE" ]]; then
  echo "warning: BACKUP_REMOTE is unset — this dump exists ONLY on this disk" >&2
  echo "warning: see 'Backups' in deploy/README.md to finish the setup" >&2
  exit 0
fi

command -v rclone >/dev/null || { echo "error: BACKUP_REMOTE is set but rclone is not installed" >&2; exit 1; }

echo "[$(date -u +%FT%TZ)] uploading to $BACKUP_REMOTE"

# copyto, not copy: copy would treat the destination as a directory and the
# name would depend on rclone's path handling. copyto names the object exactly.
# rclone verifies the checksum after upload on its own, so a truncated transfer
# is an error here rather than a surprise on the day you restore.
rclone copyto "$OUT" "$BACKUP_REMOTE/$(basename "$OUT")" \
  --s3-no-check-bucket --transfers 1 --retries 3

# Belt and braces. rclone exiting 0 is good evidence the object landed; asking
# the bucket whether it is actually there is proof, and this runs unattended.
rclone lsf "$BACKUP_REMOTE/$(basename "$OUT")" >/dev/null \
  || { echo "error: upload reported success but the object is not in the bucket" >&2; exit 1; }

echo "[$(date -u +%FT%TZ)] uploaded $(basename "$OUT")"

# The remote keeps dumps LONGER than the local disk (30 days against 14). Local
# retention is bounded by the VPS disk; the bucket is not, and the backups you
# most want on the bad day are often older than you would like — corruption
# introduced by a bad release is frequently noticed a week after it shipped.
#
# Scoped with --include so this can never delete anything in the bucket that
# this script did not put there.
echo "[$(date -u +%FT%TZ)] pruning remote dumps older than ${REMOTE_RETAIN_DAYS} days"
rclone delete "$BACKUP_REMOTE" \
  --include "${DB_NAME}-*.dump" \
  --min-age "${REMOTE_RETAIN_DAYS}d"

echo "[$(date -u +%FT%TZ)] done"
