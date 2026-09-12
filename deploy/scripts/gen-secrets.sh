#!/usr/bin/env bash
#
# Fills the generated secrets in deploy/.env.prod.
#
# Only ever fills BLANK values. Re-running this is safe and is the intended way
# to top up a partially filled file — it will not silently replace a secret that
# is already in use, which for TICKET_SIGNING_SECRET would invalidate every
# ticket QR already in a customer's hand.
#
#   ./scripts/gen-secrets.sh            # fill blanks
#   ./scripts/gen-secrets.sh JWT_SECRET # force-rotate one named secret
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env.prod"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE does not exist. Start from the template:" >&2
  echo "  cp env.prod.example .env.prod" >&2
  exit 1
fi

command -v openssl >/dev/null || { echo "error: openssl not found" >&2; exit 1; }

# Hex, not base64, for the database password: it ends up on psql command lines
# and in PGPASSWORD, and an alphanumeric value has no quoting behaviour to get
# wrong. The signing secrets never touch a shell or a URL, so base64's higher
# density per character is free there.
gen() {
  case "$1" in
    DB_PASSWORD) openssl rand -hex 24 ;;
    *)           openssl rand -base64 48 | tr -d '\n' ;;
  esac
}

FORCE=("$@")
is_forced() {
  local k
  for k in ${FORCE[@]+"${FORCE[@]}"}; do [[ "$k" == "$1" ]] && return 0; done
  return 1
}

for KEY in DB_PASSWORD JWT_SECRET TICKET_SIGNING_SECRET; do
  CURRENT="$(sed -n "s/^${KEY}=//p" "$ENV_FILE" | head -n1)"

  if [[ -n "$CURRENT" ]] && ! is_forced "$KEY"; then
    echo "  $KEY — already set, left alone"
    continue
  fi

  if [[ -n "$CURRENT" ]]; then
    echo "  $KEY — ROTATING (was set)"
    if [[ "$KEY" == "TICKET_SIGNING_SECRET" ]]; then
      echo "        this invalidates every ticket QR already issued." >&2
      read -r -p "        type 'yes' to continue: " CONFIRM
      [[ "$CONFIRM" == "yes" ]] || { echo "        skipped"; continue; }
    fi
  else
    echo "  $KEY — generated"
  fi

  VALUE="$(gen "$KEY")"
  # | is not in the base64 or hex alphabet, so it is a safe sed delimiter here.
  sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE"
done

chmod 600 "$ENV_FILE"
echo
echo "$ENV_FILE is chmod 600. Back up TICKET_SIGNING_SECRET somewhere you will"
echo "still have it after this VPS is gone — it is the only key that can verify"
echo "tickets already in circulation."
