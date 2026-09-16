-- ============================================================
-- Dev seed, part five: payouts, and the sales they settle.
--
--   docker exec -i event-booking-postgres psql -U postgres \
--     -v ON_ERROR_STOP=1 -d event_booking < api/dev-seed-payouts.sql
--
-- Run AFTER dev-seed-all.sql and dev-seed-statuses.sql. Additive and
-- re-runnable: it removes its own previous output first, matching on the
-- 'zz-finished-' slugs part four created and the 'KH-PY' booking prefix this
-- file uses for nothing else.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- Both payout screens shipped with nothing to show. payout_request was empty
-- in every dev database, so the admin queue rendered its empty state, the
-- organiser's payouts tab rendered its empty state, and the invoice - the one
-- printable financial document in the product - could not be opened at all
-- because no row existed to open. Every one of those screens was therefore
-- being changed blind.
--
-- The eight finished events already in the database could not be paid out
-- either, because seven of them had sold nothing: a payout is a settlement of
-- real bookings, and an invoice whose gross came from nowhere would be a
-- worked example of the thing this file exists to prevent.
--
-- So this seeds the sales FIRST and derives every payout figure from them. The
-- gross on each invoice is the sum of that event's CONFIRMED bookings, the
-- ticket count is its issued tickets, and the fee is 10% of the gross - the
-- same three numbers PayoutServiceimpl would have computed had an organiser
-- clicked the button. Nothing here is a literal that could drift from the
-- bookings behind it.
--
-- ---------------------------------------------------------------------------
-- WHAT IT LEAVES YOU WITH
--
--   Admin  /admin/payouts    2 waiting, 1 approved and unpaid, 3 paid
--   Org 1  Mekong Live        1 paid, and TWO events still claimable
--   Org 2  Angkor Events      2 paid
--   Org 3  Coastline Ent.     1 waiting, 1 approved, 1 waiting
--
-- Two events are deliberately left unclaimed - "Chaktomuk Recital" and the
-- 178-booking "Monsoon Jazz: August" - so the organiser's own request flow has
-- something to act on. A seed that settled everything would demonstrate the
-- queue and hide the thing that fills it.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------ own output ---
-- Payouts first: they reference events, and the bookings below reference the
-- same rows a second time through booking_item.
DELETE FROM payout_request
 WHERE event_id IN (SELECT id FROM event WHERE slug LIKE 'zz-finished-%');

-- Then this file's bookings, innermost row first. No cascade is assumed
-- anywhere: ticket hangs off booking_item, which hangs off booking, which
-- holds the hold that has to outlive it by one statement.
DELETE FROM ticket t USING booking_item bi, booking b
 WHERE t.booking_item_id = bi.id AND bi.booking_id = b.id AND b.booking_ref LIKE 'KH-PY%';
DELETE FROM booking_item bi USING booking b
 WHERE bi.booking_id = b.id AND b.booking_ref LIKE 'KH-PY%';
DELETE FROM payment_transaction pt USING booking b
 WHERE pt.booking_id = b.id AND b.booking_ref LIKE 'KH-PY%';
DELETE FROM booking_status_history h USING booking b
 WHERE h.booking_id = b.id AND b.booking_ref LIKE 'KH-PY%';

CREATE TEMP TABLE reclaimed_holds ON COMMIT DROP AS
SELECT hold_id FROM booking WHERE booking_ref LIKE 'KH-PY%';

DELETE FROM booking WHERE booking_ref LIKE 'KH-PY%';
DELETE FROM hold WHERE id IN (SELECT hold_id FROM reclaimed_holds);

-- The inventory those bookings claimed goes back too, or a second run sells
-- the same seats twice and the capacity bars creep past 100%.
UPDATE event_zone SET sold_qty = 0
 WHERE event_id IN (SELECT id FROM event WHERE slug LIKE 'zz-finished-%');

-- ---------------------------------------------------------------- sales ---
DO $$
DECLARE
    target      RECORD;
    buyers      BIGINT[];
    zone        RECORD;
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
    starts      TIMESTAMPTZ;
BEGIN
    SELECT array_agg(id) INTO buyers
      FROM app_user WHERE role = 'CUSTOMER' AND is_disabled = false;

    -- How many admissions each finished event sold. Deliberately uneven: a
    -- payout queue where every invoice is the same size tells you nothing
    -- about whether the column sorts, wraps or rounds.
    FOR target IN
        SELECT * FROM (VALUES
            ('zz-finished-jazz',    96),
            ('zz-finished-run',    148),
            ('zz-finished-lantern', 41),
            ('zz-finished-comedy', 212),
            ('zz-finished-recital', 63),
            ('zz-finished-film',    27),
            ('zz-finished-pulled',  74)
        ) AS t(slug, admissions)
    LOOP
        SELECT ez.id, ez.event_id, ez.price_usd_cents, e.starts_at
          INTO zone
          FROM event_zone ez JOIN event e ON e.id = ez.event_id
         WHERE e.slug = target.slug;

        CONTINUE WHEN zone IS NULL;
        starts := zone.starts_at;
        remaining := target.admissions;

        WHILE remaining > 0 LOOP
            qty := LEAST(remaining, 1 + floor(random() * 4)::int);
            remaining := remaining - qty;

            buyer_id := buyers[1 + floor(random() * array_length(buyers, 1))::int];
            SELECT display_name, phone_e164, email
              INTO STRICT buyer_name, buyer_phone, buyer_email
              FROM app_user WHERE id = buyer_id;

            -- Sold in the month before the show, not after it. A booking dated
            -- later than the event it admits somebody to is the kind of thing
            -- that survives in a fixture for years and then breaks a report.
            made_at := starts
                     - (1 + floor(random() * 30)::int || ' days')::interval
                     - (floor(random() * 24)::int || ' hours')::interval;

            line_total := qty::bigint * zone.price_usd_cents;

            INSERT INTO hold (event_id, user_id, status, expires_at, created_at, extended)
            VALUES (zone.event_id, buyer_id, 'CONSUMED', made_at + interval '10 minutes', made_at, false)
            RETURNING id INTO hold_id;

            INSERT INTO booking (booking_ref, event_id, user_id, hold_id, state,
                                 buyer_name, buyer_phone_e164, buyer_email,
                                 subtotal_usd_cents, total_usd_cents,
                                 fx_rate_khr_per_usd, total_khr,
                                 created_at, state_changed_at)
            VALUES ('KH-PY' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
                    zone.event_id, buyer_id, hold_id, 'CONFIRMED',
                    buyer_name, buyer_phone, buyer_email,
                    line_total, line_total,
                    4100.0000, round(line_total * 41.0),
                    made_at, made_at + interval '2 minutes')
            RETURNING id INTO booking_id;

            INSERT INTO booking_item (booking_id, event_zone_id, qty, unit_price_usd_cents)
            VALUES (booking_id, zone.id, qty, zone.price_usd_cents)
            RETURNING id INTO item_id;

            -- One ticket per admission, not per booking - the same rule the
            -- rest of the seed follows, and what makes tickets_sold on the
            -- invoice mean admissions rather than transactions.
            INSERT INTO ticket (booking_item_id, unit_seq, issued_at)
            SELECT item_id, g, made_at + interval '2 minutes'
              FROM generate_series(1, qty) g;

            INSERT INTO payment_transaction (booking_id, provider, provider_ref, idempotency_key,
                                             currency_charged, amount_usd_cents, amount_khr,
                                             status, expires_at, created_at, resolved_at)
            VALUES (booking_id,
                    CASE WHEN random() < 0.6 THEN 'BAKONG_KHQR' ELSE 'ABA_PAYWAY' END,
                    'py-' || booking_id, 'py-idem-' || booking_id,
                    'USD', line_total, round(line_total * 41.0),
                    'SUCCESS', made_at + interval '15 minutes', made_at,
                    made_at + interval '90 seconds');

            INSERT INTO booking_status_history (booking_id, from_state, to_state, changed_by_user_id, note, changed_at)
            VALUES (booking_id, NULL, 'PENDING_PAYMENT', buyer_id, NULL, made_at),
                   (booking_id, 'PENDING_PAYMENT', 'CONFIRMED', NULL, 'Payment settled', made_at + interval '90 seconds');
        END LOOP;

        -- The zone's own counter, brought up to what the bookings just claimed.
        UPDATE event_zone ez
           SET sold_qty = (SELECT COALESCE(SUM(bi.qty), 0)
                             FROM booking_item bi JOIN booking b ON b.id = bi.booking_id
                            WHERE bi.event_zone_id = ez.id AND b.state = 'CONFIRMED')
         WHERE ez.id = zone.id;
    END LOOP;
END $$;

-- -------------------------------------------------------------- payouts ---
-- Every figure below is read back out of the bookings above rather than typed:
-- gross is the CONFIRMED total, tickets are the issued ones, the fee is 10% of
-- gross rounded the way PayoutServiceimpl rounds it, and net is the remainder.
-- Reviewed and paid timestamps hang off the event's own date, so the queue
-- reads as a sequence of events rather than as a batch created this morning.
INSERT INTO payout_request (event_id, organizer_id, invoice_no,
                            gross_usd_cents, fee_bps, fee_usd_cents, net_usd_cents,
                            tickets_sold, bookings_count,
                            payout_method, account_name, account_number, note,
                            status, admin_note, reviewed_by, reviewed_at,
                            paid_reference, paid_at, requested_at)
SELECT e.id,
       e.organizer_id,
       -- lpad, not format's %05s: that width pads with SPACES, which put
       -- "INV-2026-    2" in the invoice_no column and on the printed invoice.
       format('INV-%s-%s', to_char(now(), 'YYYY'),
              lpad(nextval('payout_invoice_seq')::text, 5, '0')),
       t.gross,
       1000,
       round(t.gross * 0.10),
       t.gross - round(t.gross * 0.10),
       t.tickets,
       t.bookings,
       p.method, p.account_name, p.account_number, p.note,
       p.status,
       p.admin_note,
       CASE WHEN p.status = 'REQUESTED' THEN NULL ELSE 1 END,
       CASE WHEN p.status = 'REQUESTED' THEN NULL ELSE e.starts_at + interval '3 days' END,
       CASE WHEN p.status = 'PAID' THEN p.paid_ref ELSE NULL END,
       CASE WHEN p.status = 'PAID' THEN e.starts_at + interval '5 days' END,
       e.starts_at + interval '1 day'
  FROM (VALUES
        -- slug,                 status,      method,   account name,        account no,     note, admin note, paid ref
        ('zz-finished-jazz',    'PAID',      'ABA',    'Mekong Live Co Ltd','000123456789', 'Riverside series settlement.', 'Transferred with the August batch.', 'ABA-TRF-88214'),
        ('zz-finished-run',     'APPROVED',  'WING',   'Coastline Ent.',    '085551234',    'Fun run, first edition.',      'Approved - pay on Friday.',          NULL),
        ('zz-finished-lantern', 'PAID',      'ACLEDA', 'Angkor Events Co.', '000999888777', NULL,                            NULL,                                 'ACL-9930712'),
        ('zz-finished-comedy',  'REQUESTED', 'ABA',    'Coastline Ent.',    '000555444333', 'Please pay to the same account as last time.', NULL, NULL),
        ('zz-finished-film',    'PAID',      'CANADIA','Angkor Events Co.', '000112233445', NULL,                            'Late - chased by the organiser.',    'CAN-5512098'),
        ('zz-finished-pulled',  'REQUESTED', 'OTHER',  'Coastline Ent.',    '012345678',    'Event was taken down after it finished; tickets were all honoured.', NULL, NULL)
       ) AS p(slug, status, method, account_name, account_number, note, admin_note, paid_ref)
  JOIN event e ON e.slug = p.slug
  JOIN LATERAL (
        SELECT COALESCE(SUM(b.total_usd_cents), 0)::bigint AS gross,
               COUNT(*)::int                               AS bookings,
               COALESCE((SELECT COUNT(*) FROM ticket tk
                           JOIN booking_item bi ON bi.id = tk.booking_item_id
                           JOIN booking b2 ON b2.id = bi.booking_id
                          WHERE b2.event_id = e.id AND b2.state = 'CONFIRMED'), 0)::int AS tickets
          FROM booking b
         WHERE b.event_id = e.id AND b.state = 'CONFIRMED'
       ) t ON true;

COMMIT;

\echo ''
\echo '--- payout queue ---'
SELECT pr.status,
       count(*)                                   AS rows,
       to_char(SUM(pr.net_usd_cents)/100.0, 'FM999,999.00') AS net_usd
  FROM payout_request pr
 GROUP BY pr.status
 ORDER BY pr.status;

\echo ''
\echo '--- every invoice, and whether it matches its own bookings ---'
SELECT pr.invoice_no,
       left(e.title_en, 26)                AS event,
       pr.status,
       pr.tickets_sold                     AS tickets,
       to_char(pr.gross_usd_cents/100.0, 'FM999,999.00') AS gross,
       to_char(pr.net_usd_cents/100.0,   'FM999,999.00') AS net,
       (pr.gross_usd_cents = (SELECT COALESCE(SUM(b.total_usd_cents),0)
                                FROM booking b
                               WHERE b.event_id = pr.event_id AND b.state='CONFIRMED')) AS gross_agrees
  FROM payout_request pr JOIN event e ON e.id = pr.event_id
 ORDER BY pr.requested_at DESC;

\echo ''
\echo '--- finished events still claimable (the organiser request flow) ---'
SELECT e.id, left(e.title_en, 30) AS event, e.organizer_id,
       to_char(COALESCE(SUM(b.total_usd_cents),0)/100.0, 'FM999,999.00') AS unclaimed_usd
  FROM event e LEFT JOIN booking b ON b.event_id = e.id AND b.state = 'CONFIRMED'
 WHERE e.starts_at < now()
   AND NOT EXISTS (SELECT 1 FROM payout_request pr WHERE pr.event_id = e.id)
 GROUP BY e.id, e.title_en, e.organizer_id
HAVING COALESCE(SUM(b.total_usd_cents),0) > 0
 ORDER BY 4 DESC;
