# Handoff: event review lifecycle → admin side

**From:** Viris (organizer side)
**To:** whoever builds the admin page + auth
**Branch:** `Dev-viris`
**Status:** the review lifecycle is built and tested end to end (168 tests
green). The admin *page* is open, and so is everything in §4.

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

### Snapshot diffs — wired

`catalog/EventSnapshotter.java` captures the reviewable fields, and `submit` and
`approve` both store one on their `event_review` row. `GET /event/{id}/review`
diffs each entry against the previous snapshot, so a re-review reads as
"title_en changed" rather than as a second full read-through.

Two rules it follows, both worth not undoing: the venue is compared by **id**
(a venue rename is the venue's history, not the event's) and artwork by
**presence** (re-uploading the same picture mints a new Cloudinary id and would
otherwise report a phantom change).

---

## 2. What is still open

### 2a. The lifecycle endpoints — BUILT

All six exist and were driven end to end against Postgres:

```
PATCH /api/v1/event/{id}/submit                   organizer
PATCH /api/v1/event/{id}/withdraw                 organizer
GET   /api/v1/event/{id}/review                   history, with diffs

PATCH /api/v1/admin/event/{id}/approve            admin
PATCH /api/v1/admin/event/{id}/reject             admin + message
PATCH /api/v1/admin/event/{id}/request-changes    admin + message
```

Admin actions live on a separate `AdminEventController` — different authorizer,
and it will want its own `SecurityFilterChain` rule when your JWT lands. Swap
`@RequestHeader("X-User-Id")` for the principal there and nothing below the
controller moves.

Three guards worth knowing about, because they will refuse calls that used to
work:

* `updateEvent` rejects edits while `PENDING_REVIEW` or `APPROVED`
* `publishEvent` now requires `APPROVED` — a DRAFT can no longer be published
* `takeDownEvent` now requires `PUBLISHED`

`submit` also refuses an event with nothing to sell: ZONED needs ≥1 zone,
SEATED needs ≥1 seat class each with ≥1 seat, MIXED needs both. The error names
the empty tier rather than saying "nothing on sale".

**`takedown` has not moved yet.** It is still on `EventController` and still
has no authorization at all — anyone who can reach it can take down any event.
Moving it to `AdminEventController` behind `AdminResolver` is a small job and
it is in your lane.

### 2b. The admin queue needs a read endpoint

`GET /api/v1/event` has no status filter. The queue wants
`?status=PENDING_REVIEW` sorted by `submitted_at` — the partial index is already
there for exactly that query.

### 2c. `AdminEventsPage.jsx` today

It reads `mock/store.js`, not the API, and has only **Take down / Restore** —
no approve, no reject, no queue. The status filter now lists all seven statuses,
and `Badge` has styles and en/km labels for the four new ones, so the states
render correctly the moment the page is wired.

Worth considering: build the review queue as its own route (`/admin/review`)
rather than growing this page. A queue you work through is a different screen
from a directory you browse, and it avoids us both editing one file.

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

## 5. Mock and database organizer profiles were permuted — now fixed

`app_user` ids already matched between `web/src/mock/seed.js` and the database.
`organizer_profile` ids did not:

| profile | mock (before) | database |
|---|---|---|
| 1 | user 2 (Chantha Meas) | **user 5 (Dev Organizer)** |
| 2 | user 4 (Sophea Nou) | **user 2 (Chantha Meas)** |
| 3 | user 5 (Dev Organizer) | **user 4 (Sophea Nou)** |
| 4 | user 15 (Sovann Chey) | user 15 (Sovann Chey) |

A permutation of the same four people, which is the worst kind of mismatch:
every id exists on both sides, so nothing 404s and nothing errors - the screen
just shows one organiser another organiser's rows.

### How it surfaced

The transactions page reported **0 transactions** against a database holding 96.
Logged in as Chantha Meas, the mock said `organizerProfile.id = 1` and filtered
the event dropdown accordingly, while the API resolved user 2 to profile **2**
and correctly answered with profile 2's bookings - of which there are none. Two
halves of one screen disagreeing about whose data it was.

### Fixed

`organizerProfiles` in `mock/seed.js` is now ordered to match the database, and
carries a comment saying why the order is load-bearing. `nextOrgId()` assigns
1..4 down that list, so reordering the entries is what fixes the mapping.

The 32 `organizer_id` references in the mock events and venues were left alone -
they still say "profile 1", which now means Dev Organizer rather than Chantha
Meas. That reassigns demo events between demo organisers and is self-consistent
either way.

### The general point, which still applies

Any page that mixes mock data with API data will disagree with itself wherever
the two seeds differ, and it will do so silently. The transactions page is
already half-and-half: real rows, mock event dropdown. Worth a look whenever a
screen is moved onto the API and something "shows nothing" - the identity is a
likelier cause than the query.

The real fix is to stop maintaining two seed files: log in against the API
(`web/src/api/auth.js` exists) and drop the mock user list entirely. That lands
naturally with the JWT work.

---

## 6. Suggested order

1. The four bug fixes above — small, and #1 corrupts data whenever it runs
2. `VenueSeatController` + `SeatClassController` with the ownership checks
3. ~~Move `takedown` behind `AdminResolver`~~ — done
4. `GET /event?status=` for the queue
5. `AdminEventsPage.jsx` off the mock store onto the API

Steps 1–2 unblock the seated path — still the biggest gap. Nothing in 3–5
touches `EventZone`, `EventSeat` or `SeatClass` authz.

---

## 7. Running it

```bash
cd api && ./mvnw -o test          # 156 tests
```

Postgres is in `docker-compose.yml` on host port **55432**. V14 applies on next
app start. Nothing has been applied to the shared database yet.
