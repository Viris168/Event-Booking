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

# `up -d --remove-orphans` below removes every container in the project that the
# compose files passed here do not define. The monitoring overlay shares this
# project name, so a deploy that names only the prod file treats Prometheus,
# Loki, Promtail and Grafana as orphans and deletes them - quietly, on every
# deploy, which is how you end up with dashboards you stop trusting.
#
# So: if the monitoring stack is running, deploy it too. Named volumes mean the
# data survived even the deletions that already happened; only the containers
# went. Grafana is the sentinel because it is the one you would miss.
if docker ps -a --format '{{.Names}}' | grep -qx 'eb-grafana'; then
  COMPOSE+=(-f docker-compose.monitoring.yml)
  MONITORING=true
else
  MONITORING=false
fi

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
# `want` survives comment and blank lines deliberately. It used to be cleared by
# any line that was not the key, so writing an explanatory comment between the
# marker and the variable silently dropped that variable from the check - which
# is the exact failure this mechanism exists to prevent.
mapfile -t REQUIRED < <(awk '
  /^#!required$/          { want = 1; next }
  want && /^[A-Z0-9_]+=/  { key = $0; sub(/=.*/, "", key); print key; want = 0; next }
  want && /^[[:space:]]*(#|$)/ { next }
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

# Blank is not the only way to get a value wrong, and it turned out to be the
# less common one. A required key can be present, non-empty, and still be the
# template's own placeholder - DOMAIN=booking.example.com asks Let's Encrypt for
# a certificate on a domain you do not own and spends one of five failed
# validations per hour; GOOGLE_CLIENT_ID=YOUR_CLIENT_ID builds an SPA whose
# sign-in button reports "OAuth client was not found". Both passed the check
# above, both cost an evening.
#
# These markers only ever appear in text meant to be replaced. `mock` is
# deliberately NOT one: it is a legitimate value for BAKONG_ACCOUNT_ID and the
# PayWay keys when the modes are MOCK.
placeholders=()
while IFS= read -r line; do
  key="${line%%=*}"
  value="${line#*=}"
  [[ -z "$value" ]] && continue
  if [[ "$value" =~ (example\.(com|org)|YOUR_|your-|PASTE_HERE|changeme|change-this|CHANGE_ME|<.*>) ]]; then
    placeholders+=("$key=$value")
  fi
done < <(grep -E '^[A-Z0-9_]+=' .env.prod)

if (( ${#placeholders[@]} )); then
  echo "error: these still hold template placeholders, not real values:" >&2
  printf '  %s\n' "${placeholders[@]}" >&2
  echo >&2
  echo "A placeholder passes the blank check above and fails later, somewhere less obvious." >&2
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

# ── Rollback point ─────────────────────────────────────────────────────────
# `up -d` replaces the running containers BEFORE anything has checked that the
# new build works, so a broken image is live the moment it starts and the health
# wait below only tells you afterwards. Tagging what is currently running gives
# that wait something to do other than report the bad news.
#
# Local builds overwrite the :TAG images in place, so the previous bytes have to
# be given a second name before the build, or they are gone.
IMAGE_TAG="$(sed -n 's/^IMAGE_TAG=//p' .env.prod | head -n1)"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ROLLBACK_READY=false
for img in event-booking-api event-booking-web; do
  if docker image inspect "$img:$IMAGE_TAG" >/dev/null 2>&1; then
    docker image tag "$img:$IMAGE_TAG" "$img:rollback"
    ROLLBACK_READY=true
  fi
done
$ROLLBACK_READY && echo "══ tagged the running images as :rollback"

rollback() {
  if ! $ROLLBACK_READY; then
    echo "error: no previous image to roll back to - this looks like a first deploy." >&2
    echo "       The stack is down. Fix the build and run deploy.sh again." >&2
    return 1
  fi
  echo "══ ROLLING BACK to the previous images" >&2
  for img in event-booking-api event-booking-web; do
    docker image inspect "$img:rollback" >/dev/null 2>&1 \
      && docker image tag "$img:rollback" "$img:$IMAGE_TAG"
  done
  "${COMPOSE[@]}" up -d --no-build
  echo "══ rolled back. The site should be serving the previous version again." >&2
  echo "   The failed build's logs are above; nothing about them has been discarded." >&2
}

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
      rollback
      exit 1
      ;;
  esac
  if (( i == 60 )); then
    echo "error: the API did not become healthy within 5 minutes. Last 60 lines:" >&2
    "${COMPOSE[@]}" logs --tail=60 api >&2
    rollback
    exit 1
  fi
  sleep 5
done

# Reclaim the previous build's layers. `-f` only removes images nothing
# references, so the running stack is never at risk.
# `-f` only removes images nothing references, and the :rollback tags are a
# reference, so the previous version survives this.
docker image prune -f >/dev/null

DOMAIN="$(sed -n 's/^DOMAIN=//p' .env.prod | head -n1)"
echo
echo "Deployed.  https://${DOMAIN}"
echo "  logs:    docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api"
echo "  status:  docker compose --env-file .env.prod -f docker-compose.prod.yml ps"
