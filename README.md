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
docker compose up -d      # starts Postgres 16 on localhost:5432
```

That's it — no `.env` needed for this step. `docker-compose.yml` defaults (`event_booking` / `postgres` / `postgres`) already match `api/.env.example`. Data persists in a named Docker volume across restarts; run `docker compose down -v` only if you want to wipe it and start clean.

Useful commands:
```bash
docker compose ps               # check it's healthy
docker compose logs -f postgres # tail logs
docker compose down             # stop (keeps data)
docker compose down -v          # stop and wipe the volume
```

**Making a schema change:** never edit a migration file that's already been applied anywhere (including on a teammate's machine) — Flyway checksums each file and will refuse to start if one has changed underneath it. Instead, add a new one: `V2__add_something.sql`, `V3__...`, etc. Commit it, push, and everyone else picks it up automatically the next time they `git pull` and restart the app.

### 1. API (backend)

```bash
cd api
cp .env.example .env      # then fill in your JWT secret; DB defaults already match docker-compose.yml
./mvnw spring-boot:run    # or: mvn spring-boot:run
```

Runs on http://localhost:8080. Health check: http://localhost:8080/api/health

> Requires Java 21 and the Postgres container from step 0 running. On startup, Flyway creates/updates the schema and Hibernate validates the JPA entities against it (`ddl-auto: validate` — the app won't silently alter tables).

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

**API** — layered architecture:
```
api/src/main/java/com/eventbooking/
├── controller/   REST endpoints
├── service/      business logic (booking + concurrency)
├── repository/   Spring Data JPA
├── model/        entities: User, Event, Booking, Category
├── dto/          request/response objects
├── security/     JWT + Spring Security
├── config/       app configuration
└── exception/    global error handling
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

1. Build the JPA entities (User, Event, Booking, Category)
2. Add JWT auth (register/login) + role-based access
3. Implement the booking service with concurrency handling
4. Build the frontend pages and connect them to the API
