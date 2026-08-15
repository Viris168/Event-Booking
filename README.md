# Event Booking System (Cambodia)

A fullstack event booking app — browse and reserve seats for events across Cambodia.
The standout feature is **safe concurrency handling** so the last seat can never be oversold.

```
event-booking/
├── api/    → Spring Boot REST API (Java 21, Maven, Spring Boot 4.1)
└── web/    → React frontend (React 19, Vite 8)
```

## Tech stack

| Layer     | Technology                                   |
|-----------|----------------------------------------------|
| Backend   | Spring Boot 4.1, Java 21, Maven              |
| Data      | Spring Data JPA + Hibernate, PostgreSQL (Dockerized), Flyway migrations, Testcontainers for tests |
| Security  | Spring Security + JWT                        |
| Frontend  | React 19, Vite 8, React Router 7, Axios      |

## Getting started

### 0. Database (Docker + Flyway)

Each person on the team runs their **own local Postgres container** — nobody connects to a shared server. What's actually shared is the *schema*: every change to it lives as a versioned file in `api/src/main/resources/db/migration/`, committed to git. Flyway applies those files automatically, in order, the moment the API starts, so everyone's local database ends up structurally identical.

```bash
docker compose up -d      # starts Postgres 16 on localhost:55432, pgAdmin on localhost:55050
```

That's it — no `.env` needed for this step. `docker-compose.yml` defaults (`event_booking` / `postgres` / `postgres`) already match `api/.env.example`. Data persists in named Docker volumes across restarts; run `docker compose down -v` only if you want to wipe it and start clean.

Ports are intentionally non-default (`55432` instead of `5432`, `55050` instead of `5050`) so they don't collide with other Postgres/pgAdmin containers you might already have running.

Useful commands:
```bash
docker compose ps               # check both services are healthy
docker compose logs -f postgres # tail DB logs
docker compose down             # stop (keeps data)
docker compose down -v          # stop and wipe both volumes
```

**pgAdmin (web UI for the database):** open http://localhost:55050, log in with `admin@eventbooking.dev` / `admin` (from `docker-compose.yml`'s defaults — override via `PGADMIN_EMAIL`/`PGADMIN_PASSWORD` in a root `.env` if you want your own). The "Event Booking (local)" server is pre-registered in the sidebar — click it, enter the DB password (`postgres`), and you're browsing tables. It connects over the internal Docker network, so it uses Postgres's real port 5432 internally even though your browser/`psql`/the API reach it on `55432`.

**Making a schema change:** never edit a migration file that's already been applied anywhere (including on a teammate's machine) — Flyway checksums each file and will refuse to start if one has changed underneath it. Instead, add a new one: `V2__add_something.sql`, `V3__...`, etc. Commit it, push, and everyone else picks it up automatically the next time they `git pull` and restart the app.

### 1. API (backend)

```bash
cd api
cp .env.example .env      # then fill in your JWT secret; DB defaults already match docker-compose.yml
./mvnw spring-boot:run    # or: mvn spring-boot:run
```

Runs on http://localhost:8080.

- Health check: http://localhost:8080/api/health
- **Swagger UI: http://localhost:8080/swagger-ui.html** (OpenAPI spec at `/v3/api-docs`)

> Requires Java 21 and the Postgres container from step 0 running. On startup, Flyway creates/updates the schema and Hibernate validates the JPA entities against it (`ddl-auto: validate` — the app won't silently alter tables).

**Trying the booking → payment flow.** The catalog and inventory lanes have no endpoints yet, so there is no way to create an event or a hold over HTTP. Seed one:

```bash
psql "postgresql://postgres:postgres@localhost:55432/event_booking" -f api/dev-seed.sql
```

It prints an `X-User-Id` and a `holdId`. Pass that header to the endpoints in Swagger (it stands in for the authenticated user until JWT auth lands), then: check out → issue a KHQR → poll → `POST /api/dev/payments/{id}/pay` → `GET /api/bookings/{id}/tickets` → open `/api/tickets/{id}/qr.svg` → `POST /api/tickets/scan`. Bakong runs in MOCK mode by default, so no merchant credentials are needed; the QR strings are real, only settlement is simulated. See `agent_api.md` §6, §7 and §11.

### 2. Web (frontend)

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Runs on http://localhost:5173. API calls to `/api/*` are proxied to the backend.

## Environment variables

Both apps use `.env` files (already created, ignored by git). Templates are in `.env.example`.

- **api/.env** — database credentials, JWT secret, CORS origins
- **web/.env** — API base URL, app name, default currency (all prefixed `VITE_`)

`docker-compose.yml` (repo root) does **not** read `api/.env` — it has its own defaults that happen to match. If you ever change the Postgres password/port, update both.

## Project layout

**API** — grouped by domain lane. See `agent_api.md` for who owns what.
```
api/src/main/java/com/eventbooking/
├── controller/   REST endpoints
├── model/        JPA entities, one per table
├── repository/   Spring Data JPA
├── dto/<domain>/ request/response records, grouped by domain
├── Enumeration/  database-backed enums
├── booking/      checkout, the booking state machine
├── payment/      Bakong KHQR: service, reconciler, poller
│   └── bakong/   QR generation + provider client (live and mock)
├── ticket/       issuance, signed QR codec, SVG renderer, gate check-in
├── catalog/, inventory/   their lanes' services and errors
├── common/error/ ApiException, ErrorCode, RFC 7807 handler
├── security/     JWT + Spring Security (not built yet)
└── config/       scheduling, security, OpenAPI
```

**Web** — feature-oriented:
```
web/src/
├── api/          axios client + endpoint modules
├── components/   reusable UI (Navbar, cards, forms)
├── pages/        route screens
├── context/      AuthContext (JWT state)
├── routes/       ProtectedRoute guard
└── styles/       global CSS
```

## Next steps

Done: the schema and entities, checkout with real concurrency handling, Bakong KHQR
payments by polling (#31), and signed single-use QR tickets with gate check-in (#33) —
all reachable from Swagger.

1. **JWT auth** (register/login, refresh rotation, role-based access) — the one thing
   blocking everything else. Endpoints currently take an `X-User-Id` header instead, and
   `SecurityConfig` permits everything.
2. **Hold endpoints** (inventory lane) — until they exist, holds only come from
   `api/dev-seed.sql`, and the web cannot reach checkout at all.
3. **Catalog endpoints** — venues, events, zones, seat maps.
4. **Ticket delivery** — issuance and scanning work, but nothing sends the QR to the
   buyer yet (the outbox issue).
5. **Point the frontend at the real API** — `web/` still runs entirely on its own mock
   store in `web/src/mock/`. The payment and ticket screens are the two that can move
   today; see `agent_web.md` §4.
