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
missing=()
for KEY in DOMAIN ACME_EMAIL DB_NAME DB_USERNAME DB_PASSWORD JWT_SECRET \
           TICKET_SIGNING_SECRET CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY \
           CLOUDINARY_API_SECRET; do
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
