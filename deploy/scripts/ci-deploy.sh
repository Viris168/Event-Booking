#!/usr/bin/env bash
#
# ci-deploy.sh — entry point called by GitHub Actions over SSH.
#
# The deploy user's authorized_keys entry locks this key to this command:
#
#   command="/srv/event-booking/deploy/scripts/ci-deploy.sh",\
#   no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding \
#   ssh-ed25519 AAAA...
#
# That means the SSH session cannot run an interactive shell, cannot forward
# ports, and cannot do anything except execute this script. A leaked key lets
# an attacker trigger a deploy — and nothing else.
#
# USAGE (called by the workflow, not by hand):
#   ssh deploy@host IMAGE_TAG=sha-abc1234
#
# The IMAGE_TAG argument is passed as the remote command in the SSH call.
# Because authorized_keys uses command=, sshd puts whatever the client sent
# as the remote command into $SSH_ORIGINAL_COMMAND instead of executing it.
# We read and validate it here.
set -euo pipefail

DEPLOY_DIR="/srv/event-booking/deploy"
LOG_FILE="/var/log/ci-deploy.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }

# ── Parse IMAGE_TAG from $SSH_ORIGINAL_COMMAND ───────────────────────────────
# The workflow sends: IMAGE_TAG=sha-abc1234
# Anything that is not that shape is refused — no shell injection surface.
RAW="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$RAW" =~ ^IMAGE_TAG=([a-zA-Z0-9._-]+)$ ]]; then
  log "ERROR: invalid or missing IMAGE_TAG in SSH_ORIGINAL_COMMAND: '$RAW'"
  echo "Usage: ssh deploy@host IMAGE_TAG=sha-abc1234" >&2
  exit 1
fi
IMAGE_TAG="${BASH_REMATCH[1]}"
log "Deploy triggered: IMAGE_TAG=$IMAGE_TAG"

# ── Pull images ───────────────────────────────────────────────────────────────
# Images were built and pushed to GHCR by the release workflow. Pulling by SHA
# is immutable: tag v1.0.0 can be moved, sha-abc1234 cannot.
log "Pulling images from GHCR"
docker pull "ghcr.io/viris168/event-booking-api:${IMAGE_TAG}"
docker pull "ghcr.io/viris168/event-booking-web:${IMAGE_TAG}"

# Re-tag to the local names the compose file expects. This keeps the compose
# file independent of the registry path and lets deploy.sh still work for
# manual local builds.
docker image tag "ghcr.io/viris168/event-booking-api:${IMAGE_TAG}" "event-booking-api:${IMAGE_TAG}"
docker image tag "ghcr.io/viris168/event-booking-web:${IMAGE_TAG}" "event-booking-web:${IMAGE_TAG}"
log "Images tagged locally as event-booking-{api,web}:${IMAGE_TAG}"

# ── Hand off to the existing deploy script ────────────────────────────────────
# deploy.sh already handles: env validation, rollback tagging, compose up,
# health wait, rollback on failure, image pruning. No need to duplicate that
# logic here. We pass the registry override so Compose uses the pulled images
# instead of the build: blocks in docker-compose.prod.yml.
cd "$DEPLOY_DIR"
log "Starting deploy.sh --no-build (IMAGE_TAG=${IMAGE_TAG})"
IMAGE_TAG="$IMAGE_TAG" \
  COMPOSE_FILE="docker-compose.prod.yml:docker-compose.registry.yml" \
  bash scripts/deploy.sh --no-build
log "Deploy complete: IMAGE_TAG=$IMAGE_TAG"
