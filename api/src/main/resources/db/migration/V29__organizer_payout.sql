-- ============================================================
-- V29: paying the organiser
-- ============================================================
--
-- Until now money only ever moved one way. A customer pays, payment_transaction
-- records it, and the platform holds the proceeds forever - there is no row
-- anywhere that says an organiser was ever settled with. This table is the
-- other direction: the organiser asks for what their finished event earned, an
-- admin agrees, and the transfer is recorded against a reference.
--
--     REQUESTED ──approve──> APPROVED ──mark paid──> PAID
--
-- APPROVED and PAID are deliberately two states rather than one click. They
-- answer different questions - "do we agree we owe this" and "has the money
-- left" - and a single state cannot say the first is true while the second is
-- not, which is exactly the window a bank transfer lives in.
--
-- There is no refused state. An admin who does not intend to pay a request
-- simply does not approve it, and it waits in the queue; a request that should
-- never be paid is a conversation with the organiser rather than a row status.
--
--
-- THE MONEY IS A SNAPSHOT, NOT A VIEW
-- ------------------------------------------------------------
-- gross/fee/net are stored, not derived on read. An invoice is a statement
-- about a moment: "on 2026-09-15 this event had earned $4,210.00". Computed
-- live it would be a different document every time anybody opened it - a
-- booking cancelled the day after the transfer would silently rewrite an
-- invoice that had already been paid against, and the organiser's copy and the
-- admin's would disagree depending on who refreshed last.
--
-- fee_bps is snapshotted for the same reason, one level up: the platform's
-- commission is configuration, and configuration changes. Reading the rate at
-- render time would retroactively re-price every invoice ever issued the first
-- time somebody edited the yml.
--
--
-- NO REFUND LINE
-- ------------------------------------------------------------
-- Gross is settled receipts and the fee applies to it directly. Nothing in this
-- product refunds a booking - `booking` has never held a REFUNDED row - so a
-- refunds column would be a permanent zero buying an invoice line nobody could
-- ever see.
--
-- If that changes, note that the fee base is the thing to revisit first: a
-- commission charged on money handed back to a customer bills the organiser for
-- a sale that did not happen. The right shape then is a new nullable column and
-- a widened totals CHECK, leaving already-issued invoices alone.
--
--
-- ONE PAYOUT PER EVENT, NOT PER PERIOD
-- ------------------------------------------------------------
-- The unit is the event, because that is the unit an organiser thinks in and
-- the only one the rest of the schema can total: booking.event_id is the FK
-- every revenue query in BookingRepository already groups by. A monthly
-- statement across several events would need a period table and a rule for
-- events that straddle the boundary, to answer a question nobody has asked.
-- ============================================================


-- ------------------------------------------------------------
-- Invoice numbers
-- ------------------------------------------------------------
-- Sequential, unlike booking_ref, and the contrast is the point.
-- BookingRefGenerator picks 50 random bits precisely so that holding one
-- ticket does not let you enumerate the others. An invoice has no such
-- exposure - it is readable only by the organiser it belongs to and by
-- admins - and accounting wants the opposite property: a gap in the run is a
-- question worth asking.
--
-- A sequence rather than max(invoice_no)+1 because two organisers clicking at
-- once would read the same maximum and collide on the UNIQUE below. nextval is
-- outside transaction control, so gaps appear when a request is rolled back;
-- that is the normal behaviour of every invoice sequence and is preferable to
-- two invoices numbered the same.
CREATE SEQUENCE payout_invoice_seq START 1;


CREATE TABLE payout_request (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- What is being settled. ON DELETE RESTRICT is implicit and wanted: an
    -- event with a payout against it is an event somebody was paid for, and
    -- deleting it would leave the invoice describing nothing. EventService
    -- already refuses to delete an event with sales, and this is the stronger
    -- form of the same rule.
    event_id        BIGINT NOT NULL REFERENCES event(id),

    -- Who gets paid. Denormalised from event.organizer_id rather than joined
    -- for every read: the organiser's own list filters on exactly this column,
    -- and an event's owner never changes (there is no endpoint that writes
    -- event.organizer_id after creation), so the copy cannot drift.
    organizer_id    BIGINT NOT NULL REFERENCES organizer_profile(id),

    invoice_no      TEXT NOT NULL UNIQUE,

    -- ------------------------------------------------------------
    -- The money, in USD cents like every other amount in this schema
    -- ------------------------------------------------------------
    -- Cents, not NUMERIC: booking.total_usd_cents is BIGINT and an invoice
    -- that totalled its lines in a different type would round differently
    -- from the rows it claims to summarise.
    --
    -- Gross is CONFIRMED receipts only - the same state PlatformStatsResponse
    -- and the organiser's revenue chart already treat as real income, so the
    -- figure on an invoice agrees with the dashboard that led the organiser to
    -- expect it. Expired holds and cancellations are money that never arrived.
    gross_usd_cents BIGINT NOT NULL CHECK (gross_usd_cents >= 0),

    -- Basis points, so a 2.5% rate is expressible without a decimal type.
    -- 0 is legal - a deployment that takes no commission should not have to
    -- pretend otherwise - and so is 10000, though that would be odd.
    fee_bps         INT NOT NULL CHECK (fee_bps BETWEEN 0 AND 10000),
    fee_usd_cents   BIGINT NOT NULL CHECK (fee_usd_cents >= 0),

    net_usd_cents   BIGINT NOT NULL CHECK (net_usd_cents >= 0),

    -- What the invoice is a summary OF. Both counted at request time, from the
    -- same bookings the gross came from, so the document is internally
    -- consistent even after later cancellations move the live numbers.
    tickets_sold    INT NOT NULL DEFAULT 0 CHECK (tickets_sold >= 0),
    bookings_count  INT NOT NULL DEFAULT 0 CHECK (bookings_count >= 0),

    -- The invoice has to add up. Without this a service bug produces a
    -- document whose own lines contradict its total, and nobody notices until
    -- an organiser does the arithmetic themselves. The two figures are
    -- computed by different queries, so this is a real check rather than a
    -- tautology.
    CONSTRAINT payout_request_totals_add_up CHECK (
        net_usd_cents = gross_usd_cents - fee_usd_cents
    ),

    -- ------------------------------------------------------------
    -- Where the money goes
    -- ------------------------------------------------------------
    -- Typed by the organiser on the request, not read from a stored profile.
    -- Bank details change, and an invoice should record the account that was
    -- actually used for THIS transfer rather than whatever the profile happens
    -- to say years later when somebody audits it.
    payout_method   TEXT NOT NULL
                        CHECK (payout_method IN ('ABA','ACLEDA','WING','CANADIA','OTHER')),
    account_name    TEXT NOT NULL,
    account_number  TEXT NOT NULL,

    -- The organiser's note to the admin. Optional, never queried.
    note            TEXT,

    -- ------------------------------------------------------------
    -- The decision, and the transfer
    -- ------------------------------------------------------------
    status          TEXT NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN ('REQUESTED','APPROVED','PAID')),

    -- Free text the admin may attach when recording the transfer, e.g.
    -- "sent via ABA app, wire fee waived". Always optional.
    admin_note      TEXT,
    reviewed_by     BIGINT REFERENCES app_user(id),   -- the admin, an app_user.id
    reviewed_at     TIMESTAMPTZ,

    -- What the admin types off the bank's confirmation screen. This is the one
    -- field that connects this row to money that actually moved, so PAID
    -- without it is a claim with no evidence behind it - see the CHECK below.
    paid_reference  TEXT,
    paid_at         TIMESTAMPTZ,

    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Same shape as organizer_application_review_consistent: a decided row
    -- names who decided and when, an undecided one names neither. Otherwise
    -- the "reviewed by" column renders blank for any row touched by something
    -- other than the review endpoint, and nobody can tell whether that means
    -- "nobody" or "a bug".
    CONSTRAINT payout_request_review_consistent CHECK (
        (status = 'REQUESTED' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR
        (status <> 'REQUESTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),

    -- PAID is a statement that money left the platform. Requiring both the
    -- timestamp and the reference makes the claim falsifiable: somebody can go
    -- to the bank and check. A PAID row with neither is indistinguishable from
    -- an admin who clicked the wrong button.
    CONSTRAINT payout_request_paid_consistent CHECK (
        (status = 'PAID'  AND paid_at IS NOT NULL
                          AND paid_reference IS NOT NULL
                          AND length(btrim(paid_reference)) > 0)
        OR
        (status <> 'PAID' AND paid_at IS NULL AND paid_reference IS NULL)
    )
);

COMMENT ON TABLE payout_request IS
    'An organiser asking to be settled for one finished event, and what the platform did about it. One row per event, ever. The money columns are a snapshot taken at request time, not a live view of bookings.';


-- ------------------------------------------------------------
-- One payout per event, ever
-- ------------------------------------------------------------
-- A plain UNIQUE, not the partial index this table carried while a refused
-- request could be re-submitted. With no refusal there is nothing to exclude,
-- and a partial index whose predicate is true for every row it can ever see is
-- a misleading way to spell UNIQUE.
--
-- PAID is covered by it too, which is the load-bearing part: an event is
-- settled once and for good, and letting a second request through after
-- payment is how an event gets paid out twice.
CREATE UNIQUE INDEX uq_payout_request_event
    ON payout_request (event_id);


-- ------------------------------------------------------------
-- The admin queue
-- ------------------------------------------------------------
-- Partial and sorted by wait time, like idx_organizer_application_pending.
-- Settled rows outnumber waiting ones permanently, and the queue only ever
-- asks for the waiting ones - both of them: REQUESTED is "nobody has looked",
-- APPROVED is "agreed and not yet sent", and the second is the one that goes
-- unnoticed without a screen showing it.
CREATE INDEX idx_payout_request_open
    ON payout_request (requested_at)
    WHERE status IN ('REQUESTED','APPROVED');

-- The organiser's own list: every status, newest first.
CREATE INDEX idx_payout_request_organizer
    ON payout_request (organizer_id, requested_at DESC);
