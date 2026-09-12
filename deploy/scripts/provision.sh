#!/usr/bin/env bash
#
# One-time preparation of a fresh Ubuntu 22.04/24.04 VPS. Run it once, as root
# or with sudo, before the first deploy:
#
#   sudo ./deploy/scripts/provision.sh
#
# It installs Docker, puts a firewall up, adds swap on small instances, and
# turns on unattended security updates and fail2ban. It does not touch the
# application or any secret.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "error: run with sudo" >&2; exit 1; }

# The user who invoked sudo — the one that should end up able to run docker.
TARGET_USER="${SUDO_USER:-root}"

echo "══ 1/6  Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git ufw fail2ban unattended-upgrades

echo "══ 2/6  Docker Engine + Compose plugin"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "     already installed — $(docker --version)"
fi

if [[ "$TARGET_USER" != "root" ]]; then
  usermod -aG docker "$TARGET_USER"
  echo "     added $TARGET_USER to the docker group (log out and back in for it to take)"
fi

echo "══ 3/6  Docker log rotation"
# Without this, json-file logs grow until the disk is full, and a full disk on a
# VPS running Postgres is a corrupted-looking database and a very bad evening.
# The compose file sets per-service limits too; this covers anything else that
# ever runs on the host.
if [[ ! -f /etc/docker/daemon.json ]]; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
JSON
  systemctl restart docker
else
  echo "     /etc/docker/daemon.json exists — not overwriting, check log-opts by hand"
fi

echo "══ 4/6  Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp           # HTTP/3
ufw --force enable
#
# Read this before deciding the firewall has you covered:
#
# Docker inserts its own iptables rules AHEAD of ufw's. Any container that
# publishes a port with `ports:` is reachable from the internet whether ufw
# allows it or not. The production compose file therefore publishes nothing
# except Caddy's 80/443 — Postgres has no `ports:` key at all, and the
# monitoring overlay binds strictly to 127.0.0.1.
#
# If you ever add a `ports:` entry, write it as "127.0.0.1:PORT:PORT" unless you
# genuinely mean to put that service on the public internet.
echo "     ufw active: SSH, 80, 443 (see the note in this script about Docker and ufw)"

echo "══ 5/6  Swap"
# A 2 GB VPS cannot run `mvn package` and Postgres at the same time without it,
# and the OOM killer's usual pick is whichever process has the biggest RSS —
# which is the JVM doing your deploy, or Postgres.
MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
if [[ "$MEM_MB" -lt 4096 ]] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -qw vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "     2 GB swapfile added (host has ${MEM_MB} MB RAM)"
else
  echo "     skipped (${MEM_MB} MB RAM, or swap already present)"
fi

echo "══ 6/6  Automatic security updates + fail2ban"
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

cat <<'DONE'

Provisioning complete.

Next:
  1. Point your domain's A record at this server's public IP and let it resolve.
     Caddy requests the certificate over :80 on first start; if DNS is not ready
     it fails the challenge and backs off before retrying.
  2. Clone the repo, then:
       cd <repo>/deploy
       cp env.prod.example .env.prod
       ./scripts/gen-secrets.sh
       $EDITOR .env.prod          # DOMAIN, ACME_EMAIL, Cloudinary, Bakong, PayWay
       ./scripts/deploy.sh
DONE
