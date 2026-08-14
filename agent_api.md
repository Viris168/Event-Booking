# API backend — change guide

The `api/` app is Spring Boot 4 + Java 21 + JPA/Hibernate + Flyway on PostgreSQL.
Read `agent.md` before committing, and `agent_guide.md` for the entity/DTO conventions
this document builds on.

```bash
docker compose up -d                 # Postgres on 55432, pgAdmin on 55050
cd api
mvn spring-boot:run                  # http://localhost:8080
mvn test                             # unit tests
mvn test -Dtest=BookingCheckoutIT    # one integration test (needs Docker)
```

There is **no Maven wrapper** in this repo and `mvn` may not be on your `PATH`.
IntelliJ ships one that works:

```bash
"/Applications/IntelliJ IDEA CE.app/Contents/plugins/maven/lib/maven3/bin/mvn" -o test
```

---

## 1. Where things live

```
api/src/main/java/com/eventbooking/
├── EventBookingApplication.java   @SpringBootApplication + @ConfigurationPropertiesScan
├── Enumeration/                   database-backed enums (BookingStatus, SeatStatus, ...)
├── model/                         JPA entities, flat package, one per table
├── repository/                    Spring Data interfaces, flat package
├── dto/<domain>/                  request + response records, grouped by domain
├── common/error/                  ApiException, ErrorCode, GlobalExceptionHandler,
│                                  ApiProblemFactory, DatabaseExceptionTranslator
├── catalog/error/                 venue / event / seat-class / zone exceptions
├── inventory/error/               seat / hold exceptions
└── booking/                       the booking lane: state machine, service, mapper,
    └── error/                     properties, ref generator
```

Lane ownership, so two people do not write the same class twice:

| Lane | Owner | Packages |
|---|---|---|
| Catalog (venues, events, seat classes, zones) | Vannara | `catalog/`, `dto/venue`, `dto/event`, `dto/seatclass`, `dto/eventzone` |
| Inventory (seat maps, holds) | Viris | `inventory/`, `dto/eventseat`, `dto/hold` |
| Booking & payments | Winner | `booking/`, `dto/booking` |

---

## 2. The schema is the source of truth

- Flyway owns the schema: `api/src/main/resources/db/migration/V*.sql`.
- `spring.jpa.hibernate.ddl-auto` is **`validate`**. Hibernate checks entities against
  the real tables on startup and refuses to boot if they disagree. Never set it to `update`.
- Never edit an applied migration. Add `V3__whatever.sql` instead.
- Java enums must stay in step with the matching `CHECK` constraint.

Applied migrations:

| Migration | What it does |
|---|---|
| `V1__schema.sql` | The whole platform: identity, venues, events, mixed seat+zone inventory, holds, bookings, payments, tickets, audit |
| `V2__venue.sql` | Adds `venue.is_disabled` and `event_zone.active` |
| `V3__booking_item_release.sql` | Adds `booking_item.released_at` and narrows the seat double-booking index to *live* lines |

> Two migrations may never share a version number — Flyway refuses to start.
> A `V2__booking_item_release.sql` collided with `V2__venue.sql` during a merge
> and was renumbered to V3; delete the duplicate rather than keeping both.

### Why V3 exists

V1's `uq_booking_item_seat` was unique on `event_seat_id` across **every** `booking_item`
row ever written. Because those rows are kept forever as financial history, the first
cancellation made that seat permanently unsellable — the seat returned to `AVAILABLE`,
a customer could hold it again, and checkout then died on a `23505` against a booking
that ended months ago. V3 adds a nullable `released_at`, stamped when a booking reaches
a terminal state, and rebuilds the index as `WHERE ... AND released_at IS NULL`.

---

## 3. The booking state machine

`booking.state` is written in exactly one place: `BookingStateMachine`. It refuses
illegal edges and appends a `booking_status_history` row for every legal one. Those two
jobs are fused deliberately — if callers could set `state` directly they would eventually
forget the audit row.

**There is no `HELD` booking state**, despite the phrasing of issue #30. `HELD` belongs
to `hold.status` (`ACTIVE` / `CONSUMED` / `EXPIRED` / `RELEASED`); a booking does not
exist until a hold has been converted, so it starts at `PENDING_PAYMENT`. The real chain
is **hold `ACTIVE` → booking `PENDING_PAYMENT` → `AWAITING_CONFIRMATION` → `CONFIRMED`**.

| From | Legal targets |
|---|---|
| `PENDING_PAYMENT` | `AWAITING_CONFIRMATION`, `PAYMENT_FAILED`, `EXPIRED`, `CANCELLED` |
| `AWAITING_CONFIRMATION` | `CONFIRMED`, `PAYMENT_FAILED`, `EXPIRED`, `CANCELLED` |
| `PAYMENT_FAILED` | `PENDING_PAYMENT`, `EXPIRED`, `CANCELLED` |
| `CONFIRMED` | `REFUND_REQUESTED` |
| `REFUND_REQUESTED` | `REFUNDED`, `CONFIRMED` |
| `REFUNDED`, `EXPIRED`, `CANCELLED` | — terminal |

Rules baked into that table:

- **No self-transitions.** `X → X` is never legal. `BookingService.transition` short-circuits
  a repeat as a no-op *before* reaching the state machine, because payment webhooks are
  delivered at-least-once and a duplicate must not 409 or add a second history row.
- **`PAYMENT_FAILED` is not terminal.** The schema expects several `payment_transaction`
  attempts per booking (retry after a bad PIN, switching KHQR → PayWay), so a failure
  returns the customer to `PENDING_PAYMENT` with their inventory intact.
- **`CONFIRMED` cannot be cancelled or expired.** Money has changed hands and
  `uq_payment_txn_one_success_per_booking` means it cannot be quietly un-charged. The
  refund path is the only way out.
- **Reaching a terminal state releases inventory** — seats back to `AVAILABLE`, zone
  `sold_qty` decremented, `booking_item.released_at` stamped.

Adding a state? Add it to `BookingStatus`, to the `CHECK` on `booking.state` in a new
migration, and to `LEGAL_TRANSITIONS`. `BookingStateMachineTest` fails if you miss the last one.

---

## 4. Checkout (hold → booking)

`BookingService.convertHold(CheckoutRequest, actorUserId)`, one transaction:

1. Row-lock the hold (`findByIdForUpdate`).
2. Reject holds belonging to another user — as **not found**, so ids cannot be probed.
3. If a booking already exists for this hold, return it. Checkout is idempotent; a
   double-submit must not 409 or double-charge.
4. Reject non-`ACTIVE` holds.
5. **If the hold's clock has run out, release its inventory and throw `HoldExpiredException` (410).**
6. Lock the hold's seats and zones, price every line, sum the subtotal.
7. Seats `HELD → SOLD` and `hold_id` cleared; zone `held_qty → sold_qty`.
8. Hold → `CONSUMED`, booking saved at `PENDING_PAYMENT`, creation row written.

Two details worth not breaking:

- **`@Transactional(noRollbackFor = HoldExpiredException.class)`.** Step 5 has to commit
  even though the method then throws, or the release is rolled straight back out and the
  inventory stays stranded until a sweeper notices. The expiry check runs before any
  booking rows are written, so the release is the only thing that commits on that path.
- **Prices are snapshotted** onto `booking_item.unit_price_usd_cents`, and the FX rate
  onto `booking.fx_rate_khr_per_usd`. An organizer re-pricing later must not change what
  an existing customer owes.

`hold.expires_at` is the authority on expiry, **not** `hold.status`. The sweeper is
periodic, so a hold is routinely still flagged `ACTIVE` for a few seconds after it lapses.

---

## 5. Locking and concurrency

- Database constraints are the final integrity boundary. Application checks alone do not
  survive a booking race — see `HoldConcurrencyIT`.
- Take `PESSIMISTIC_WRITE` before mutating shared inventory. `EventZone` and `EventSeat`
  carry `@Version`, but optimistic failures surface as a retryable 503, which is the wrong
  experience for ordinary checkout contention; the row lock makes callers queue instead.
- **Lock in id order.** Both `findByHoldIdForUpdate` and `findAllByIdForUpdate` order by
  id so two transactions over an overlapping set never deadlock.
- Do **not** `join fetch` inside a locking query. Postgres applies `FOR UPDATE` to every
  table in the `FROM`, so fetching `seatClass` alongside a seat lock would row-lock the
  catalog too.
- Never start a `REQUIRES_NEW` transaction that touches a row the outer transaction has
  already locked — the two connections deadlock against each other. That is why the
  expired-hold release uses `noRollbackFor` instead.

---

## 6. Errors

Throw a subclass of `ApiException` carrying an `ErrorCode`; `GlobalExceptionHandler` turns
it into RFC 7807 `application/problem+json` with `errorCode`, `retryable`, `timestamp` and
`traceId`. `ErrorCode` owns the HTTP status — do not set statuses at the throw site.

`DatabaseExceptionTranslator` maps Postgres `SQLSTATE` + constraint name back to a domain
exception. When you add a constraint that users can hit, add its name there too, otherwise
it surfaces as a 500. Booking-lane entries:

| Constraint | Becomes |
|---|---|
| `uq_booking_item_seat_live` | `SeatUnavailableException` (409) |
| `booking_hold_id_key` | `HoldNotActiveException` (409) |

---

## 7. Configuration

`app.*` in `application.yml`, bound with `@ConfigurationProperties` and picked up by
`@ConfigurationPropertiesScan` on the main class. Every value has an env-var override.

| Property | Env | Default | Meaning |
|---|---|---|---|
| `app.booking.fx-khr-per-usd` | `FX_KHR_PER_USD` | `4100.0000` | USD→KHR rate, snapshotted per booking |
| `app.booking.payment-window-minutes` | `BOOKING_PAYMENT_WINDOW_MINUTES` | `15` | How long a booking may sit unpaid |
| `app.hold.ttl-minutes` | `HOLD_TTL_MINUTES` | `10` | Hold lifetime |
| `app.jwt.*` | `JWT_*` | — | 15-min access token, 14-day refresh |

---

## 8. Testing

| Kind | Naming | Runs under | Needs Docker |
|---|---|---|---|
| Unit | `*Test` | `mvn test` | no |
| Integration | `*IT` | not wired yet — run with `-Dtest=<name>` | yes |

Integration tests use Testcontainers against real Postgres, because H2 cannot execute the
plpgsql guard triggers, partial unique indexes or `SELECT ... FOR UPDATE` that this schema
leans on. A `@SpringBootTest` also runs Hibernate's `validate` against every migration, so an
entity that drifts from the migrations fails there first.

Integration tests are **not** `@Transactional`: each service call has to commit on its own
for the assertions to mean anything, especially the expired-hold case.

Two gaps to be aware of:

- **Surefire only runs `*Test`.** `*IT` classes are excluded by its default includes and
  no failsafe plugin is configured, so `BookingCheckoutIT` and `HoldConcurrencyIT` never
  run in a plain `mvn test`. Add `maven-failsafe-plugin` when the team wants them in CI.
- **Testcontainers 1.20.4 cannot talk to Docker Engine 29+.** Its bundled docker-java
  defaults to API v1.24, which Docker 29 rejects with a `400` on `/info`, so every
  container-backed test dies with "Could not find a valid Docker environment". Bumping to
  1.21.3 does not fix it. Until it is resolved, verify integration tests against a
  throwaway container:

  ```bash
  docker run -d --name eb-it -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test \
      -e POSTGRES_DB=event_booking_test -p 55433:5432 postgres:16-alpine
  # temporarily point the test's @DynamicPropertySource at localhost:55433
  ```

---

## 9. What is not built yet

The booking lane stops at the service layer — there are **no controllers**, and nothing is
wired to `web/`, which is still running on its own mock backend.

Still open, in rough dependency order:

- `OrganizerProfile` entity. `AppUser` and `VenueSeat` now exist, so `Hold.user` and
  `EventSeat.venueSeat` are associations; `Event.organizerId` is still a scalar `Long`.
  `Booking.userId` is also still scalar — worth promoting to `@ManyToOne AppUser` for
  consistency with `Hold`, which ripples into `BookingResponse` and the booking tests.
- `EventSeat.holdId` is a raw `Long`, not an association, so anything filtering seats by
  hold must query `s.holdId` rather than `s.hold.id`.
- Auth: JWT filter, `refresh_token` rotation, and a `SecurityConfig`. Nothing is secured
  today, so `actorUserId` is passed in by hand rather than read from a principal.
- `SeatHoldService` / `ZoneHoldService` and the hold sweeper (inventory lane).
  `BookingService.releaseExpiredHold` duplicates what that sweeper will do — collapse the
  two when it lands so hold release lives in one place.
- Controllers: `POST /bookings` (checkout), `GET /bookings/{id}`, `GET /me/bookings`.
- Payments: `payment_transaction`, `payment_webhook_event`, KHQR/PayWay adapters. The
  state machine already has the edges they need.
- Ticket issuance on `CONFIRMED` — one ticket per admission unit, so a zone line with
  `qty = 3` yields three scannable tickets (`unit_seq` 1..3).
- Scheduling. `BookingService.expireStaleBookings()` exists but nothing calls it; the app
  has no `@EnableScheduling`.
