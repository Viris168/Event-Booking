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
└── dto/               DTOs grouped by table/domain
    ├── venue/
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
- `event_seat` -> `EventSeat`
- `hold` -> `Hold`

Entity mapping rules:

- Use `@Table` and explicit `@Column`/`@JoinColumn` names matching the Flyway schema.
- Use `GenerationType.IDENTITY` for `GENERATED ALWAYS AS IDENTITY` primary keys.
- Use `Instant` for PostgreSQL `TIMESTAMPTZ` columns.
- Use `BigDecimal` for fixed-precision coordinates.
- Use `EnumType.STRING` for database-backed enums.
- Use `@Version` on `event_zone.version` and `event_seat.version` for optimistic locking.
- Keep associations lazy unless there is a demonstrated reason otherwise.
- Avoid Lombok `@Data` and generated recursive `toString`/`equals` methods on entity relationships.

Relationships are mapped between the six implemented entities. Foreign keys whose target entities do not exist yet remain scalar IDs:

- `Venue.organizerId` represents `venue.organizer_id`.
- `Event.organizerId` represents `event.organizer_id`.
- `EventSeat.venueSeatId` represents `event_seat.venue_seat_id`.
- `Hold.userId` represents `hold.user_id`.

Replace these IDs with associations only when `OrganizerProfile`, `VenueSeat`, and `AppUser` are implemented, and update DTO/service mapping deliberately.

## Shared enums

Keep these enums in `com.eventbooking.Enumeration`:

- `InventoryMode`: `SEATED`, `ZONED`, `MIXED`
- `EventStatus`: `DRAFT`, `PUBLISHED`, `TAKEN_DOWN`
- `SeatStatus`: `AVAILABLE`, `HELD`, `SOLD`, `BLOCKED`
- `HoldStatus`: `ACTIVE`, `CONSUMED`, `EXPIRED`, `RELEASED`
- `BookingStatus` and `Role` also live in this package.

Use `SeatStatus`; do not recreate the old `EventSeatStatus` name.

## DTO organization

### Venue

`dto/venue` contains:

- `CreateVenueRequest`
- `UpdateVenueRequest`
- `VenueResponse`

Venue is the only regular resource with an update request. The update is for venue corrections and must not allow organizer/ownership changes.

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

## Intended endpoint surface

| Resource | Endpoints |
|---|---|
| Venue | `POST /venues`, `PUT /venues/{id}` |
| Event | `POST /events`, `PATCH /events/{id}/status` |
| Seat class | `POST /events/{id}/seat-classes` |
| Event zone | `POST /events/{id}/zones` |
| Event seat | `POST /events/{id}/seats/generate`, `GET /events/{id}/seats` |
| Hold | `POST /holds`, `GET /holds/{id}` |

Do not add general `PUT` or `PATCH` endpoints for seat classes, zones, seats, or holds without an explicit lifecycle requirement.

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
