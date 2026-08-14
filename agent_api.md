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
├── booking/                       the booking lane: state machine, service, mapper,
│   └── error/                     properties, ref generator
├── payment/                       service, reconciler, poller, mapper, properties
│   ├── bakong/                    KHQR generator, provider client (live + mock)
│   └── error/                     payment exceptions
├── controller/                    REST controllers
└── config/                        scheduling, security, OpenAPI
```

Lane ownership, so two people do not write the same class twice:

| Lane | Owner | Packages |
|---|---|---|
| Catalog (venues, events, seat classes, zones) | Vannara | `catalog/`, `dto/venue`, `dto/event`, `dto/seatclass`, `dto/eventzone` |
| Inventory (seat maps, holds) | Viris | `inventory/`, `dto/eventseat`, `dto/hold` |
| Booking & payments | Winner | `booking/`, `payment/`, `dto/booking`, `dto/payment` |

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
| `V4__payment_polling.sql` | Adds `payment_transaction.qr_payload`, `provider_txn_hash`, `last_polled_at`, `poll_attempts`, `note`, and the poller's partial index |

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

## 6. Payments — Bakong KHQR by polling

Bakong's open API has **no webhook** for the accounts this platform uses, so settlement is
discovered rather than delivered. That inverts the usual concern: a webhook integration
guards against a callback arriving twice, whereas polling is *built* on asking the same
question repeatedly, so "already applied" is the normal case and every write has to survive
being attempted again.

### The three classes

| Class | Transactions? | Job |
|---|---|---|
| `PaymentService` | yes | opens attempts, applies provider answers, moves the booking |
| `PaymentReconciler` | **no** | calls Bakong, then hands the answer to the service |
| `PaymentPoller` | no | `@Scheduled` — drives the reconciler and the booking sweep |

The split is not stylistic. The provider call is a network round trip and must not happen
inside a transaction holding row locks, so each attempt is settled in three steps: read
(short transaction), call the provider (none), apply (short transaction). Spring's proxying
would also silently skip `@Transactional` on a self-call, which is the second reason.

### Never double-confirming

Four independent layers, listed innermost last:

1. `applyProviderResult` re-reads the attempt **under a row lock** and returns unless it is
   still open. Two concurrent polls serialise there; the second finds a settled row.
2. `BookingStateMachine` treats a repeat of the current state as a no-op — no second
   history row.
3. `uq_payment_txn_one_success_per_booking` refuses a second SUCCESS row in the database.
4. `uq_payment_txn_provider_ref` refuses two rows for one QR.

**Lock order is booking, then payment**, everywhere. `startPayment` naturally takes the
booking first and then writes payment rows; if the reconciler took the payment lock first
and then reached for the booking, a customer pressing "pay" while the poller settles their
previous attempt would deadlock. `applyProviderResult` therefore fetches the booking id as
a scalar (`findBookingIdOf`) rather than loading the payment entity, which would put a
stale copy in the persistence context ahead of the locking query.

### Two different timeouts

Easy to conflate, and they do different things:

| Timeout | Length | Effect |
|---|---|---|
| QR expiry (`app.payment.bakong.qr-ttl`) | 5 min | attempt → `EXPIRED`, booking → `PAYMENT_FAILED`. **Not terminal** — the seats are still the customer's and they can start a fresh QR |
| Booking payment window (`app.booking.payment-window-minutes`) | 15 min | booking → `EXPIRED`, inventory released. This is the one that puts seats back on sale |

A QR is never issued that would outlive its booking: `qrExpiry` caps the TTL at
`booking.created_at + payment window` and refuses outright with under 30 seconds left,
since a QR paid after the sweep runs is money taken for resold seats.

> Note `expireStaleBookings` keys off `state_changed_at`, so each retry restarts the
> 15-minute window. Worth revisiting — `created_at` would be the firmer deadline.

### KHQR

`KhqrGenerator` writes the EMVCo payload by hand (about a hundred lines) rather than
pulling Bakong's SDK, because the format is the piece most worth having tests over.
CRC-16/**CCITT-FALSE** — the other CRC-16 variants produce a checksum every bank app
rejects, which `KhqrGeneratorTest` pins with the published `123456789 → 0x29B1` vector.

`provider_ref` holds the **md5 of the payload**, which is what
`/v1/check_transaction_by_md5` is asked about; `provider_txn_hash` holds the settlement
hash that only exists once money has landed. Tag 99 (Bakong's timestamp extension) is what
makes each QR unique — without it two attempts on one booking would collide on
`uq_payment_txn_provider_ref`, and a customer could never retry.

### MOCK mode

`BAKONG_MODE=MOCK` (the default) swaps one bean. The QR strings stay real and scannable;
only the "was it paid" answer is simulated, and `/api/dev/payments/**` exposes it. Those
endpoints do not exist when the mode is `LIVE`. Nobody needs merchant credentials to run
the whole flow — see `api/dev-seed.sql`.

---

## 7. Errors

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

## 8. Configuration

`app.*` in `application.yml`, bound with `@ConfigurationProperties` and picked up by
`@ConfigurationPropertiesScan` on the main class. Every value has an env-var override.

| Property | Env | Default | Meaning |
|---|---|---|---|
| `app.booking.fx-khr-per-usd` | `FX_KHR_PER_USD` | `4100.0000` | USD→KHR rate, snapshotted per booking |
| `app.booking.payment-window-minutes` | `BOOKING_PAYMENT_WINDOW_MINUTES` | `15` | How long a booking may sit unpaid |
| `app.hold.ttl-minutes` | `HOLD_TTL_MINUTES` | `10` | Hold lifetime |
| `app.jwt.*` | `JWT_*` | — | 15-min access token, 14-day refresh |
| `app.payment.bakong.mode` | `BAKONG_MODE` | `MOCK` | `MOCK` simulates settlement and enables `/api/dev/payments/**`; `LIVE` calls the real API |
| `app.payment.bakong.bearer-token` | `BAKONG_BEARER_TOKEN` | — | Required in `LIVE`, or startup fails. Expires — renew it |
| `app.payment.bakong.account-id` | `BAKONG_ACCOUNT_ID` | `event_booking@dev` | Where the money lands |
| `app.payment.bakong.account-type` | `BAKONG_ACCOUNT_TYPE` | `INDIVIDUAL` | `MERCHANT` also needs merchant-id and acquiring-bank |
| `app.payment.bakong.merchant-name` / `-city` | `BAKONG_MERCHANT_*` | — | EMVCo caps them at 25 / 15 chars; startup fails rather than emitting a QR banks reject |
| `app.payment.bakong.currency` | `BAKONG_CURRENCY` | `KHR` | Which of the booking's two snapshotted totals is charged |
| `app.payment.bakong.qr-ttl` | `BAKONG_QR_TTL` | `5m` | Keep it well under the booking payment window |
| `app.payment.poll.enabled` | `PAYMENT_POLL_ENABLED` | `true` | Turn off on a second instance — the sweeps do not coordinate across processes |
| `app.payment.poll.interval` | `PAYMENT_POLL_INTERVAL` | `5s` | Gap between provider sweeps |
| `app.payment.poll.min-refresh-interval` | `PAYMENT_MIN_REFRESH_INTERVAL` | `3s` | Per-attempt floor on `/refresh`, and the cadence the API tells clients to poll on |
| `app.payment.poll.booking-sweep` | `BOOKING_SWEEP_INTERVAL` | `1m` | Gap between booking-expiry sweeps |
| `app.scheduling.enabled` | `SCHEDULING_ENABLED` | `true` | Master switch for `@Scheduled` |

---

## 9. Testing

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

The payment lane's two suites both run under a plain `mvn test`, with no database and no
provider:

- `KhqrGeneratorTest` parses the payload back apart rather than comparing it to a golden
  string, so it describes the format instead of freezing one example. The CRC check value
  is the one place a golden value is right.
- `PaymentServiceTest` uses a **real** `BookingStateMachine` — the assertions are mostly
  about which booking transitions do and do not happen, and a mocked machine would happily
  accept edges the real one refuses.

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

## 10. Running it, and what is not built yet

### Trying the payment flow

Nothing is wired to `web/`, which still runs on its own mock backend, and neither the
catalog nor the inventory lane has endpoints — so there is no way to create an event or a
hold over HTTP. `api/dev-seed.sql` writes those rows and stops where the booking lane
picks up:

```bash
docker compose up -d
psql "postgresql://postgres:postgres@localhost:55432/event_booking" -f api/dev-seed.sql
cd api && mvn spring-boot:run
# Swagger UI: http://localhost:8080/swagger-ui.html
```

The seed prints an `X-User-Id` and a `holdId`. Then, in Swagger or curl:

| Step | Call |
|---|---|
| Check out | `POST /api/bookings` `{"holdId":N,"buyerName":"…","buyerPhoneE164":"+855…"}` |
| Issue a QR | `POST /api/bookings/{id}/payments` `{"provider":"BAKONG_KHQR"}` |
| Poll | `GET /api/payments/{id}` — stop when `bookingState` is `CONFIRMED` |
| Pay (MOCK) | `POST /api/dev/payments/{id}/pay` — call it twice; nothing should change |
| Time out (MOCK) | `POST /api/dev/payments/{id}/expire` |

`X-User-Id` is a placeholder for the authenticated principal on every endpoint that acts
for a customer.

### Still open, in rough dependency order

- `OrganizerProfile` entity. `AppUser` and `VenueSeat` now exist, so `Hold.user` and
  `EventSeat.venueSeat` are associations; `Event.organizerId` is still a scalar `Long`.
  `Booking.userId` is also still scalar — worth promoting to `@ManyToOne AppUser` for
  consistency with `Hold`, which ripples into `BookingResponse` and the booking tests.
- `EventSeat.holdId` is a raw `Long`, not an association, so anything filtering seats by
  hold must query `s.holdId` rather than `s.hold.id`.
- **Auth: JWT filter and `refresh_token` rotation.** `SecurityConfig` now exists but only
  to undo Spring Security's default basic-auth wall — it permits everything and sets up
  CORS. Replacing it is the auth lane's first job; the service layer already takes an
  actor id per call, so nothing below the controllers changes.
- `SeatHoldService` / `ZoneHoldService` and the hold sweeper (inventory lane), plus their
  endpoints — until they land, holds only come from the seed script.
  `BookingService.releaseExpiredHold` duplicates what that sweeper will do — collapse the
  two when it lands so hold release lives in one place.
- ABA PayWay. `PaymentProvider.ABA_PAYWAY` exists and answers `501`; the redirect flow and
  its return URL are unbuilt. `payment_webhook_event` is still unused — PayWay is the
  provider that will need it, since Bakong is polled.
- Ticket issuance on `CONFIRMED` — one ticket per admission unit, so a zone line with
  `qty = 3` yields three scannable tickets (`unit_seq` 1..3). This is the obvious next
  step now that bookings actually reach `CONFIRMED`.
- Refunds. `CONFIRMED → REFUND_REQUESTED → REFUNDED` is on the state machine, but nothing
  calls Bakong to move money back, and the reconciler flags two cases for a human today
  (money landing on a closed attempt, or on a booking that already died).
- Multi-instance scheduling. `PaymentPoller` assumes one process; a second would double-poll.
  A shared lock (or `SKIP LOCKED` on the candidate query) before scaling out.
