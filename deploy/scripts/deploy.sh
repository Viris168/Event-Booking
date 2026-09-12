#!/usr/bin/env bash
#
# Build and (re)start the production stack.
#
#   ./scripts/deploy.sh              # build from the working tree, restart
#   ./scripts/deploy.sh --pull       # git pull first
#   ./scripts/deploy.sh --no-build   # restart with the images already built
#
# Safe to re-run. Compose recreates only the containers whose image or
# configuration actually changed.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose --env-file .env.prod -f docker-compose.prod.yml)

PULL=false
BUILD=true
for arg in "$@"; do
  case "$arg" in
    --pull)     PULL=true ;;
    --no-build) BUILD=false ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# ── Preflight ──────────────────────────────────────────────────────────────
[[ -f .env.prod ]] || {
  echo "error: deploy/.env.prod is missing. Create it:" >&2
  echo "  cp env.prod.example .env.prod && ./scripts/gen-secrets.sh" >&2
  exit 1
}

# A blank required secret fails at JVM startup with a stack trace buried in the
# container log, several minutes after the deploy appeared to succeed. Catching
# it here costs nothing and is the difference between a typo and an outage.
# WHICH keys are required is recorded in env.prod.example, not here: every key
# with a `#!required` comment on the line above it. That is deliberate. This
# script used to carry its own list, and a list in a second file is a second
# thing to remember — BAKONG_ACCOUNT_ID was blank in the template, missing from
# the list here, and took the API down minutes after a deploy that reported
# success. Now the only place to mark a key required is the file you are already
# editing when you add one.
#
# Read from the TEMPLATE, not from .env.prod: the template is tracked, so it is
# always current, while a .env.prod copied months ago is not. A key that the
# template requires and .env.prod does not mention at all is reported too, which
# is the point — that is exactly what a stale copy looks like.
mapfile -t REQUIRED < <(awk '
  /^#!required$/          { want = 1; next }
  want && /^[A-Z0-9_]+=/  { key = $0; sub(/=.*/, "", key); print key }
                          { want = 0 }
' env.prod.example)

(( ${#REQUIRED[@]} )) || {
  echo "error: no #!required keys found in env.prod.example — is the file intact?" >&2
  exit 1
}

missing=()
for KEY in "${REQUIRED[@]}"; do
  VALUE="$(sed -n "s/^${KEY}=//p" .env.prod | head -n1)"
  [[ -z "$VALUE" ]] && missing+=("$KEY")
done
if (( ${#missing[@]} )); then
  echo "error: these are blank in .env.prod and the app will not start without them:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

if [[ "$(stat -c %a .env.prod)" != "600" ]]; then
  echo "note: tightening .env.prod to 600"
  chmod 600 .env.prod
fi

if $PULL; then
  echo "══ git pull"
  git -C .. pull --ff-only
fi

# ── Build ──────────────────────────────────────────────────────────────────
if $BUILD; then
  echo "══ build"
  # On a 2 GB VPS the Maven stage is the memory peak of the whole deploy. If it
  # is killed here ("exit code 137"), either add swap (provision.sh does) or
  # build the images on a bigger machine and push them to a registry.
  "${COMPOSE[@]}" build
fi

# ── Start ──────────────────────────────────────────────────────────────────
echo "══ up"
# --remove-orphans clears containers from a previous version of this file so a
# renamed service does not leave a stale copy running and holding a port.
"${COMPOSE[@]}" up -d --remove-orphans

# ── Wait for health ────────────────────────────────────────────────────────
# The API's own healthcheck has a 90s start period: Flyway migrates and
# Hibernate validates every entity against the result before the port opens.
echo "══ waiting for the API to report healthy"
for i in $(seq 1 60); do
  # docker inspect rather than `compose ps --format json`, whose shape has
  # changed between Compose releases; the container name is pinned in the
  # compose file precisely so this stays a one-liner.
  STATE="$(docker inspect -f '{{.State.Health.Status}}' eb-api 2>/dev/null || echo starting)"
  case "$STATE" in
    healthy)
      echo "     healthy after ~$((i * 5))s"
      break
      ;;
    unhealthy)
      echo "error: the API container is unhealthy. Last 60 lines:" >&2
      "${COMPOSE[@]}" logs --tail=60 api >&2
      exit 1
      ;;
  esac
  if (( i == 60 )); then
    echo "error: the API did not become healthy within 5 minutes. Last 60 lines:" >&2
    "${COMPOSE[@]}" logs --tail=60 api >&2
    exit 1
  fi
  sleep 5
done

# Reclaim the previous build's layers. `-f` only removes images nothing
# references, so the running stack is never at risk.
docker image prune -f >/dev/null

DOMAIN="$(sed -n 's/^DOMAIN=//p' .env.prod | head -n1)"
echo
echo "Deployed.  https://${DOMAIN}"
echo "  logs:    docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api"
echo "  status:  docker compose --env-file .env.prod -f docker-compose.prod.yml ps"
