-- ============================================================
-- Dev seed, part two: the tables dev-seed-all.sql leaves empty.
--
--   docker exec -i event-booking-postgres \
--     psql -U postgres -d event_booking < api/dev-seed-extras.sql
--
-- Run it AFTER dev-seed-all.sql - every id below refers to a row that file
-- creates, and it is written against the ids that file's RESTART IDENTITY
-- guarantees.
--
-- These six tables are empty after the main seed for a reason that is right in
-- production and wrong on a laptop: nothing writes them except a user actually
-- doing something. A notification needs someone to be notified, a scan_log row
-- needs a phone at a door. So the screens that read them - the notification
-- inbox, the gate audit, a booking's own history - render as "nothing here" on
-- a fresh database, which is indistinguishable from being broken.
--
-- refresh_token is deliberately still absent. Its rows are live credentials
-- with real hashes behind them; the way to get one is to log in, and a seeded
-- fake would be a token that cannot refresh anything.
--
-- DEV ONLY. Re-runnable: it clears its own six tables first.
-- ============================================================

BEGIN;

TRUNCATE TABLE
    notification,
    scan_log,
    booking_status_history,
    hold_zone_line,
    payment_webhook_event,
    payments
RESTART IDENTITY;

-- --------------------------------------------------- booking_status_history
-- The audit trail behind each booking's timeline. Every row in `booking`
-- reached its current state somehow, and this is that path written down -
-- including the two-step ones, because a REFUNDED booking that appears to have
-- gone straight from PENDING_PAYMENT is a timeline that teaches the reader
-- nothing.
--
-- changed_by_user_id is null wherever the system moved it: an expiry is a job
-- noticing a clock, not a person clicking. Admin id 1 signs the refund, which
-- is the one transition here a human actually decided.
INSERT INTO booking_status_history (booking_id, from_state, to_state, changed_by_user_id, note, changed_at) VALUES
    (1, NULL,                   'PENDING_PAYMENT',       5,    NULL,                          '2026-09-13 08:59:01+00'),
    (1, 'PENDING_PAYMENT',      'AWAITING_CONFIRMATION', 5,    'KHQR issued',                 '2026-09-13 08:59:30+00'),
    (1, 'AWAITING_CONFIRMATION','CONFIRMED',             NULL, 'Bakong callback settled',     '2026-09-13 09:00:12+00'),

    (2, NULL,                   'PENDING_PAYMENT',       6,    NULL,                          '2026-09-13 08:59:01+00'),
    (2, 'PENDING_PAYMENT',      'AWAITING_CONFIRMATION', 6,    'PayWay checkout opened',      '2026-09-13 08:59:44+00'),

    (3, NULL,                   'PENDING_PAYMENT',       7,    NULL,                          '2026-09-09 07:02:00+00'),
    (3, 'PENDING_PAYMENT',      'AWAITING_CONFIRMATION', 7,    NULL,                          '2026-09-09 07:03:10+00'),
    (3, 'AWAITING_CONFIRMATION','CONFIRMED',             NULL, NULL,                          '2026-09-09 07:04:02+00'),
    (3, 'CONFIRMED',            'REFUND_REQUESTED',      7,    'Cannot attend - work trip',   '2026-09-12 02:30:00+00'),

    (4, NULL,                   'PENDING_PAYMENT',       8,    NULL,                          '2026-09-02 03:15:00+00'),
    (4, 'PENDING_PAYMENT',      'CONFIRMED',             NULL, NULL,                          '2026-09-02 03:16:40+00'),
    (4, 'CONFIRMED',            'REFUND_REQUESTED',      8,    'Double booked by mistake',    '2026-09-06 10:05:00+00'),
    (4, 'REFUND_REQUESTED',     'REFUNDED',              1,    'Refunded in full via Bakong', '2026-09-08 09:20:00+00'),

    (5, NULL,                   'PENDING_PAYMENT',       9,    NULL,                          '2026-09-11 13:41:00+00'),
    (5, 'PENDING_PAYMENT',      'EXPIRED',               NULL, 'Hold expired unpaid',         '2026-09-11 14:01:00+00'),

    (6, NULL,                   'PENDING_PAYMENT',       7,    NULL,                          '2026-09-10 04:26:00+00'),
    (6, 'PENDING_PAYMENT',      'CANCELLED',             7,    'Cancelled from the cart',     '2026-09-10 04:58:00+00'),

    (7, NULL,                   'PENDING_PAYMENT',       8,    NULL,                          '2026-09-12 11:12:00+00'),
    (7, 'PENDING_PAYMENT',      'PAYMENT_FAILED',        NULL, 'PayWay declined the card',    '2026-09-12 11:14:20+00'),

    (8, NULL,                   'PENDING_PAYMENT',       9,    NULL,                          '2026-08-04 02:33:00+00'),
    (8, 'PENDING_PAYMENT',      'CONFIRMED',             NULL, NULL,                          '2026-08-04 02:35:00+00'),

    (9, NULL,                   'PENDING_PAYMENT',       6,    NULL,                          '2026-09-13 08:59:01+00');

-- --------------------------------------------------------------- scan_log ---
-- The gate's audit trail for event 16, the one event in the seed that has
-- already happened and has two checked-in tickets to show for it.
--
-- The refusals are the point of the table. A wall of VALID rows tells an
-- organiser nothing they cannot read off the ticket counts; what only this
-- table can answer is how many forged codes were presented, and whether the
-- same one was tried at more than one door - which is why NOT_FOUND appears
-- twice with the same fingerprint.
--
-- payload_fingerprint is a SHA-256 of the scanned string and never the string
-- itself: a scanned payload is a bearer credential, and logging it verbatim
-- would turn this table into a pile of working tickets. The digests below are
-- of throwaway text, so they decode to nothing.
INSERT INTO scan_log (event_id, operator_user_id, action, outcome, ticket_id, booking_id, payload_fingerprint, note, at) VALUES
    (16, 1, 'SCAN', 'VALID',          5,    8,    encode(sha256('dev-seed-ticket-5'::bytea), 'hex'), NULL,                       '2026-08-20 11:32:00+00'),
    (16, 1, 'SCAN', 'VALID',          6,    8,    encode(sha256('dev-seed-ticket-6'::bytea), 'hex'), NULL,                       '2026-08-20 11:32:40+00'),
    (16, 1, 'SCAN', 'ALREADY_USED',   5,    8,    encode(sha256('dev-seed-ticket-5'::bytea), 'hex'), 'Presented twice at gate A', '2026-08-20 11:41:15+00'),
    -- No ticket row, by design: the code matched nothing. This is the case the
    -- table exists for, and it is invisible anywhere else.
    (16, 1, 'SCAN', 'NOT_FOUND',      NULL, NULL, encode(sha256('dev-seed-forged-a'::bytea), 'hex'), 'Unknown code, gate A',      '2026-08-20 11:48:02+00'),
    (16, 1, 'SCAN', 'NOT_FOUND',      NULL, NULL, encode(sha256('dev-seed-forged-a'::bytea), 'hex'), 'Same code again, gate B',   '2026-08-20 11:55:37+00'),
    (16, 1, 'UNDO', 'UNDONE',         6,    8,    encode(sha256('dev-seed-ticket-6'::bytea), 'hex'), 'Scanned the wrong person',  '2026-08-20 12:04:10+00'),
    (16, 1, 'SCAN', 'VALID',          6,    8,    encode(sha256('dev-seed-ticket-6'::bytea), 'hex'), 'Re-admitted after undo',    '2026-08-20 12:05:02+00');

-- --------------------------------------------------------- hold_zone_line ---
-- Zone quantities on the two holds that never became bookings, so the cart
-- lane has something to look at that a booking_item cannot show.
--
-- Hold 5 EXPIRED and hold 6 was RELEASED; neither has a booking, which is
-- exactly why their contents live here and nowhere else. The zones are the
-- ones belonging to each hold's own event - a line pointing at another event's
-- zone is what CrossEventReferenceException exists to refuse.
INSERT INTO hold_zone_line (hold_id, event_zone_id, qty) VALUES
    (5, 13, 2),
    (5, 15, 1),
    (6, 17, 3);

-- --------------------------------------------- payment_webhook_event -------
-- What the providers sent back, one row per callback we acted on.
--
-- The unprocessed row is deliberate: processed_at IS NULL is how a callback
-- that arrived and has not been reconciled looks, and with every row processed
-- there is nothing to test the reconciliation view against.
INSERT INTO payment_webhook_event (provider, provider_event_id, payment_transaction_id, payload, received_at, processed_at) VALUES
    ('BAKONG_KHQR', 'evt-seed-0001', 1,
     '{"status":"SUCCESS","md5":"md5-seed-01","amount":0.10,"currency":"USD"}'::jsonb,
     '2026-09-13 09:00:10+00', '2026-09-13 09:00:12+00'),
    ('BAKONG_KHQR', 'evt-seed-0003', 3,
     '{"status":"SUCCESS","md5":"md5-seed-03","amount":0.10,"currency":"USD"}'::jsonb,
     '2026-09-09 07:04:00+00', '2026-09-09 07:04:02+00'),
    ('BAKONG_KHQR', 'evt-seed-0004', 4,
     '{"status":"SUCCESS","md5":"md5-seed-04","amount":0.10,"currency":"USD"}'::jsonb,
     '2026-09-02 03:16:38+00', '2026-09-02 03:16:40+00'),
    ('ABA_PAYWAY',  'evt-seed-0007', 7,
     '{"status":"FAILED","tran_id":"md5-seed-07","reason":"DECLINED"}'::jsonb,
     '2026-09-12 11:14:18+00', '2026-09-12 11:14:20+00'),
    ('ABA_PAYWAY',  'evt-seed-0002', 2,
     '{"status":"PENDING","tran_id":"md5-seed-02"}'::jsonb,
     '2026-09-13 08:59:50+00', NULL);

-- ---------------------------------------------------------------- payments --
-- ABA PayWay's checkout-form staging table: what was POSTed to the gateway,
-- keyed by the tran_id it was sent under. It hangs off no foreign key, which is
-- why it survives independently of payment_transaction - the tran_id is the
-- only thing tying the two together.
INSERT INTO payments (tranid, created_at, amount, currency, email, firstname, lastname, phone,
                      payment_status, payment_option, req_time, merchantid,
                      continue_successurl, cancelurl, returnurl) VALUES
    ('md5-seed-02', '2026-09-13 08:59:44+00', 0.10, 'USD', 'sreymom@example.com', 'Srey', 'Mom',  '088554477',
     'PENDING', 'abapay', '20260913085944', 'dev_merchant',
     'http://localhost:5173/bookings/2', 'http://localhost:5173/bookings/2', 'http://localhost:8080/api/v1/payments/payway/callback'),
    ('md5-seed-07', '2026-09-12 11:12:40+00', 0.10, 'USD', 'nita@example.com',    'Nita', 'Chhun', '092667788',
     'FAILED',  'cards',  '20260912111240', 'dev_merchant',
     'http://localhost:5173/bookings/7', 'http://localhost:5173/bookings/7', 'http://localhost:8080/api/v1/payments/payway/callback');

-- ------------------------------------------------------------ notification --
-- The inbox, for all three audiences at once, because each renders differently
-- and a seed that only fills one leaves two screens untestable.
--
-- read_at NULL is an unread row and drives the navbar's dot, so most are left
-- unread on purpose - a seed where everything is read shows an empty badge and
-- makes "mark all read" do nothing visible.
--
-- params is the substitution map notificationText() renders against; the key
-- names are the ones web/src/lib/i18n.js expects ({title}, {ref}, {org},
-- {reason}), so a row with the wrong keys renders the literal placeholder.
--
-- dedupe_key is UNIQUE per (recipient, type) and is what stops the same
-- occurrence being written twice; the values here mirror what the listener
-- generates - a review id where there is one, event:transition where there is
-- not.
INSERT INTO notification (recipient_user_id, type, params, link_url, dedupe_key, read_at, created_at) VALUES
    -- Customers
    (5, 'BOOKING_CONFIRMED',
     '{"ref":"KH-7QF2M8ZP","titleEn":"Bassac Riverside Live","titleKm":"បាសាក់រីវឺសាយ ឡាយ"}'::jsonb,
     '/bookings/1', 'booking:1:CONFIRMED', NULL, '2026-09-13 09:00:12+00'),
    (7, 'BOOKING_CONFIRMED',
     '{"ref":"KH-5RT8WQ2N","titleEn":"Bassac Riverside Live","titleKm":"បាសាក់រីវឺសាយ ឡាយ"}'::jsonb,
     '/bookings/3', 'booking:3:CONFIRMED', '2026-09-09 08:00:00+00', '2026-09-09 07:04:02+00'),
    (8, 'BOOKING_REFUNDED',
     '{"ref":"KH-9BN4LC6V","titleEn":"Sbek Thom Shadow Play","titleKm":"ស្បែកធំ"}'::jsonb,
     '/bookings/4', 'booking:4:REFUNDED', NULL, '2026-09-08 09:20:00+00'),
    (9, 'BOOKING_EXPIRED',
     '{"ref":"KH-2XG7HP3K","titleEn":"Mekong DevFest 2026","titleKm":"មេគង្គ ដេវហ្វេស្ត ២០២៦"}'::jsonb,
     '/bookings/5', 'booking:5:EXPIRED', NULL, '2026-09-11 14:01:00+00'),
    (8, 'BOOKING_PAYMENT_FAILED',
     '{"ref":"KH-4KQ2VS9J","titleEn":"PP Esports Finals","titleKm":"ភ្នំពេញ អ៊ីស្ព័រ ហ្វាយណល"}'::jsonb,
     '/bookings/7', 'booking:7:PAYMENT_FAILED', NULL, '2026-09-12 11:14:20+00'),
    (7, 'REFUND_APPROVED',
     '{"ref":"KH-5RT8WQ2N","titleEn":"Bassac Riverside Live","titleKm":"បាសាក់រីវឺសាយ ឡាយ"}'::jsonb,
     '/bookings/3', 'refund:3:APPROVED', NULL, '2026-09-12 03:00:00+00'),

    -- Organisers
    (2, 'EVENT_TICKETS_SOLD',
     '{"ref":"KH-7QF2M8ZP","titleEn":"Bassac Riverside Live","titleKm":"បាសាក់រីវឺសាយ ឡាយ"}'::jsonb,
     '/organizer/events/1/sales', 'booking:1:SOLD', NULL, '2026-09-13 09:00:15+00'),
    (2, 'EVENT_APPROVED',
     '{"titleEn":"Bassac Riverside Live","titleKm":"បាសាក់រីវឺសាយ ឡាយ","message":null}'::jsonb,
     '/organizer/events/1/edit', 'review:1', '2026-09-05 01:00:00+00', '2026-09-04 06:12:00+00'),
    (3, 'EVENT_CHANGES_REQUESTED',
     '{"titleEn":"Angkor Dawn Ceremony","titleKm":"ពិធីអរុណរះអង្គរ","message":"The sales window closes after the event starts."}'::jsonb,
     '/organizer/events/15/edit', 'review:4', NULL, '2026-09-07 03:45:00+00'),
    (4, 'EVENT_REJECTED',
     '{"titleEn":"Coastline Rave","titleKm":"ឆ្នេរ រេវ","message":"No venue permit attached."}'::jsonb,
     '/organizer/events/17/edit', 'review:6', NULL, '2026-09-08 08:20:00+00'),
    (2, 'EVENT_TAKEN_DOWN',
     '{"titleEn":"Monsoon Jazz August","titleKm":"ម៉ុនស៊ូន ជាហ្ស៍ សីហា","message":null}'::jsonb,
     '/organizer/events/16/edit', '16:TAKE_DOWN:1756000000000', NULL, '2026-08-24 05:30:00+00'),
    -- The other half of the pair above: RESTORE is the undo for TAKE_DOWN, and
    -- both are keyed per occurrence now that an event can be pulled and put
    -- back more than once.
    (2, 'EVENT_RESTORED',
     '{"titleEn":"Monsoon Jazz August","titleKm":"ម៉ុនស៊ូន ជាហ្ស៍ សីហា","message":null}'::jsonb,
     '/organizer/events/16/edit', '16:RESTORE:1756100000000', NULL, '2026-08-25 02:10:00+00'),
    (3, 'ORGANIZER_APPLICATION_APPROVED',
     '{"orgNameEn":"Angkor Heritage Events","orgNameKm":"ព្រឹត្តិការណ៍បេតិកភណ្ឌអង្គរ"}'::jsonb,
     '/organizer', 'application:2:APPROVED', '2026-08-30 02:00:00+00', '2026-08-29 09:15:00+00'),

    -- Platform admin
    (1, 'EVENT_SUBMITTED_FOR_REVIEW',
     '{"titleEn":"Kep Comedy Cellar","titleKm":"ខេប កំប្លែង","eventId":6}'::jsonb,
     '/admin/review', 'review:7', NULL, '2026-09-12 07:40:00+00'),
    (1, 'ORGANIZER_APPLICATION_SUBMITTED',
     '{"orgNameEn":"Battambang Arts Collective","orgNameKm":"សមាគមសិល្បៈបាត់ដំបង"}'::jsonb,
     '/admin/applications', '1', NULL, '2026-09-13 02:05:00+00'),
    (1, 'REFUND_REQUESTED',
     '{"ref":"KH-5RT8WQ2N","titleEn":"Bassac Riverside Live","titleKm":"បាសាក់រីវឺសាយ ឡាយ"}'::jsonb,
     '/admin/payments', 'refund:3:REQUESTED', NULL, '2026-09-12 02:30:00+00');

COMMIT;

-- ------------------------------------------------------------------ report --
\echo ''
\echo '--- rows now in the previously-empty tables ---'
SELECT 'booking_status_history' AS table, count(*) FROM booking_status_history
UNION ALL SELECT 'scan_log',              count(*) FROM scan_log
UNION ALL SELECT 'hold_zone_line',        count(*) FROM hold_zone_line
UNION ALL SELECT 'payment_webhook_event', count(*) FROM payment_webhook_event
UNION ALL SELECT 'payments',              count(*) FROM payments
UNION ALL SELECT 'notification',          count(*) FROM notification
ORDER BY 1;
