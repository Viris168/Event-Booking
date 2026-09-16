# Demo Video Script — Event Booking Platform (5 min)

Based on the ETEC 100% scholarship (Year 5) final evaluation notice: the video
must be ~5 minutes with voice-over, covering project overview, development
process, testing/debugging, feature walkthrough, and challenges faced. Submit
one video per team before **20/09/2026**.

Target runtime: 5:00. Times are cumulative — treat them as checkpoints, not
hard cuts.

## 0:00–0:45 — Overview

**Say:**
"Our project is an event booking platform built for the Cambodian market. It
supports two booking models: seat-level booking for halls and theaters, and
zone-level (general admission) booking for festivals and outdoor events.
The stack is React on the frontend, Java Spring Boot on the backend, and
PostgreSQL for the database. We're a team of three, working as vertical
slices: [Vireak] owns inventory and the seat map, [Winner] owns booking and
payments, and I own platform and identity — authentication, database
migrations, and shared infrastructure."

**Show on screen:** Landing/home page of the app, then a quick architecture
slide (React ↔ Spring Boot ↔ PostgreSQL) if you have one.

## 0:45–1:30 — Development process

**Say:**
"We designed the database schema first, using Flyway migrations rather than
letting the ORM auto-generate tables — this keeps the schema explicit and
version-controlled. We split ownership by feature slice instead of by layer,
so each of us could work end-to-end on our part without blocking the others.
Booking has a full state machine — [N] states covering hold, payment,
confirmation, expiry, and cancellation — to prevent double-booking under
concurrent access."

**Show on screen:** A quick look at the migration folder (`db/migration/`),
or the ER diagram / schema.dbml, or the booking state diagram if one exists.

## 1:30–2:15 — Testing & debugging

**Say:**
"To validate correctness, we tested [seat-locking under concurrent
requests / payment callback handling / whatever you actually tested] and
fixed issues like [double-charge guard, hold-spam constraint, missing
indexes on hot query paths — pick what's true]. We used [Postman /
integration tests / manual test scripts] to verify the booking and payment
flows end-to-end before wiring up the frontend."

**Show on screen:** A terminal running tests, Postman requests hitting the
API, or logs showing a concurrent-booking test passing.

## 2:15–4:15 — Feature walkthrough (the actual demo)

This is the core two minutes — walk through a real user journey live in the
app rather than describing it.

**Say + show, in order:**
1. Browse events → pick one with seat-level booking (a hall event) → select
   seats on the seat map → show the hold timer.
2. Go to checkout → pay via KHQR/Bakong or ABA PayWay (use sandbox/test
   mode) → show payment confirmation.
3. Show the generated ticket / booking confirmation.
4. Switch to a zone-level event (a festival) → book a zone/quantity instead
   of specific seats, to show the second booking model works too.
5. Briefly show the organizer or admin side if it exists — e.g. an
   organizer creating an event, or an admin dashboard.

**Say (closing this section):**
"That covers both booking models and the full payment flow from browsing to
confirmed ticket."

## 4:15–5:00 — Challenges & wrap-up

**Say:**
"The biggest challenge was [preventing double-booking under concurrent seat
holds / integrating KHQR and ABA PayWay sandbox APIs / getting the schema
right before building on top of it — pick the one that was actually hardest
for your team]. We solved it by [native SQL row-locking / idempotency keys /
whatever the real fix was]. Overall the project demonstrates [seat + zone
booking, secure JWT-based auth, real payment integration, and a
production-style schema-first database setup]. Thank you."

**Show on screen:** Team names/roles on a closing slide (nice for grading
attribution).

---

## Notes before recording

- Fill in every `[bracketed]` placeholder with what's actually true for your
  build — a grader will notice a generic script.
- Record a full run-through once first without narration to check the demo
  path doesn't hit a bug live; screen-record with narration after.
- Keep a stopwatch visible while recording — the notice says "approximately
  5 minutes," but going much over risks looking like you didn't edit it.
- Export as a single video file (voice-over baked in) — one file per team,
  submitted before 20/09/2026.
