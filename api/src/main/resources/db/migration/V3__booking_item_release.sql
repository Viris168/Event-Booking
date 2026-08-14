-- ============================================================
-- V3: make the seat double-booking guard survive cancellations
-- Owner: Winner (Booking & Payments), issue #30
-- ============================================================
--
-- V1 shipped this guard:
--
--     CREATE UNIQUE INDEX uq_booking_item_seat
--         ON booking_item (event_seat_id)
--         WHERE event_seat_id IS NOT NULL;
--
-- The intent was right - one seat, one booking - but the index has no
-- notion of the booking being over. booking_item rows are kept forever as
-- financial history, so the first time a booking is CANCELLED, EXPIRED or
-- REFUNDED its seat becomes permanently unsellable: event_seat.status goes
-- back to AVAILABLE, a customer can hold it again, and then checkout dies
-- on a 23505 against a booking_item row belonging to a booking that ended
-- months ago.
--
-- The fix is to give the index a way to tell a live line from a closed one.
-- A partial index cannot reach across to booking.state, so the liveness bit
-- is denormalised onto booking_item as released_at, stamped by
-- BookingService when a booking reaches a terminal state. Null means the
-- line still occupies its seat; non-null means the seat has been handed
-- back and the row is now history.
--
-- Chosen over the alternatives: mirroring booking.state onto every line
-- needs a trigger to stay honest, and deleting the rows would destroy the
-- audit trail that ticketing disputes depend on.

ALTER TABLE booking_item
    ADD COLUMN released_at TIMESTAMPTZ;

-- Backfill: any line whose booking has already ended is closed. (No-op on a
-- fresh database; matters for environments seeded before this migration.)
UPDATE booking_item bi
SET released_at = b.state_changed_at
FROM booking b
WHERE bi.booking_id = b.id
  AND b.state IN ('EXPIRED', 'CANCELLED', 'REFUNDED');

DROP INDEX uq_booking_item_seat;

CREATE UNIQUE INDEX uq_booking_item_seat_live
    ON booking_item (event_seat_id)
    WHERE event_seat_id IS NOT NULL AND released_at IS NULL;

-- Zone lines never had a uniqueness guard (many bookings legitimately share
-- one zone), but the release sweep filters on this column, so index it.
CREATE INDEX idx_booking_item_live
    ON booking_item (booking_id)
    WHERE released_at IS NULL;
