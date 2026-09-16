-- ============================================================
-- V30: bookings lose the refund path
-- ============================================================
--
-- REFUND_REQUESTED and REFUNDED are gone from BookingStatus, so the CHECK that
-- kept booking.state in sync with that enum has to lose them too. Left in
-- place, the constraint would go on permitting two values no Java code can
-- produce or read - and a row written by hand into either of them would come
-- back out of Hibernate as an enum-mapping failure rather than as anything a
-- caller could act on.
--
--
-- WHAT THIS MAKES TRUE
-- ------------------------------------------------------------
-- CONFIRMED becomes the end of the line. It was already the case that money
-- could not be un-charged - uq_payment_txn_one_success_per_booking sees to
-- that - but until now there was a path from CONFIRMED back out, through a
-- refund, that released the seats. There is no longer any path at all.
--
-- The consequence is worth stating plainly rather than discovering: nothing in
-- the product can reverse a paid booking. A duplicate charge, a cancelled
-- show, a customer who paid twice - all of those are now settled out of band
-- by whoever holds the merchant account, and the booking row keeps saying
-- CONFIRMED regardless. PaymentService logs at ERROR when money lands against
-- a booking it cannot be applied to, because nothing downstream will catch it.
--
--
-- WHY THIS IS SAFE TO RUN
-- ------------------------------------------------------------
-- It is only safe while no row uses either value. The guard below checks
-- rather than assumes, and refuses to run if it finds any - dropping the
-- states out from under live rows would leave bookings that cannot be loaded.
--
-- booking_status_history is deliberately untouched. Its from_state/to_state
-- are free text with no CHECK, and they are an audit trail: if a booking was
-- ever refunded, the history should keep saying so even though the state no
-- longer exists. Rewriting history to match a schema change is how an audit
-- trail stops being one.
-- ============================================================

DO $$
DECLARE stuck BIGINT;
BEGIN
    SELECT count(*) INTO stuck
    FROM booking
    WHERE state IN ('REFUND_REQUESTED', 'REFUNDED');

    IF stuck > 0 THEN
        RAISE EXCEPTION
            'V30 refuses to run: % booking(s) are in a refund state, which this migration removes. '
            'Decide what should happen to them - they cannot simply be relabelled, because each one '
            'represents money that was taken and may or may not have been returned.', stuck;
    END IF;
END $$;

ALTER TABLE booking DROP CONSTRAINT booking_state_check;

ALTER TABLE booking ADD CONSTRAINT booking_state_check
    CHECK (state IN (
        'PENDING_PAYMENT',
        'AWAITING_CONFIRMATION',
        'PAYMENT_FAILED',
        'CONFIRMED',
        'EXPIRED',
        'CANCELLED'
    ));

COMMENT ON COLUMN booking.state IS
    'Must stay in sync with the BookingStatus enum. CONFIRMED is terminal: there is no refund path, and a paid booking cannot be reversed in-product.';
