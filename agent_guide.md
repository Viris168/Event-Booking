# Agent Guide

This guide records the backend conventions and decisions established for the event booking project. Read `agent.md` as well, especially before committing or pushing changes.

## Source of truth

- The PostgreSQL schema is defined in `api/src/main/resources/db/migration/V1__schema.sql`.
- Flyway owns the database schema; Hibernate must validate it and must not generate or update it.
- Do not edit a migration that has already been applied. Add a new versioned migration such as `V2__description.sql` for later schema changes.
- Keep Java enum values synchronized with the corresponding PostgreSQL `CHECK` constraints.

## Backend package layout

```text
api/src/main/java/com/eventbooking/
├── Enumeration/       Shared database-backed enums
├── model/             JPA entities
├── mapper/            Entity/DTO mappers grouped by domain
├── repository/        Spring Data JPA repositories
└── dto/               DTOs grouped by table/domain
    ├── venue/
    ├── VenueSeat/
    ├── event/
    ├── seatclass/
    ├── eventzone/
    ├── eventseat/
    └── hold/
```

Do not reorganize DTOs into global `dto/request` and `dto/response` packages. Each domain folder must contain its own request and response records.

## JPA entities

The following schema tables currently have entities in `com.eventbooking.model`:

- `venue` -> `Venue`
- `event` -> `Event`
- `seat_class` -> `SeatClass`
- `event_zone` -> `EventZone`
- `venue_seat` -> `VenueSeat`
- `event_seat` -> `EventSeat`
- `hold` -> `Hold`
- `booking` -> `Booking`, `booking_item` -> `BookingItem`, `booking_status_history` -> `BookingStatusHistory`
- `payment_transaction` -> `PaymentTransaction`
- `app_user` -> `AppUser`

Entity mapping rules:

- Use `@Table` and explicit `@Column`/`@JoinColumn` names matching the Flyway schema.
- Use `GenerationType.IDENTITY` for `GENERATED ALWAYS AS IDENTITY` primary keys.
- Use `Instant` for PostgreSQL `TIMESTAMPTZ` columns.
- Use `BigDecimal` for fixed-precision coordinates.
- Use `EnumType.STRING` for database-backed enums.
- Use `@Version` on `event_zone.version` and `event_seat.version` for optimistic locking.
- Keep associations lazy unless there is a demonstrated reason otherwise.
- Avoid Lombok `@Data` and generated recursive `toString`/`equals` methods on entity relationships.

Relationships are mapped between the implemented entities. Foreign keys whose target entities do not exist yet, or whose lifecycle is intentionally managed without loading the related entity, remain scalar IDs:

- `Venue.organizerId` represents `venue.organizer_id`.
- `Event.organizerId` represents `event.organizer_id`.
- `Hold.userId` represents `hold.user_id`.
- `EventSeat.holdId` represents `event_seat.hold_id`.

`EventSeat.venueSeat` is now a lazy `ManyToOne` association because `VenueSeat` has been implemented. Replace the remaining scalar IDs with associations only when the target model and lifecycle require it, and update DTO/service mapping deliberately.

## Shared enums

Keep these enums in `com.eventbooking.Enumeration`:

- `InventoryMode`: `SEATED`, `ZONED`, `MIXED`
- `EventStatus`: `DRAFT`, `PUBLISHED`, `TAKEN_DOWN`
- `SeatStatus`: `AVAILABLE`, `HELD`, `SOLD`, `BLOCKED`
- `HoldStatus`: `ACTIVE`, `CONSUMED`, `EXPIRED`, `RELEASED`
- `PaymentProvider`: `BAKONG_KHQR`, `ABA_PAYWAY`
- `PaymentStatus`: `CREATED`, `PENDING`, `SUCCESS`, `FAILED`, `CANCELLED`, `EXPIRED`
- `PaymentCurrency`: `USD`, `KHR` — also carries the ISO 4217 numeric code and minor-unit
  count, because the KHQR payload needs both and there is no second place to keep them
- `BookingStatus` and `Role` also live in this package.

Use `SeatStatus`; do not recreate the old `EventSeatStatus` name.

## DTO organization

### Venue

`dto/venue` contains:

- `CreateVenueRequest`
- `UpdateVenueRequest`
- `VenueResponse`

Venue is the only regular resource with an update request. The update is for venue corrections and must not allow organizer/ownership changes.

### Venue seat

`dto/VenueSeat` currently contains:

- `CreateVenueSeatsRequest`
- `VenueSeatResponse`
- `VenueSeatMapResponse`
- `VenueSeatSectionResponse`

Venue seats define a reusable physical seat layout for a venue. They are created in bulk. A request must contain at least one seat and cannot repeat the same section, row, and seat-number combination within the request. The database unique constraint remains the final duplicate check across requests.

`VenueSeatMapResponse` groups seats by section so the frontend can reuse the event seat-map rendering pattern while authoring a venue layout.

### Event

`dto/event` contains:

- `CreateEventRequest`
- `PublishEventRequest`
- `EventResponse`

Do not add a general event update DTO. `PublishEventRequest` represents the explicit event-status workflow transition.

`CreateEventRequest` validates that:

- `startsAt` is in the future.
- `salesCloseAt` is before or equal to `startsAt`.

Service logic must additionally validate allowed status transitions; a non-null enum alone does not restrict the target to a valid transition.

### Seat class

`dto/seatclass` contains:

- `CreateSeatClassRequest`
- `SeatClassResponse`

Seat classes are create/read only. Before launch, an incorrect price is handled by deleting and recreating the class.

`CreateSeatClassRequest` currently carries `eventId`; service logic must resolve that event and pass it to the mapper.

### Event zone

`dto/eventzone` contains:

- `CreateEventZoneRequest`
- `EventZoneResponse`

Event zones are create/read only. `remainingQty` is derived from `capacity - heldQty - soldQty`; it is not a stored column.

### Event seat

`dto/eventseat` contains:

- `GenerateEventSeatsRequest`
- `EventSeatResponse`
- `SeatMapResponse`
- `SeatSectionResponse`

Seats are generated in bulk from venue-seat IDs. Do not add per-seat create/update DTOs unless the lifecycle changes.

### Hold

`dto/hold` contains:

- `CreateHoldRequest`
- `HoldResponse`
- `HeldSeatItem`
- `HeldZoneItem`
- `HoldConflictResponse`

A hold cart must contain at least one seat or zone item. Zone quantities must be positive. `totalUsdCents` is calculated by application logic rather than stored on the `hold` table.

### Booking

`dto/booking` contains `CheckoutRequest`, `BookingResponse`, and `BookingItemResponse`.

`CheckoutRequest` carries only the hold id and who the tickets are for. It must never
accept an amount: everything priced is read from the hold, so a tampered request cannot
change what is owed.

### Payment

`dto/payment` contains:

- `StartPaymentRequest` — the provider, and nothing else. Same reasoning as checkout: the
  amount and currency come from the booking's snapshotted totals.
- `PaymentResponse`

`PaymentResponse` deliberately carries more than the `payment_transaction` row.
`bookingState` and `pollAfterMs` let a pay screen drive its whole wait from one response —
render, poll on the interval the server asks for, stop when the booking reads `CONFIRMED` —
without a second request or a hard-coded timer. `qrPayload` is null once the attempt is
settled, so a closed attempt never keeps offering something scannable.

## Intended endpoint surface

| Resource | Endpoints |
|---|---|
| Venue | `POST /venues`, `PUT /venues/{id}` |
| Event | `POST /events`, `PATCH /events/{id}/status` |
| Seat class | `POST /events/{id}/seat-classes` |
| Event zone | `POST /events/{id}/zones` |
| Event seat | `POST /events/{id}/seats/generate`, `GET /events/{id}/seats` |
| Hold | `POST /holds`, `GET /holds/{id}` |
| Booking | `POST /bookings`, `GET /bookings/me`, `GET /bookings/{id}` — **implemented** |
| Payment | `POST /bookings/{id}/payments`, `GET /bookings/{id}/payments`, `GET /payments/{id}`, `POST /payments/{id}/refresh` — **implemented** |

Implemented controllers live under `/api` and are grouped by `@Tag` for Swagger
(`/swagger-ui.html`). They take an `X-User-Id` header as a stand-in for the authenticated
principal until the auth lane lands; every ownership failure answers `404`, never `403`,
so ids cannot be walked.

Do not add general `PUT` or `PATCH` endpoints for seat classes, zones, seats, or holds without an explicit lifecycle requirement.

## Mapper boundaries

- Keep repository lookups, authentication access, and not-found decisions in the service layer.
- Mappers should receive already-resolved entities and authenticated IDs as arguments.
- `EventsMapper` receives a resolved `Venue`.
- `EventSeatMapper` receives the `Event`, `SeatClass`, and list of `VenueSeat` entities and creates event-specific seats in bulk.
- `VenueSeatMapper` maps all seat lines in a bulk request to one resolved `Venue`.
- `SeatClassMapper` and `EventZoneMapper` map their create DTOs with service-resolved parent entities where needed.
- `HoldMapper` receives a resolved `Event` and authenticated user ID, creates an `ACTIVE` hold, and currently sets its expiry to ten minutes from creation.

## Concurrency and integrity

- Preserve the database constraint allowing only one active hold per user per event.
- Convert its PostgreSQL unique violation into an HTTP `409` response using `HoldConflictResponse`.
- Use database constraints as the final integrity boundary; application checks alone are insufficient for booking races.
- Preserve optimistic locking for zone quantities and event-seat state.
- Never calculate availability from stale client input.

## Validation and API boundaries

- Controllers should accept request records with `@Valid`.
- Controllers should return response records, not JPA entities.
- Mapping between entities and DTOs belongs in a mapper or service layer, not in controllers.
- Request DTO validation handles shape and basic invariants. Authorization, ownership, foreign-key existence, inventory mode, sales-window state, and workflow transitions belong in service logic.
- Do not expose lazy JPA relationships directly through JSON serialization.

## Verification

The repository currently has no Maven wrapper and the local `mvn` command may be unavailable. When Maven is available, run:

```bash
cd api
mvn test
```

At minimum, compile all changed entities, enums, and DTOs and keep `git diff --check` clean for files changed by the task. Do not modify unrelated working-tree changes.

## Current implementation notes (2026-08-13)

The current working tree adds or changes the following:

- Added the `VenueSeat` entity and `VenueSeatRepository`.
- Added bulk venue-seat request and grouped seat-map response DTOs.
- Changed `EventSeat` from scalar `venueSeatId` to a lazy `VenueSeat` association.
- Changed `EventSeat` from a `Hold` association to scalar `holdId` while retaining `holdExpiresAt` for reservation lifecycle operations.
- Added Java mappers grouped under `mapper/Event`, `mapper/Hold`, `mapper/SeatClass`, and `mapper/Venue`; removed the old Kotlin `HoldMapper` placeholder.
- Refactored event, event-seat, seat-class, zone, venue-seat, and hold mapping so resolved parent entities can be supplied by services.
- Added `eventId` validation to `CreateSeatClassRequest`.

Before treating this work as complete:

- Fix `VenueMapper`: `organizerId` must populate `Venue.organizerId`, not `Venue.id`.
- Remove unused imports from the new and edited mapper classes.
- Add service/controller wiring for venue-seat creation and retrieval; no venue-seat endpoint is implemented yet.
- Confirm whether `eventId` belongs in `CreateSeatClassRequest` when the intended endpoint already identifies the event in its path.
- Run the Maven test suite and `git diff --check` after the implementation compiles.
