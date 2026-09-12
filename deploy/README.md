# Deploying to a VPS

Everything in this directory runs the app on one Linux server: the API, the SPA,
Postgres, and a TLS-terminating reverse proxy. It is separate from the
development `docker-compose.yml` at the repo root, which runs only the database
and the local monitoring stack and expects the API to run on your laptop.

```
                    :443 (Caddy is the only thing listening)
                      │
              ┌───────▼────────┐
              │     caddy      │  TLS from Let's Encrypt, renewed automatically
              │  (eb-caddy)    │  /api/*  →  api      everything else  →  web
              └───┬────────┬───┘
      ┌───────────▼──┐  ┌──▼─────────────┐
      │     api      │  │      web       │   nginx serving the built SPA
      │  (eb-api)    │  │   (eb-web)     │   with a React Router fallback
      └──────┬───────┘  └────────────────┘
             │  network: backend (internal: true — no route to the internet)
      ┌──────▼───────┐
      │   postgres   │   no published port, not addressable from off-host
      │ (eb-postgres)│
      └──────────────┘
```

The SPA and the API are served from **one origin**, so the browser never makes a
cross-origin request and CORS never comes into it. `VITE_API_BASE_URL` is the
relative `/api/v1`, and Caddy decides what that means.

## What you need

- A VPS running Ubuntu 22.04 or 24.04. **2 GB RAM is the practical floor**, and
  only with the swap file `provision.sh` adds — the Maven build stage is the
  memory peak of a deploy, not the running app. 4 GB is comfortable.
- A domain name with an A record (and AAAA, if you have IPv6) pointing at the
  server, **resolving before the first deploy**. Caddy proves ownership over
  port 80 on first start; if DNS is not ready the challenge fails and Caddy
  backs off before retrying.
- Credentials for the three external services the app refuses to start without
  or cannot function without: Cloudinary, Bakong, ABA PayWay.

## First deploy

```bash
# on the VPS, as a user with sudo
git clone <your-repo-url> /srv/event-booking
cd /srv/event-booking

sudo ./deploy/scripts/provision.sh     # Docker, ufw, swap, fail2ban, log rotation
# log out and back in so your docker group membership takes effect

cd deploy
cp env.prod.example .env.prod
./scripts/gen-secrets.sh               # DB_PASSWORD, JWT_SECRET, TICKET_SIGNING_SECRET
$EDITOR .env.prod                      # DOMAIN, ACME_EMAIL, Cloudinary, Bakong, PayWay
./scripts/deploy.sh
```

`deploy.sh` refuses to start if a required value is still blank, builds both
images, brings the stack up, and waits for the API to report healthy before it
claims success. First run takes a while — Maven downloads the world once.

Flyway creates the schema on the API's first start; there is no separate
migration step.

### Verifying

```bash
curl -sS https://your-domain/api/v1/health      # {"status":"UP",...}
```

Then open the site. If the certificate is not there yet, `docker compose ... logs caddy`
will say why — it is almost always DNS not pointing here yet.

## Day-to-day

All of these run from `deploy/`. The `--env-file` is not optional: Compose reads
`.env` by default, and this stack's file is `.env.prod` specifically so it can
never be confused with the repo-root `.env` that drives the development stack.

```bash
# Shorthand worth putting in your shell profile
alias ebc='docker compose --env-file .env.prod -f docker-compose.prod.yml'

ebc ps                       # what is running, and its health
ebc logs -f api              # follow the API log
ebc logs --tail=200 caddy    # access log + certificate events
ebc restart api
ebc exec postgres psql -U "$DB_USERNAME" -d "$DB_NAME"

./scripts/deploy.sh --pull   # git pull, rebuild, restart
./scripts/deploy.sh --no-build   # restart on the images already built
```

### Deploying a change

```bash
cd /srv/event-booking/deploy && ./scripts/deploy.sh --pull
```

There is a gap of a few seconds while the API container is replaced. That is
acceptable for this app and is the honest description of what happens — this is
a single-instance deployment, not a zero-downtime one. See *Scaling* below for
why running two API containers is not a drop-in change.

### Backups

`scripts/backup-db.sh` writes a compressed `pg_dump` to
`/var/backups/event-booking` and prunes anything older than 14 days. Put it on
cron:

```bash
sudo crontab -e
15 3 * * *  /srv/event-booking/deploy/scripts/backup-db.sh >> /var/log/eb-backup.log 2>&1
```

Hourly is more appropriate than nightly once real money is moving through the
booking flow: the cron above puts a ceiling of 24 hours on how many paid
bookings a total loss can take with it. `0 * * * *` costs nothing here.

#### Offsite copies

Those dumps sit on the same disk as the database they protect, which covers a
bad migration but not a dead VPS. Set `BACKUP_REMOTE` in `.env.prod` and
`backup-db.sh` uploads each dump to object storage and prunes the bucket on its
own schedule. Left blank, the script still takes its local dump and warns that
the dump exists on one disk only.

Cloudflare R2 is the recommended target. A compressed dump of this database is
tens of megabytes, which fits inside R2's free tier, and R2 charges nothing for
egress — the fee you would otherwise meet at exactly the moment you are pulling
everything back down in a hurry. Backblaze B2 works identically.

Do **not** point this at Contabo Object Storage, or at any bucket in the same
account as the VPS. Backups stored beside the thing they protect share an
account-level failure mode: one suspension or billing dispute takes the server
and its backups together.

```bash
sudo apt install rclone

# R2 appears as S3-compatible. Create the bucket and an API token scoped to it
# in the Cloudflare dashboard first (Object Read & Write, that bucket only —
# not an account-wide token).
sudo rclone config
#   name      > r2
#   storage   > s3
#   provider  > Cloudflare
#   access_key_id / secret_access_key from the R2 API token
#   endpoint  > https://<account-id>.r2.cloudflarestorage.com
#   region    > auto

sudo chmod 600 /root/.config/rclone/rclone.conf
```

Then, in `.env.prod`:

```
BACKUP_REMOTE=r2:eb-backups/db
BACKUP_REMOTE_RETAIN_DAYS=30
```

The R2 key and secret stay in `rclone.conf`, not in `.env.prod` — that file is
handed to the application as an env_file, and the app has no business holding a
credential that can delete every backup you own. `backup-db.sh` locates the
config explicitly (`RCLONE_CONFIG`) because cron does not run with your `HOME`.

Verify before trusting it:

```bash
sudo /srv/event-booking/deploy/scripts/backup-db.sh
sudo rclone ls r2:eb-backups/db
```

Retention is 14 days locally and 30 in the bucket. The bucket keeps more because
it can: corruption introduced by a bad release is frequently noticed a week or
more after it shipped, by which point the local copy from before the release is
already gone.

#### What is not in these dumps

Postgres is the only irreplaceable state on the VPS, which is what makes this
small enough to do yourself:

| State | Where it lives | On total loss |
|---|---|---|
| Bookings, users, payments | `pgdata` | restored from the dump |
| Event images | Cloudinary | unaffected, never on the box |
| TLS certificates | `caddy_data` | re-issued by ACME, mind the rate limit |
| The server build | `provision.sh`, `deploy.sh` | rebuilt from this repo |
| Secrets | `.env.prod` | **not backed up — see below** |

`.env.prod` is deliberately excluded. Uploading it would put every credential the
platform has into the backup bucket, and `TICKET_SIGNING_SECRET` in particular
cannot be regenerated without invalidating every ticket QR already in a
customer's hand. Keep a copy in a password manager instead.

Restoring: `./scripts/restore-db.sh /var/backups/event-booking/<file>.dump`. It
stops the API first, because restoring underneath a live connection pool gives
you a half-restored schema and a Hibernate validation failure on next start.

**Test a restore before you are relying on one.** A dump nobody has ever
restored is a hypothesis.

### Monitoring (optional)

```bash
docker compose --env-file .env.prod \
  -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d
```

Adds Prometheus, Loki, Promtail and Grafana, reusing the dashboards and alert
rules already in `monitoring/grafana/provisioning/`. Every port binds to
`127.0.0.1` and Caddy does not route to any of it, so you reach Grafana over an
SSH tunnel:

```bash
ssh -L 3000:localhost:53000 you@your-vps
# then http://localhost:3000
```

Set `GRAFANA_PASSWORD` in `.env.prod` before starting it.

## Secrets

`.env.prod` holds every credential the platform has. It is `chmod 600` and
gitignored (the root `.gitignore` covers `.env.*`; the tracked template is
`env.prod.example`, without the leading dot).

The two signing secrets are **not** interchangeable and are not rotated on the
same schedule:

| | Cost of rotating | Verdict |
|---|---|---|
| `JWT_SECRET` | Everyone signs in again. Access tokens last 15 minutes. | Rotate freely |
| `TICKET_SIGNING_SECRET` | Every ticket QR already in a customer's hand stops verifying, including for events that have not happened yet | Set once, keep, back up |

```bash
./scripts/gen-secrets.sh JWT_SECRET   # force-rotate one
ebc up -d api
```

### Rotating the database password

Postgres applies `POSTGRES_PASSWORD` on **first initialisation only**. Changing
it in `.env.prod` later does not change the role's password — it just breaks the
API's connection. Change it in the database first:

```bash
ebc exec postgres psql -U "$DB_USERNAME" -d "$DB_NAME" \
  -c "ALTER USER \"$DB_USERNAME\" WITH PASSWORD 'new-password';"
# then set DB_PASSWORD in .env.prod to the same value
ebc up -d api
```

## What is deliberately not reachable from the internet

- **Postgres** has no `ports:` key at all. It is on an `internal: true` network
  and is reached by container name.
- **`/actuator/**`** is not routed by Caddy. `/actuator/health` and
  `/actuator/prometheus` are `permitAll` in `SecurityConfig` so the container
  healthcheck and Prometheus can reach them over the private network — the way
  that stays safe is the edge giving the internet no path to `/actuator`.
- **Swagger UI and `/v3/api-docs`** are off (`APP_DOCS_PUBLIC=false`). The
  `prod` profile disables springdoc entirely, and `SecurityConfig` denies the
  paths, from the same variable so the two cannot disagree.
- **The payment simulation endpoints** need `PAYWAY_MODE=MOCK`/`BAKONG_MODE=MOCK`
  *and* the `dev` profile. The prod profile alone is enough to keep them
  unregistered, but set the modes to `LIVE` anyway.
- **Grafana, Prometheus, Loki** bind to `127.0.0.1`.

One thing worth internalising: **Docker's iptables rules sit in front of ufw.**
A container that publishes a port is reachable from the internet whether or not
ufw claims to block it. If you ever add a `ports:` entry, write it as
`"127.0.0.1:PORT:PORT"` unless you genuinely mean to publish it.

## Scaling

This is a single-instance deployment, and the API is not currently safe to run
as two containers. The hold sweeper, the payment reconciler and the booking
expiry sweep do not coordinate across processes — two instances would both poll
Bakong for the same pending payment, which matters because Bakong meters per
token and can cap an account at 100 requests a *day*.

If you do add a second instance, it sets `SCHEDULING_ENABLED=false` and
`PAYMENT_POLL_ENABLED=false`, and exactly one instance keeps them on.

Before adding instances, the cheaper wins are: raise `API_MEM_LIMIT`, tune
`HIKARI_MAX_POOL_SIZE` against Postgres's `max_connections` (100 by default,
shared with `pg_dump` and any `psql` you open), and put Cloudflare in front for
static caching and DDoS absorption.

## Troubleshooting

**The API never becomes healthy.** `ebc logs api`. In order of likelihood: a
blank credential that a startup guard rejects (Cloudinary, the JWT or ticket
secret); Flyway refusing to run because a migration file changed after being
applied; Hibernate's `validate` finding an entity that disagrees with the
schema.

**`exit code 137` during the build.** The Maven stage was OOM-killed. Add swap
(`provision.sh` does this on hosts under 4 GB), or build the images on a bigger
machine, push them to a registry, and deploy with `--no-build`.

**No certificate.** `ebc logs caddy`. Almost always DNS not yet pointing at this
host, or port 80 blocked upstream by the provider's own firewall — Caddy needs
it reachable for the ACME challenge even though it redirects to 443.

**A 502 on `/api/*` but the SPA loads.** The API container is down or unhealthy;
Caddy is fine. `ebc ps`, then `ebc logs api`.

**Deep links 404 on refresh.** That is nginx, not the router — check
`web/nginx.conf`'s `try_files ... /index.html` survived an edit.

## Files

| File | What it is |
|---|---|
| `docker-compose.prod.yml` | The stack: postgres, api, web, caddy |
| `docker-compose.monitoring.yml` | Optional overlay: Prometheus, Loki, Promtail, Grafana |
| `Caddyfile` | TLS, routing, security headers |
| `env.prod.example` | Template for `.env.prod` — copy it, do not edit it |
| `scripts/provision.sh` | One-time VPS setup |
| `scripts/gen-secrets.sh` | Generates the three secrets, never overwrites a set one |
| `scripts/deploy.sh` | Build, start, wait for health |
| `scripts/backup-db.sh` | `pg_dump` + retention, for cron |
| `scripts/restore-db.sh` | Restore a dump |
| `../api/Dockerfile` | Maven build → JRE runtime, non-root |
| `../web/Dockerfile` | Vite build → nginx |
| `../web/nginx.conf` | SPA fallback and cache headers |
| `../api/src/main/resources/application-prod.yml` | Non-secret production defaults |
