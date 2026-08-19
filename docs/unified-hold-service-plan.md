# Unified Hold Service — Implementation Plan

Status: proposed (not yet implemented)
Scope: the inventory lane only (create / get / release / expire). Checkout is out of scope and already unified.

---

## 0. Premise correction (read this first)

Zone-only and mixed checkout **already work**. The real checkout path is:

```
BookingController.checkout
  -> BookingService.checkout
    -> BookingService.convertHold(CheckoutRequest, actorUserId)
```

`BookingService.convertHold` already consumes both halves of a hold in one transaction
(`api/src/main/java/com/eventbooking/booking/BookingService.java:111-229`):

- seats: `HELD -> SOLD`, clears `event_seat.hold_id` / `hold_expires_at`
- zone lines: `event_zone.held_qty -= qty`, `event_zone.sold_qty += qty`
- `hold.status -> CONSUMED`

Consequences:

- `ZoneHoldService.convertHold` **not existing** is correct, not a bug.
- `SeatHoldService.convertHold` (only reached via `SeatHoldController`
  `PATCH /api/events/{holdId}/seats/holds`) is a **redundant, ownership-less
  duplicate** of checkout and should be deleted, not fixed.

---

## 1. Current state (accurate map)

| Concern              | Owner                                              | Mixed-safe?                        |
| -------------------- | -------------------------------------------------- | ---------------------------------- |
| Checkout / convert   | `BookingService.convertHold`                        | yes (seats + zones together)       |
| Create seat hold     | `SeatHoldService.createHold(seatIds)`               | no (seats only)                    |
| Create zone hold     | `ZoneHoldService.createHold(zoneId, qty)`           | no (single zone only)              |
| Get hold             | both services, separately                           | each ignores the other half        |
| Release hold         | both services, separately                           | each frees only its own half       |
| Expire (sweeper)     | `HoldExpiryJob` calls both services                 | **live bug** (see defect 3)        |
| Second sweeper       | `ZoneHoldController.runSweeper()` `@Scheduled`      | duplicate zone-only sweeper        |

---

## 2. Defects this plan removes

1. **No mixed cart** — a `MIXED` event cannot hold seats + zones in a single `Hold`.
2. **Release leaks** — releasing a mixed hold through either service frees only its own half.
3. **Sweeper double-expiry** — `HoldExpiryJob` calls `seatHoldService.expireActiveHolds(now)`
   then `zoneHoldService.expireActiveHolds(now)`. The first flips `hold.status = EXPIRED`;
   the second sees `status != ACTIVE` and skips the hold, stranding the zone inventory.
4. **Two sweepers** — `HoldExpiryJob` (30s) and `ZoneHoldController.runSweeper` (60s) both run;
   the controller one only knows zones.
5. **Redundant convert** — `SeatHoldService.convertHold` + its `PATCH` endpoint duplicate
   checkout without any ownership check.

---

## 3. Target architecture

One inventory-lane service owns create / get / release / expire. Convert/checkout stays in
`BookingService`.

```
HoldService (new, inventory lane only)
  ├─ createHold(eventId, seatIds, zoneQty, userId)   // mixed, one Hold
  ├─ getHold(holdId, userId)
  ├─ releaseHold(holdId, userId)                      // frees BOTH halves
  └─ expireActiveHolds(now)                            // frees BOTH halves per hold
```

---

## 4. Files

### New

- `service/hold/HoldService.java` — interface with the four methods above.
- `service/hold/impl/HoldServiceimpl.java`
  - `createHold`: on-sale + user check -> seat claim (from `SeatHoldServiceimpl`)
    + per-zone claim (from `ZoneHoldServiceimpl`, generalized to `Map<Long,Integer>`)
    -> one `Hold` + `event_seat.hold_id` + `hold_zone_line` rows
    -> `HoldResponse` with **both** `seats` and `zones`.
  - `releaseHold` / `expireActiveHolds`: single pass that calls **both**
    `releaseHeldSeats(holdId)` and `releaseHeldZoneInventory(hold)` before flipping status.
- `controller/hold/HoldController.java` (replaces both hold controllers):

  ```
  POST   /v1/events/{eventId}/holds   -> createHold   (body: { seatIds, zoneQty })
  GET    /v1/holds/{holdId}            -> getHold      (X-User-Id header)
  DELETE /v1/holds/{holdId}            -> releaseHold  (X-User-Id header)
  ```

### Modified

- `Job/HoldExpiryJob.java` — inject only `HoldService`; call `expireActiveHolds(now)` once.

### Deleted

- `service/Seat/SeatHoldService.java` + `impl/SeatHoldServiceimpl.java`
- `service/Zone/ZoneHoldService.java` + `impl/ZoneHoldServiceimpl.java`
- `controller/Seat/SeatHoldController.java` (its `PATCH convertHold` dies with it)
- `controller/Zone/ZoneHoldController.java` (its `runSweeper()` `@Scheduled` dies with it)

### Slimmed

- `dto/hold/CreateHoldRequest.java` — drop `eventId`, keep
  `{ List<Long> seatIds; Map<Long, @Positive Integer> zoneQty; }` with an `@AssertTrue`
  "at least one seat or zone".

### Untouched

- `BookingService` / `BookingController` (checkout is already unified).

---

## 5. Migration order (each step compiles)

1. Create `HoldService` + impl by copying the seat-claim and zone-claim logic out of the
   two existing impls (no deletion yet).
2. Add `HoldController`; point it at `HoldService`.
3. Rewire `HoldExpiryJob` -> `HoldService.expireActiveHolds`.
4. Remove `ZoneHoldController.runSweeper()`.
5. Delete `SeatHoldController` (including the redundant convert endpoint),
   `ZoneHoldController`, and the two old services.
6. Slim `CreateHoldRequest` (drop `eventId`, keep `seatIds` + `zoneQty`).

---

## 6. Concurrency invariants to preserve (load-bearing)

- **Zone mutation**: lock zones in sorted-id order via `eventZoneRepository.findAllByIdForUpdate`
  before touching `heldQty`/`soldQty` (see `BookingService.lockZonesOf` and
  `ZoneHoldServiceimpl.lockZonesOf`).
- **Hold mutation**: `findOwnedByIdForUpdate(holdId, userId)` for release;
  `findByIdForUpdate(holdId)` for expire.
- **Seat mutation**: `eventSeatRepository.findByHoldIdForUpdate` for release/expire
  (as `BookingService.releaseExpiredHold` does).
- **Seat claim on create**: keep the `AVAILABLE` check + `@Version` optimistic lock on
  `EventSeat`. Known gap: current `SeatHoldServiceimpl.createHold` claims seats via
  non-locking `findAllById`; revisit toward a locking read when extracting it.

---

## 7. Open questions

1. **Package naming** — `service/Seat`, `service/Zone`, `service/Venue` are capitalized while
   `service/event` and `booking` are lowercase. New package: `service/hold` or `service/Hold`?
2. **Controller routes** — consolidate to one `/v1/...` controller (proposed), or keep two thin
   `.../seats/holds` + `.../zones/holds` endpoints delegating to `HoldService`?
3. **`convertHold` on the wire** — confirm the redundant
   `PATCH /api/events/{holdId}/seats/holds` is dead and safe to delete
   (frontend checkout uses `/checkout`, not it).
