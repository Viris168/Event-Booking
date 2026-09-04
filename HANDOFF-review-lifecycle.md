# Handoff: event review lifecycle → admin side

**From:** Viris (organizer side)
**To:** whoever builds the admin page + auth
**Branch:** `Dev-viris`
**Status:** backend groundwork done, 156 tests green. The admin *endpoints* and
the admin *page* are both open.

---

## 1. What already exists, and what you can rely on

### The state machine is the single source of truth

`catalog/EventStateMachine.java` — one table, eight edges:

```
DRAFT             --SUBMIT----------> PENDING_REVIEW
CHANGES_REQUESTED --SUBMIT----------> PENDING_REVIEW
PENDING_REVIEW    --WITHDRAW--------> DRAFT
PENDING_REVIEW    --APPROVE---------> APPROVED
PENDING_REVIEW    --REJECT----------> REJECTED
PENDING_REVIEW    --REQUEST_CHANGES-> CHANGES_REQUESTED
APPROVED          --PUBLISH---------> PUBLISHED
APPROVED          --WITHDRAW--------> DRAFT
PUBLISHED         --TAKE_DOWN-------> TAKEN_DOWN
```

`REJECTED` and `TAKEN_DOWN` are terminal — no outgoing edges.

Three methods:

| method | for |
|---|---|
| `requireTransition(from, transition)` | services — returns the target status or throws 409 |
| `availableTransitions(status)` | what actions are legal right now |
| `isEditable(status)` | whether the organizer may still change fields |

**Do not re-implement these rules anywhere else, including in React.** Every
`EventResponse` already carries `available_actions`, and it is derived from the
same table the server guards with. A test asserts the two agree.

### `EventResponse` gained four fields for the UI

```json
{
  "status": "PENDING_REVIEW",
  "submitted_at": "2026-09-04T03:45:00Z",
  "available_actions": ["WITHDRAW", "APPROVE", "REJECT", "REQUEST_CHANGES"],
  "editable": false,
  "latest_review": {
    "action": "REQUEST_CHANGES",
    "message": "Doors must open 90 minutes before the show.",
    "actor_name": "Platform Admin",
    "from_status": "PENDING_REVIEW",
    "to_status": "CHANGES_REQUESTED",
    "created_at": "2026-09-03T10:12:00Z",
    "changes": []
  }
}
```

`available_actions` is **status-scoped, not role-scoped**. `PENDING_REVIEW`
lists all four because all four are legal from that status — but `APPROVE`,
`REJECT` and `REQUEST_CHANGES` are admin-only and `WITHDRAW` is the organizer's.
Filter by role in the client; the server enforces it regardless.

If you'd rather the server split it per caller, that is a reasonable change to
make when you build the queue — it is the first screen where both roles look at
the same event.

### Admin identity is already solved

`security/AdminResolver.java`:

```java
Long adminUserId = adminResolver.requireAdminUserId(actorUserId);  // or 403
```

Mirrors `OrganizerResolver`. It reads `app_user.role == PLATFORM_ADMIN` and
refuses disabled accounts. **This is a real authorization check** — only the
*source* of `actorUserId` is temporary (`X-User-Id` header today, JWT subject
later). Nothing here needs deleting when auth lands; the swap happens in the
controller signature and stops there.

Seeded admin: **`app_user.id = 3`, "Platform Admin"** (V6). Send
`X-User-Id: 3` and it passes.

### The database

`V14__event_review_lifecycle.sql` — **not yet applied anywhere.** Flyway runs it
on next app start.

- `event.status` CHECK rebuilt with all 7 states
- `event.submitted_at` — set on submit, cleared on withdraw
- `event_review` — append-only log: `actor_id`, `action`, `message`,
  `from_status`, `to_status`, `snapshot JSONB`, `created_at`
- `idx_event_pending_review` — partial index for the queue
- `uq_event_slug_live` — partial unique on slug, excluding REJECTED, so a
  rejected event doesn't permanently burn its URL

`event_review` has no `reviewed_at`/`reviewed_by` on the event by design: an
event can be reviewed many times, and one column keeps only the last.

### Snapshot diffs are ready but not yet wired

`catalog/EventSnapshotter.java` captures the reviewable fields and diffs two
captures, so a re-review shows only what changed rather than the whole event.
The machinery and its 8 tests exist; **nothing writes a snapshot yet** because
`approve` doesn't exist. Wire it there.

---

## 2. What is still open

### 2a. The lifecycle endpoints (nobody has built these)

```
PATCH /api/v1/event/{id}/submit                   organizer
PATCH /api/v1/event/{id}/withdraw                 organizer
GET   /api/v1/event/{id}/review                   history

PATCH /api/v1/admin/event/{id}/approve            admin
PATCH /api/v1/admin/event/{id}/reject             admin + message
PATCH /api/v1/admin/event/{id}/request-changes    admin + message
```

Each one: load → authorize → `requireTransition` → set status → touch
`submitted_at` → write an `event_review` row → save. All in one `@Transactional`
so the status change and its log entry commit together.

Suggested: put admin endpoints on a **new `AdminEventController`**, separate
from `EventController`. Different authorizer, and it will want its own
`SecurityFilterChain` rule. `takedown` should move there too — it is a
moderation action currently sitting on the organizer's controller.

`message` should be `@NotBlank` on the request DTO for reject and
request-changes, matching the DB CHECK, so it fails as a 400 field error rather
than a raw constraint violation.

**Submit must also refuse an event with nothing to sell:** ZONED needs ≥1 zone,
SEATED needs ≥1 seat class each with ≥1 seat, MIXED needs both. Otherwise admin
reviews an empty shell.

### 2b. The admin queue needs a read endpoint

`GET /api/v1/event` has no status filter. The queue wants
`?status=PENDING_REVIEW` sorted by `submitted_at` — the partial index is already
there for exactly that query.

### 2c. `AdminEventsPage.jsx` today

It reads `mock/store.js`, not the API, and has only **Take down / Restore**.
No approve, no reject, no queue. The status filter dropdown exists but the four
new statuses aren't in `STATUSES`.

---

## 3. Things in your files that need fixing (not mine to touch)

Found while reading; I deliberately left them alone to avoid colliding with you.

1. **`SeatClassServiceimpl:56` — `setNameEn` called twice.** The second should
   be `setNameKm`. Editing a tier overwrites the English name with the Khmer one
   and never updates the Khmer name. Can also trip `UNIQUE (event_id, name_en)`.

2. **Same method nulls omitted fields.** `UpdateSeatClassRequest` has all-optional
   fields, but all three are assigned unconditionally — a partial PATCH sets the
   others to `null` and violates `NOT NULL`. Needs `if (x != null)` guards, like
   `updateEvent` does.

3. **Neither `SeatClassServiceimpl` nor `VenueSeatServiceimpl` has
   `@Transactional`**, unlike `EventServiceimpl`.

4. **`GlobalExceptionHandler` doesn't map `DataIntegrityViolationException`.**
   A duplicate seat hits the DB UNIQUE and returns a raw 500. It maps Jakarta's
   `ConstraintViolationException` (bean validation), which is a different thing.

---

## 4. The bigger gap: the seated path is unreachable

`POST /api/v1/events/{eventId}/seats` is the only endpoint that creates
`event_seat` rows, and **both of its inputs are unobtainable over HTTP**:

```
POST /events/{id}/seats          reachable
   ├── needs seatClassId    ←  SeatClassService.createSeatClass()   no controller
   └── needs venueSeatIds   ←  VenueSeatService.createVenueSeats()  no controller
```

Both services, their impls, mappers and DTOs are fully written. Only the
controllers are missing, so `grep` for callers of `venueSeatService.` and
`seatClassService.` returns nothing — they are dead code.

Nobody noticed because `DatabaseSeeder` writes `VenueSeat`, `SeatClass` and
`EventSeat` **directly through repositories**, so dev data exists and all the
booking tests pass. It only breaks for a real organizer creating a new seated
event, which nobody has done because the form doesn't exist yet.

### One trap when you wire those controllers

`createVenueSeats(CreateVenueSeatsRequest request)` takes `venueId` **in the
body** and has no organizer parameter. Neither service checks who is calling.

Wire it up as-is and any caller can write seats into **any venue**, including
one they don't own. That is the same client-supplied-owner hole already closed
on `CreateEventRequest` and `CreateVenueRequest`.

To match the existing pattern the signatures need to change:

```java
VenueSeatMapResponse createVenueSeats(Long organizerId, Long venueId, CreateVenueSeatsRequest request);
SeatClassResponse    createSeatClass(Long organizerId, Long eventId, CreateSeatClassRequest request);
SeatClassResponse    updateSeatClass(Long organizerId, Long seatClassId, UpdateSeatClassRequest request);
```

...then `organizerResolver.requireOwner(...)` inside. **Drop `venueId` from
`CreateVenueSeatsRequest`** once it comes from the path — with it in both places,
ownership can be checked against the path value while the write happens against
the body value, and the check protects nothing.

Note this is authorization, not authentication: a valid JWT proves *who* the
caller is and says nothing about *whose venue* they may write to. The two are
complementary, and JWT alone will not close this.

---

## 5. Suggested order

1. The four bug fixes above — small, and #1 corrupts data whenever it runs
2. `VenueSeatController` + `SeatClassController` with the ownership checks
3. The lifecycle endpoints (§2a), wiring `EventSnapshotter` into `approve`
4. `GET /event?status=` for the queue
5. `AdminEventsPage.jsx` off the mock store onto the API

Steps 1–2 unblock the seated path. Step 3 is what the organizer form is waiting
on. Nothing in 3–5 touches `EventZone`, `EventSeat` or `SeatClass` authz.

---

## 6. Running it

```bash
cd api && ./mvnw -o test          # 156 tests
```

Postgres is in `docker-compose.yml` on host port **55432**. V14 applies on next
app start. Nothing has been applied to the shared database yet.
