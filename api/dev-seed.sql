-- ============================================================
-- Dev seed: one active hold, ready to check out.
--
-- The catalog and inventory lanes have no endpoints yet, so there is no way to
-- create an event or a hold over HTTP. This script writes the rows those lanes
-- will eventually own, and stops exactly where the booking lane picks up: an
-- ACTIVE hold on a published, on-sale event.
--
-- NOT a Flyway migration, and deliberately not under db/migration - Flyway
-- would run it on every environment. Run it by hand:
--
--   docker compose up -d
--   psql "postgresql://postgres:postgres@localhost:55432/event_booking" -f api/dev-seed.sql
--
-- It prints the two values Swagger needs: X-User-Id and holdId. Then:
--
--   POST /api/bookings                     {"holdId":<id>,"buyerName":"Dev",
--                                           "buyerPhoneE164":"+85512345678"}
--   POST /api/bookings/{id}/payments       {"provider":"BAKONG_KHQR"}
--   GET  /api/payments/{id}                (what the pay screen polls)
--   POST /api/dev/payments/{id}/pay        (the customer pays)
--
-- Re-runnable: every unique column is randomised, so each run yields a fresh
-- event, user and hold rather than colliding with the last one.
-- ============================================================

BEGIN;

INSERT INTO province_ref (code, name_en, name_km)
VALUES ('12', 'Phnom Penh', 'ភ្នំពេញ')
ON CONFLICT (code) DO NOTHING;

WITH customer AS (
    INSERT INTO app_user (phone_e164, password_hash, display_name, role)
    VALUES ('+855' || to_char(floor(random() * 900000000 + 100000000), 'FM000000000'),
            'dev-seed-not-a-real-hash', 'Dev Customer', 'CUSTOMER')
    RETURNING id
),
organizer_user AS (
    INSERT INTO app_user (phone_e164, password_hash, display_name, role)
    VALUES ('+855' || to_char(floor(random() * 900000000 + 100000000), 'FM000000000'),
            'dev-seed-not-a-real-hash', 'Dev Organizer', 'ORGANIZER')
    RETURNING id
),
organizer AS (
    INSERT INTO organizer_profile (user_id, org_name_en, org_name_km)
    SELECT id, 'Dev Promotions', 'ដេវ ប្រូម៉ូសិន' FROM organizer_user
    RETURNING id
),
venue AS (
    INSERT INTO venue (organizer_id, name_en, name_km, province_code,
                       khan_district, sangkat_commune, street_address)
    SELECT id, 'Dev Arena', 'ដេវ អារ៉េណា', '12',
           'Chamkarmon', 'Tonle Bassac', 'Street 3'
    FROM organizer
    RETURNING id, organizer_id
),
-- ZONED rather than SEATED: a zone needs one row, a seat map needs a venue
-- layout expanded per event. Both go through the same checkout and the same
-- payment path, so the simpler one is enough to exercise it.
ev AS (
    INSERT INTO event (organizer_id, venue_id, inventory_mode, slug,
                       title_en, title_km, status,
                       starts_at, doors_open_at, sales_open_at, sales_close_at)
    SELECT v.organizer_id, v.id, 'ZONED',
           'dev-show-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text,
           'Dev Show', 'កម្មវិធីសាកល្បង', 'PUBLISHED',
           now() + interval '30 days',
           now() + interval '30 days' - interval '1 hour',
           now() - interval '1 day',
           now() + interval '29 days'
    FROM venue v
    RETURNING id
),
-- held_qty starts at 2 because the hold below reserves 2. Checkout moves that
-- pair from held_qty to sold_qty; it does not add to it.
zone AS (
    INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity, held_qty)
    SELECT id, 'GA Floor', 'តំបន់ GA', 2500, 500, 2 FROM ev
    RETURNING id, event_id
),
hold AS (
    INSERT INTO hold (event_id, user_id, status, expires_at)
    SELECT z.event_id, c.id, 'ACTIVE', now() + interval '30 minutes'
    FROM zone z, customer c
    RETURNING id, user_id
),
line AS (
    INSERT INTO hold_zone_line (hold_id, event_zone_id, qty)
    SELECT h.id, z.id, 2 FROM hold h, zone z
    RETURNING hold_id
)
SELECT h.user_id   AS "X-User-Id",
       h.id        AS "holdId",
       (SELECT count(*) FROM line) AS "zone lines"
FROM hold h;

COMMIT;
