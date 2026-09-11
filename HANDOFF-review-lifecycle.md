# Handoff: event review lifecycle → admin side

**From:** Viris (organizer/catalog lane)
**To:** Sovannara — admin page, JWT/login, review queue
**Branch:** `Dev-viris`
**Last verified:** 2026-09-10 against the working tree — 197 tests green
(`cd api && ./mvnw -o test`)

The review lifecycle is built, authorized and tested. The catalog write
endpoints are now all behind an ownership check (§9 — closed, was the urgent
item). What's left on your side is login, the queue endpoint, and the page.

---

## 0. Your tasks, and where the lanes divide

| # | Task | Why |
|---|---|---|
| 1 | **Reseed the demo passwords** — §1 | Blocks your own login work; nobody can sign in today |
| 2 | **Lock down `SecurityConfig`** (#20) — §2 | Every endpoint is still `permitAll`; the header→principal swap goes with it |
| 3 | **`GET /events?status=`** — §3 | Four lines; the queue page can't be built without it |
| 4 | **The admin page** — §4 | The actual screen. Consider a new `/admin/review` route |

Sections 5–8 are reference — read them when you need them, not before starting.

### Files I'm in

`EventController`, `EventZoneController`, `EventSeatController`,
`SeatClassController`, `VenueSeatController`, everything under `service/`,
`mapper/`, `dto/`, and `web/src/api/events.js` + `venues.js`.

Yours: `pages/admin/`, `config/SecurityConfig.java`, `security/Jwt*`,
`security/Auth*`, `controller/AuthController.java`, and the next migration.
`client.js` we'll both touch — shout before pushing to it.

---

## 1. Task 1 — the demo passwords don't work

`V6__seed_demo_users.sql` inserts the **literal string** `'hashed-password'`
into `password_hash` for all fifteen demo users, admin id 3 included:

```sql
( 3, '+85510111222', 'admin@example.com', 'hashed-password', 'Platform Admin', ...)
```

That is not a BCrypt hash, so `BCryptPasswordEncoder.matches()` returns false
for every one of them, forever. No seeded account can log in through your
`AuthController` — which is worth knowing before you spend an evening debugging
`/auth/login` that is, in fact, working correctly.

Fix it in a new migration rather than editing V6: V6 has already run on every
developer's database and Flyway will not re-run it. **`V18__event_image_urls.sql`
exists, so yours is V19.**

Until then, `X-User-Id` still identifies everyone — see §2.

---

## 2. Task 2 — locking down `SecurityConfig` (#20)

### Where it stands

Your `JwtAuthenticationFilter` is installed and deliberately non-rejecting: no
token, expired token, forged token — it leaves the context empty and calls the
next filter. `SecurityConfig` is still:

```java
.requestMatchers("/api/v1/auth/**").permitAll()
.anyRequest().permitAll()
```

So every endpoint in the application is open, and every controller still reads
its actor from `@RequestHeader("X-User-Id")`. That split is correct for now —
it's what let your filter land without breaking the booking and catalog lanes.

### What changed on my side that you need

**All four catalog write controllers now take `X-User-Id` and resolve an
organiser.** Before this week they took nothing at all. That matters to you
because you can now write role rules that actually line up with the code:

| Controller | Writes | Reads |
|---|---|---|
| `EventZoneController` | POST/PATCH/DELETE — organiser | 2 GETs — public |
| `EventSeatController` | POST — organiser | GET seat-map — public |
| `SeatClassController` | POST/PATCH — organiser | 2 GETs — public |
| `VenueSeatController` | POST — organiser | GET — public |
| `AdminEventController` | all — **admin** | — |

**Paths are now consistently plural**, which makes your matchers writable as
one rule. Every event-scoped route is `/api/v1/events/...` and every admin route
is `/api/v1/admin/events/...`. This used to be split - `EventSeatController`
wrote to `/events/{id}/seats` while reading from `/event/{id}/seat-map`, and
zones, seat classes and the event collection itself were singular - so a matcher
on `/api/v1/event/**` silently missed four routes. That is fixed; `/api/v1/event`
(singular) now matches nothing at all.

Zone-scoped routes stay `/api/v1/zone/{id}` because they hang off a zone, not an
event.

**These controllers have no `X-User-Id` and that is correct** — genuinely public
or machine-called: `HealthController`, `ProvinceController`,
`SeatAvailabilityController`, `ZoneAvailabilityController`, your
`AuthController`, and the two payment webhook/simulation controllers
(`PaymentController`, `PaywaySimulationController` — those are provider
callbacks, and they need their own signature check, not a user login).

### The swap itself

Every guarded controller does the same two lines:

```java
@RequestHeader("X-User-Id") Long actorUserId
Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
```

Replacing the header with the principal is a change to that first line, in each
controller, and nothing below it — the service layer already takes an actor id
per call, so no service, repository or test moves.

**Don't delete the resolvers.** A JWT proves *who* the caller is. It says
nothing about *whose venue* they may write to. `requireOwner` answers a
different question and still has to run after authentication lands. See §9 for
what happens without it.

---

## 3. Task 3 — the queue endpoint

`GET /api/v1/events` currently takes only `page` and `size`:

```java
public ResponseEntity<Page<EventResponse>> listEvents(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size)
```

The queue wants `?status=PENDING_REVIEW` sorted by `submitted_at` ascending —
oldest submission first, because a review queue is a fair-order queue. The
partial index `idx_event_pending_review` was created in V14 for exactly this
query.

One design call is yours: whether `status` accepts a list. The queue screen
probably wants only `PENDING_REVIEW`; an admin directory would want several.

---

## 4. Task 4 — the admin page

### Where it is now

`web/src/pages/admin/AdminEventsPage.jsx` imports `mock/store.js`, not the API,
and offers only **Take down / Restore** — no approve, no reject, no queue.

Already done for you: the status filter lists all seven statuses, and `Badge`
has styles plus en/km labels for the four new ones. The states render correctly
the moment the page is wired to real data.

### What to render from

Every `EventResponse` carries what the UI needs — see §5. In particular
`available_actions` tells you which buttons are legal, so **don't hardcode the
rules in React**; they're derived server-side from the same table the API guards
with, and a test asserts the two agree.

The catch: `available_actions` is **status-scoped, not role-scoped**.
`PENDING_REVIEW` lists all four legal actions, but `APPROVE`, `REJECT` and
`REQUEST_CHANGES` are admin-only while `WITHDRAW` is the organiser's. Filter by
role in the client; the server enforces it regardless of what you render.

If you'd rather the server split it per caller, that's a reasonable change to
make now — the queue is the first screen where both roles look at the same
event, so it's the natural moment. Your call, it's your lane.

### A suggestion

Build the queue as its own route (`/admin/review`) rather than growing
`AdminEventsPage.jsx`. A queue you work through is a different screen from a
directory you browse: different sort, different default filter, different
primary action, and a "1 of 12 remaining" affordance that makes no sense in a
directory.

### Watch out for mock/API mixing

Ten pages under `web/src/pages/` still import `mock/store.js`. Any page that
mixes mock data with API data disagrees with itself silently — see §7 for the
one that already cost a day of debugging. When a screen "shows nothing" after
you move it onto the API, suspect the identity before the query.

---

## 5. Reference — the lifecycle

### The state machine is the single source of truth

`catalog/EventStateMachine.java` — one table, nine edges:

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

`WITHDRAW` out of `APPROVED` is what stops approval being a trap: `APPROVED` is
not editable, so without that edge an organiser who spotted their own mistake
after approval could neither fix it nor abandon it.

| method | for |
|---|---|
| `requireTransition(from, transition)` | services — returns the target status or throws 409 |
| `availableTransitions(status)` | what actions are legal right now |
| `isEditable(status)` | whether the organiser may still change fields |

### `EventResponse`

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

### The endpoints

```
PATCH /api/v1/events/{id}/submit                   organiser
PATCH /api/v1/events/{id}/withdraw                 organiser
GET   /api/v1/events/{id}/review                   history, with diffs

PATCH /api/v1/admin/events/{id}/approve            admin
PATCH /api/v1/admin/events/{id}/reject             admin + message
PATCH /api/v1/admin/events/{id}/request-changes    admin + message
PATCH /api/v1/admin/events/{id}/takedown           admin
```

Admin actions live on their own controller behind `AdminResolver`, which reads
`app_user.role == PLATFORM_ADMIN` and refuses disabled accounts. Seeded admin is
**`app_user.id = 3`** (V6) — `X-User-Id: 3` passes today, and in the browser
`localStorage.setItem('mockUserId', 3)` gives you a working admin session until
your login exists, because `client.js` already sends that header.

Three guards that refuse calls which used to work:

* `updateEvent` rejects edits while `PENDING_REVIEW` or `APPROVED`
* `publishEvent` requires `APPROVED` — a DRAFT can no longer be published
* `takeDownEvent` requires `PUBLISHED`

`submit` also refuses an event with nothing to sell: ZONED needs ≥1 zone, SEATED
needs ≥1 seat class each with ≥1 seat, MIXED needs both.

### Review history and diffs

`GET /events/{id}/review` returns the `event_review` log, diffing each entry
against the previous snapshot — so a re-review reads as "title_en changed"
rather than as a second full read-through. Useful on the queue screen when an
event comes back after `CHANGES_REQUESTED`.

`EventSnapshotter` compares the venue by **id** (a venue rename is the venue's
history, not the event's) and artwork by **presence** (re-uploading the same
picture mints a new Cloudinary id and would otherwise report a phantom change).

---

## 6. Reference — the database

`V14__event_review_lifecycle.sql` is applied; V15–V18 landed on top of it, so
**the next migration number is V19.**

- `event.status` CHECK rebuilt with all 7 states
- `event.submitted_at` — set on submit, cleared on withdraw
- `event_review` — append-only log: `actor_id`, `action`, `message`,
  `from_status`, `to_status`, `snapshot JSONB`, `created_at`
- `idx_event_pending_review` — partial index, for your §3 query
- `uq_event_slug_live` — partial unique on slug, excluding REJECTED, so a
  rejected event doesn't permanently burn its URL

There is deliberately no `reviewed_at` / `reviewed_by` on `event`: an event can
be reviewed many times, and one column keeps only the last.

---

## 7. The mock/database trap, in case you hit it

`app_user` ids matched between `web/src/mock/seed.js` and the database.
`organizer_profile` ids did not — they were a permutation of the same four
people:

| profile | mock (before) | database |
|---|---|---|
| 1 | user 2 (Chantha Meas) | **user 5 (Dev Organizer)** |
| 2 | user 4 (Sophea Nou) | **user 2 (Chantha Meas)** |
| 3 | user 5 (Dev Organizer) | **user 4 (Sophea Nou)** |
| 4 | user 15 (Sovann Chey) | user 15 (Sovann Chey) |

The worst kind of mismatch: every id exists on both sides, so nothing 404s and
nothing errors — the screen just shows one organiser another organiser's rows.

It surfaced as the transactions page reporting **0 transactions** against a
database holding 96. Logged in as Chantha Meas, the mock said
`organizerProfile.id = 1` and filtered the event dropdown accordingly, while the
API resolved user 2 to profile **2** and correctly returned profile 2's bookings
— of which there are none.

Fixed: `organizerProfiles` in `mock/seed.js` is now ordered to match the
database, with a comment saying why the order is load-bearing.

The real fix is to stop maintaining two seed files — which is your task 1 and 2.
Once login is real, the mock user list can go.

---

## 8. Running it

```bash
cd api && ./mvnw -o test          # 197 tests, green as of 2026-09-10
```

```bash
cd api && ./mvnw spring-boot:run
```

```bash
cd web && npm run dev
```

Postgres is in `docker-compose.yml` on host port **55432**; migrations through
V18 are applied, and Flyway runs new ones at app start. The Vite origin is
allowed by CORS via `app.cors.allowed-origins`. The web app reads
`VITE_API_BASE_URL` and falls back to `/api/v1`.

---

## 9. Closed — the catalog authorization hole

Recorded because it shaped the rules you'll write in §2, and because an earlier
draft of this document understated it by half.

**Four** write controllers were reachable with no caller check of any kind — not
two. `VenueSeatController` and `SeatClassController` were the known ones;
`EventZoneController` and `EventSeatController` were missed because they predate
the review lane and nobody had reason to reread them. The zone controller was
the worst of the four: `DELETE /zone/{id}` deactivated any organiser's zone for
anyone who could reach the URL.

What was done:

- All four now take `X-User-Id` and resolve an organiser; their GETs stay public
- `requireOwner` in every write path, resolving through the owning event or venue
  (a zone and a tier have no owner column of their own)
- `venueId` dropped from `CreateVenueSeatsRequest`, `eventId` from
  `CreateSeatClassRequest` — both were in the path *and* the body. For venue
  seats the body value was the one that got written, so `POST /venue/1/seats`
  with `venue_id: 7` wrote to venue 7, and an ownership check against the path
  would have protected nothing
- `generateEventSeats` now also checks that the body's `seatClassId` belongs to
  this event and its `venueSeatIds` to this event's venue — owning the event is
  not enough when the ids arrive in the body
- `web/src/api/venues.js` and `events.js` stopped sending the dropped fields
- `security/CatalogOwnershipTest` — 9 tests, one per refused write plus the two
  cross-tenant cases, each asserting nothing was saved. A check that throws
  after the write is not a check

Also previously closed: the `setNameEn`/`setNameKm` copy-paste bug, partial
PATCH nulling omitted fields, missing `@Transactional`, the raw 500 on duplicate
seats, and `takedown` moving behind `AdminResolver`.
