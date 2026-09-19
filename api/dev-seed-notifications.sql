-- ============================================================
-- Dev seed: an inbox for every account, whoever you are signed in as.
--
--   docker exec -i event-booking-postgres psql -U postgres \
--     -v ON_ERROR_STOP=1 -d event_booking < api/dev-seed-notifications.sql
--
-- Additive and re-runnable: it removes its own previous output first, matching
-- on the 'zz-notif-' dedupe_key prefix every row here carries. Notifications
-- written by the app - by a real booking, a real review decision - are left
-- alone, so running this never erases what you were actually testing.
--
-- ---------------------------------------------------------------------------
-- WHY THIS AND NOT dev-seed-extras.sql
--
-- That file seeds the inbox too, but it TRUNCATEs the table and writes rows
-- against the account ids dev-seed-all.sql's RESTART IDENTITY guarantees. On a
-- database that has been used - where you signed in with Google, were promoted
-- to organiser, made a booking - those ids belong to somebody else, so the
-- inbox fills up for accounts you are not using and stays empty for the one
-- you are.
--
-- This one carries no ids at all. It asks app_user who exists and what role
-- they hold, and writes each account the inbox that role would actually
-- accumulate. Sign in as anyone and the bell has something in it.
--
-- ---------------------------------------------------------------------------
-- WHAT IT WRITES
--
-- One row per (account, type), which is what the unique index on
-- (recipient_user_id, type, dedupe_key) allows and what makes the file
-- re-runnable without a guard on every insert.
--
-- params is the substitution map notificationText() renders against, and the
-- key names are the ones web/src/lib/i18n.js expects - titleEn/titleKm for
-- {title}, bookingRef for {ref}, message for {reason}, netUsdCents for
-- {amount}. A row with the wrong keys renders the literal placeholder, which
-- is the failure this seed is most useful for catching.
--
-- Real titles and refs are joined in wherever the account has them, so the
-- links go somewhere. Where an account has no bookings or events of its own
-- the row still renders - a plausible ref and a catalogue title - because an
-- inbox that is empty for half the accounts tests half the screen.
--
-- read_at is left NULL on the recent rows and set on the older ones: the badge
-- needs a number, and "mark all read" needs something to do.
--
-- DEV ONLY.
-- ============================================================

BEGIN;

DELETE FROM notification WHERE dedupe_key LIKE 'zz-notif-%';

-- ------------------------------------------------------------- customers ---
-- Everyone gets these, admins and organisers included: every account on this
-- platform can also buy a ticket, and the screenshot of an admin's bell with
-- a booking notification in it is the normal case, not an odd one.
INSERT INTO notification (recipient_user_id, type, params, link_url, dedupe_key, read_at, created_at)
SELECT u.id,
       t.type,
       jsonb_strip_nulls(jsonb_build_object(
           'bookingRef', COALESCE(b.booking_ref, 'KH-' || upper(substr(md5(u.id::text || t.type), 1, 9))),
           'titleEn',    COALESCE(e.title_en, 'Angkor Sunset Sessions'),
           'titleKm',    COALESCE(e.title_km, 'តន្ត្រីថ្ងៃលិចអង្គរ'),
           'message',    t.message
       )),
       CASE WHEN b.booking_ref IS NOT NULL THEN '/bookings/' || b.booking_ref END,
       'zz-notif-' || u.id || '-' || t.type,
       CASE WHEN t.hours >= 24 THEN now() - ((t.hours - 2) || ' hours')::interval END,
       now() - (t.hours || ' hours')::interval
FROM app_user u
CROSS JOIN (VALUES
    ('BOOKING_CONFIRMED',       NULL::text,                                              1),
    ('BOOKING_PAYMENT_FAILED',  NULL,                                                    5),
    ('BOOKING_EXPIRED',         NULL,                                                   30),
    ('BOOKING_CANCELLED',       NULL,                                                   74)
) AS t(type, message, hours)
-- The account's own most recent booking, when it has one, so the row links to
-- something real rather than a 404.
LEFT JOIN LATERAL (
    SELECT bk.booking_ref, bk.event_id
    FROM booking bk WHERE bk.user_id = u.id ORDER BY bk.id DESC LIMIT 1
) b ON true
LEFT JOIN event e ON e.id = b.event_id
WHERE u.is_disabled = false;

-- ------------------------------------------------------------ organisers ---
INSERT INTO notification (recipient_user_id, type, params, link_url, dedupe_key, read_at, created_at)
SELECT p.user_id,
       t.type,
       jsonb_strip_nulls(jsonb_build_object(
           'titleEn',     COALESCE(e.title_en, 'Riverside Jazz Sessions'),
           'titleKm',     COALESCE(e.title_km, 'តន្ត្រីហ្សាសមាត់ទន្លេ'),
           'orgNameEn',   p.org_name_en,
           'orgNameKm',   p.org_name_km,
           'bookingRef',  'KH-' || upper(substr(md5(p.user_id::text || t.type), 1, 9)),
           'message',     t.message,
           'netUsdCents', t.net_usd_cents,
           'invoiceNo',   CASE WHEN t.type LIKE 'PAYOUT%' THEN 'INV-2026-0' || (100 + p.id) END,
           'reference',   CASE WHEN t.type = 'PAYOUT_PAID' THEN 'ABA-TRF-9' || (1000 + p.id) END
       )),
       CASE
           WHEN t.type LIKE 'PAYOUT%'  THEN '/organizer/payouts'
           WHEN e.id IS NOT NULL       THEN '/organizer/events/' || e.id
           ELSE '/organizer/events'
       END,
       'zz-notif-' || p.user_id || '-' || t.type,
       CASE WHEN t.hours >= 24 THEN now() - ((t.hours - 3) || ' hours')::interval END,
       now() - (t.hours || ' hours')::interval
FROM organizer_profile p
CROSS JOIN (VALUES
    ('EVENT_TICKETS_SOLD',      NULL::text,                                                        NULL::int,  2),
    ('EVENT_CHANGES_REQUESTED', 'Please add a clearer seating map and confirm the gate opening time.', NULL,    7),
    ('PAYOUT_PAID',             NULL,                                                             184250,     20),
    ('EVENT_APPROVED',          NULL,                                                               NULL,     27),
    ('PAYOUT_APPROVED',         NULL,                                                              92000,     48),
    ('EVENT_REJECTED',          'Venue capacity does not match the licence on file.',                NULL,     96),
    ('EVENT_TAKEN_DOWN',        'Reported for a duplicate listing.',                                 NULL,    140),
    ('EVENT_RESTORED',          NULL,                                                               NULL,    150)
) AS t(type, message, net_usd_cents, hours)
-- One of the organiser's own events, so the link resolves and the title is
-- theirs rather than a stranger's.
LEFT JOIN LATERAL (
    SELECT ev.id, ev.title_en, ev.title_km
    FROM event ev WHERE ev.organizer_id = p.id ORDER BY ev.id DESC LIMIT 1
) e ON true;

-- ---------------------------------------------------------------- admins ---
-- Keyed to whatever is actually sitting in the review queue, so opening the
-- notification and opening the queue agree with each other.
INSERT INTO notification (recipient_user_id, type, params, link_url, dedupe_key, read_at, created_at)
SELECT u.id,
       t.type,
       jsonb_strip_nulls(jsonb_build_object(
           'titleEn',   COALESCE(e.title_en, 'Lunar Lantern Night'),
           'titleKm',   COALESCE(e.title_km, 'យប់គោមព្រះច័ន្ទ'),
           'orgNameEn', COALESCE(p.org_name_en, 'Angkor Live Events'),
           'orgNameKm', p.org_name_km
       )),
       t.link_url,
       'zz-notif-' || u.id || '-' || t.type,
       CASE WHEN t.hours >= 24 THEN now() - ((t.hours - 4) || ' hours')::interval END,
       now() - (t.hours || ' hours')::interval
FROM app_user u
CROSS JOIN (VALUES
    ('EVENT_SUBMITTED_FOR_REVIEW',      '/admin/events',     3),
    ('ORGANIZER_APPLICATION_SUBMITTED', '/admin/organizers', 26),
    ('PAYOUT_REQUESTED',                '/admin/payouts',    52)
) AS t(type, link_url, hours)
-- The oldest event still waiting, which is the one an admin would open first.
LEFT JOIN LATERAL (
    SELECT ev.id, ev.title_en, ev.title_km, ev.organizer_id
    FROM event ev WHERE ev.status = 'PENDING_REVIEW' ORDER BY ev.submitted_at NULLS LAST LIMIT 1
) e ON true
LEFT JOIN organizer_profile p ON p.id = e.organizer_id
WHERE u.role = 'PLATFORM_ADMIN' AND u.is_disabled = false;

COMMIT;

-- What every account's bell now shows.
SELECT u.id, u.display_name, u.role,
       count(*) FILTER (WHERE n.read_at IS NULL) AS unread,
       count(*)                                  AS total
FROM app_user u
JOIN notification n ON n.recipient_user_id = u.id
GROUP BY u.id, u.display_name, u.role
ORDER BY u.id;
