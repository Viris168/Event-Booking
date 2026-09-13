-- ============================================================
-- Dev seed, part three: more customers, and the bookings that account for
-- every ticket the catalogue claims to have sold.
--
--   docker exec -i event-booking-postgres \
--     psql -U postgres -d event_booking < api/dev-seed-more.sql
--
-- Run AFTER dev-seed-all.sql. It is additive: it never truncates, and it can
-- be run twice without doubling anything (see the guard at the top).
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
--
-- dev-seed-all.sql writes event_zone.sold_qty directly, so the capacity bars
-- and revenue tiles look like a busy platform - roughly 3,200 tickets. It then
-- creates nine bookings. Those two numbers describe different worlds, and the
-- product reads both:
--
--   * sold_qty            -> capacity bars, "Revenue by event", the stat tiles
--   * the booking table   -> the monthly revenue chart, transactions, refunds
--
-- So the dashboard showed $125 of lifetime revenue beside a chart reading
-- $0.00 and "no confirmed bookings in the last 12 months", which is not a bug
-- in either screen - they are faithfully reporting two different fixtures.
--
-- This closes the gap from the booking side rather than by lowering sold_qty:
-- every ticket the zones claim is now backed by a real CONFIRMED booking, with
-- its hold, its line item, its tickets, its payment and its status history -
-- spread across the last eleven months so the chart has something to draw.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------ re-runnable ---
-- Everything below is tagged with a seed marker, so a second run clears its own
-- previous output instead of doubling the platform's revenue.
DELETE FROM booking_status_history WHERE booking_id IN (SELECT id FROM booking WHERE booking_ref LIKE 'KH-M%');
DELETE FROM ticket WHERE booking_item_id IN (
    SELECT bi.id FROM booking_item bi JOIN booking b ON b.id = bi.booking_id WHERE b.booking_ref LIKE 'KH-M%');
DELETE FROM payment_transaction WHERE booking_id IN (SELECT id FROM booking WHERE booking_ref LIKE 'KH-M%');
DELETE FROM booking_item WHERE booking_id IN (SELECT id FROM booking WHERE booking_ref LIKE 'KH-M%');
-- Bookings BEFORE holds. booking.hold_id references hold with no cascade, so
-- the other order fails the foreign key, aborts the transaction, and leaves
-- every statement after it silently skipped - which is exactly how this file
-- once produced 1,300 bookings and not one row of status history.
DELETE FROM booking WHERE booking_ref LIKE 'KH-M%';
DELETE FROM hold WHERE id NOT IN (SELECT hold_id FROM booking) AND status = 'CONSUMED'
   AND created_at > now() - interval '400 days'
   AND id NOT IN (SELECT hold_id FROM booking);

-- ----------------------------------------------------------- more people ---
-- Fourteen more customers, so the bookings below are spread across a crowd
-- rather than the same six names. Phones are the local 0xx spelling V25 widened
-- the CHECK for; every password is "password", the same BCrypt hash V19 uses.
INSERT INTO app_user (phone_e164, email, password_hash, display_name, role, is_disabled, provider)
VALUES
    ('012400111','sokun@example.com',   '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Sokun Chea',    'CUSTOMER', false,'LOCAL'),
    ('012400222','bopha@example.com',   '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Bopha Ken',     'CUSTOMER', false,'LOCAL'),
    ('012400333','veasna@example.com',  '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Veasna Sim',    'CUSTOMER', false,'LOCAL'),
    ('012400444','kanha@example.com',   '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Kanha Rin',     'CUSTOMER', false,'LOCAL'),
    ('012400555','phirun@example.com',  '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Phirun Chan',   'CUSTOMER', false,'LOCAL'),
    ('012400666','malis@example.com',   '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Malis Tep',     'CUSTOMER', false,'LOCAL'),
    ('012400777','arun@example.com',    '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Arun Sao',      'CUSTOMER', false,'LOCAL'),
    ('012400888','sothea@example.com',  '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Sothea Noun',   'CUSTOMER', false,'LOCAL'),
    ('012400999','rachana@example.com', '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Rachana Ly',    'CUSTOMER', false,'LOCAL'),
    ('012401000','chantha@example.com', '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Chantha Oum',   'CUSTOMER', false,'LOCAL'),
    ('012401111','davy@example.com',    '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Davy Heng',     'CUSTOMER', false,'LOCAL'),
    ('012401222','piseth@example.com',  '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Piseth Nov',    'CUSTOMER', false,'LOCAL'),
    ('012401333','sreypov@example.com', '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Sreypov Yim',   'CUSTOMER', false,'LOCAL'),
    ('012401444','borey@example.com',   '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K','Borey Hor',     'CUSTOMER', false,'LOCAL')
ON CONFLICT (phone_e164) DO NOTHING;

-- --------------------------------------------------- the missing bookings ---
DO $$
DECLARE
    buyers      BIGINT[];
    z           RECORD;
    already     INT;
    remaining   INT;
    qty         INT;
    buyer_id    BIGINT;
    buyer_name  TEXT;
    buyer_phone TEXT;
    buyer_email TEXT;
    hold_id     BIGINT;
    booking_id  BIGINT;
    item_id     BIGINT;
    made_at     TIMESTAMPTZ;
    line_total  BIGINT;
    made        INT := 0;
BEGIN
    SELECT array_agg(id) INTO buyers
      FROM app_user WHERE role = 'CUSTOMER' AND is_disabled = false;

    FOR z IN
        SELECT ez.id, ez.event_id, ez.price_usd_cents, ez.sold_qty
          FROM event_zone ez
         WHERE ez.sold_qty > 0
         ORDER BY ez.id
    LOOP
        -- What the existing seed bookings already account for in this zone, so
        -- the two sets add up to sold_qty rather than to twice it.
        SELECT COALESCE(SUM(bi.qty), 0) INTO already
          FROM booking_item bi
          JOIN booking b ON b.id = bi.booking_id
         WHERE bi.event_zone_id = z.id AND b.state = 'CONFIRMED';

        remaining := z.sold_qty - already;

        WHILE remaining > 0 LOOP
            -- One to four tickets, the way people actually buy them.
            qty := LEAST(remaining, 1 + floor(random() * 4)::int);
            remaining := remaining - qty;

            -- Scalars rather than a RECORD: a SELECT ... INTO record that
            -- matches nothing leaves every field NULL and raises nothing, so
            -- the first sign of trouble was a NOT NULL violation four
            -- statements later naming a column this block never sets directly.
            buyer_id := buyers[1 + floor(random() * array_length(buyers, 1))::int];
            SELECT display_name, phone_e164, email
              INTO STRICT buyer_name, buyer_phone, buyer_email
              FROM app_user WHERE id = buyer_id;

            -- Spread across the last eleven months. The revenue chart asks for
            -- twelve, and leaving the far edge clear means the first bar is a
            -- real month rather than an artefact of the cutoff.
            made_at := now()
                     - (floor(random() * 330)::int || ' days')::interval
                     - (floor(random() * 24)::int  || ' hours')::interval;

            line_total := qty::bigint * z.price_usd_cents;

            -- A booking is a CONSUMED hold that became a row. Creating the hold
            -- keeps that chain intact: booking.hold_id is NOT NULL and UNIQUE,
            -- and a seed that skipped it would describe a booking nothing ever
            -- reserved.
            INSERT INTO hold (event_id, user_id, status, expires_at, created_at, extended)
            VALUES (z.event_id, buyer_id, 'CONSUMED', made_at + interval '10 minutes', made_at, false)
            RETURNING id INTO hold_id;

            INSERT INTO booking (booking_ref, event_id, user_id, hold_id, state,
                                 buyer_name, buyer_phone_e164, buyer_email,
                                 subtotal_usd_cents, total_usd_cents,
                                 fx_rate_khr_per_usd, total_khr,
                                 created_at, state_changed_at)
            VALUES ('KH-M' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7)),
                    z.event_id, buyer_id, hold_id, 'CONFIRMED',
                    buyer_name, buyer_phone, buyer_email,
                    line_total, line_total,
                    4100.0000, round(line_total * 41.0),
                    made_at, made_at + interval '2 minutes')
            RETURNING id INTO booking_id;

            INSERT INTO booking_item (booking_id, event_zone_id, qty, unit_price_usd_cents)
            VALUES (booking_id, z.id, qty, z.price_usd_cents)
            RETURNING id INTO item_id;

            -- One ticket per admission unit, not per line: a zone line of three
            -- is three independently scannable tickets (unit_seq 1..3), which
            -- is the rule V1 section 10 exists to state.
            INSERT INTO ticket (booking_item_id, unit_seq, issued_at)
            SELECT item_id, g, made_at + interval '2 minutes'
              FROM generate_series(1, qty) g;

            INSERT INTO payment_transaction (booking_id, provider, provider_ref, idempotency_key,
                                             currency_charged, amount_usd_cents, amount_khr,
                                             status, expires_at, created_at, resolved_at)
            VALUES (booking_id,
                    CASE WHEN random() < 0.6 THEN 'BAKONG_KHQR' ELSE 'ABA_PAYWAY' END,
                    'seed-' || booking_id,
                    'seed-idem-' || booking_id,
                    'USD', line_total, round(line_total * 41.0),
                    'SUCCESS', made_at + interval '15 minutes', made_at,
                    made_at + interval '90 seconds');

            INSERT INTO booking_status_history (booking_id, from_state, to_state, changed_by_user_id, note, changed_at)
            VALUES (booking_id, NULL, 'PENDING_PAYMENT', buyer_id, NULL, made_at),
                   (booking_id, 'PENDING_PAYMENT', 'CONFIRMED', NULL, 'Payment settled', made_at + interval '90 seconds');

            made := made + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'created % bookings to account for the catalogue''s sold tickets', made;
END $$;

COMMIT;

\echo ''
\echo '--- sold_qty vs what the bookings actually account for ---'
SELECT
    (SELECT COALESCE(SUM(sold_qty), 0) FROM event_zone)                      AS zones_claim,
    (SELECT COALESCE(SUM(bi.qty), 0) FROM booking_item bi
       JOIN booking b ON b.id = bi.booking_id
      WHERE b.state = 'CONFIRMED' AND bi.event_zone_id IS NOT NULL)          AS bookings_account_for,
    (SELECT count(*) FROM booking)                                           AS bookings,
    (SELECT count(*) FROM ticket)                                            AS tickets,
    (SELECT count(*) FROM app_user WHERE role = 'CUSTOMER')                  AS customers;
