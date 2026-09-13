-- ============================================================
-- Dev seed: wipe the database and rebuild it in one pass.
--
-- Replaces the three-script dance (dev-seed.sql, dev-seed-catalog.sql,
-- dev-seed-images.sql), each of which added to whatever was already there and
-- guarded every insert on a natural key so it would not collide with the last
-- run. That made them additive but never authoritative: after a few runs the
-- catalogue was a sediment of every experiment anyone had tried. This one
-- starts by removing everything, so what you get is exactly what is written
-- below and nothing else.
--
--   docker exec -i event-booking-postgres \
--     psql -U postgres -d event_booking < api/dev-seed-all.sql
--
-- DESTRUCTIVE. Every account, booking, ticket and payment on the local
-- database is deleted, including any you made through the UI. province_ref and
-- flyway_schema_history are the only tables left alone - the first is
-- reference data owned by V17, the second is Flyway's own bookkeeping and
-- truncating it would make Flyway try to replay the whole schema on next boot.
--
-- Phone numbers are written in the local 0xx format rather than +855, which is
-- how people in Cambodia actually give their number out. V24 widened the CHECK
-- on both phone columns to accept either spelling; if you run this against a
-- database that has not had V24 applied yet, the statements are repeated
-- inline below so the seed does not depend on the API having booted first.
--
-- Every password is "password" (BCrypt, cost 10, the same hash V19 and
-- DatabaseSeeder use). Fine on a laptop, and the reason this file must never
-- run anywhere else.
--
-- Note on DatabaseSeeder: it is @Profile("dev") and skips itself when
-- venue_repository.count() > 0. This seed inserts venues, so a dev-profile API
-- starting up afterwards will leave the catalogue alone. Wiping WITHOUT
-- reseeding, then booting with the dev profile, gets you its 6 venues and 4
-- events instead.
-- ============================================================

-- ---------------------------------------------------------- phone format ---
-- Same statements as V24, repeated so this file works on a database Flyway has
-- not caught up with. Both are guarded, so running them twice is harmless.
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_phone_e164_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_phone_e164_check
    CHECK (phone_e164 ~ '^(\+855|0)[0-9]{8,9}$');

ALTER TABLE booking DROP CONSTRAINT IF EXISTS booking_buyer_phone_e164_check;
ALTER TABLE booking ADD CONSTRAINT booking_buyer_phone_e164_check
    CHECK (buyer_phone_e164 ~ '^(\+855|0)[0-9]{8,9}$');

BEGIN;

-- ------------------------------------------------------------------ wipe ---
-- One TRUNCATE, not twenty-two DELETEs. CASCADE settles the foreign-key order
-- for us and RESTART IDENTITY puts every sequence back to 1, so the ids below
-- are the ids you get - which is what lets this file hardcode them.
TRUNCATE TABLE
    app_user,
    booking,
    booking_item,
    booking_status_history,
    event,
    event_review,
    event_seat,
    event_zone,
    hold,
    hold_zone_line,
    notification,
    organizer_application,
    organizer_profile,
    payment_transaction,
    payment_webhook_event,
    payments,
    refresh_token,
    scan_log,
    seat_class,
    ticket,
    venue,
    venue_seat
RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------- users ---
-- Ids are explicit because organizer_profile, venue and event all reference
-- them and a seed that has to look its own rows back up by phone number is
-- harder to read than one that just says 2.
--
-- Rithy Long is seeded disabled on purpose: the admin users screen has a
-- re-enable action, and with every row enabled there is nothing to test it on.
INSERT INTO app_user (id, phone_e164, email, password_hash, display_name, role, is_disabled, provider)
OVERRIDING SYSTEM VALUE
VALUES
    ( 1, '012345678', 'admin@eventbooking.kh',  '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'THA Winner',   'PLATFORM_ADMIN', false, 'LOCAL'),
    ( 2, '012777888', 'mekong@live.kh',         '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Sokha Meas',   'ORGANIZER',      false, 'LOCAL'),
    ( 3, '015889900', 'angkor@events.kh',       '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Sophea Nou',   'ORGANIZER',      false, 'LOCAL'),
    ( 4, '017443322', 'coastline@events.kh',    '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Vichea Lim',   'ORGANIZER',      false, 'LOCAL'),
    ( 5, '096112233', 'dara@example.com',       '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Dara Sok',     'CUSTOMER',       false, 'LOCAL'),
    ( 6, '088554477', 'sreymom@example.com',    '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Srey Mom',     'CUSTOMER',       false, 'LOCAL'),
    ( 7, '078220011', 'chenda@example.com',     '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Chenda Pich',  'CUSTOMER',       false, 'LOCAL'),
    ( 8, '092667788', 'nita@example.com',       '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Nita Chhun',   'CUSTOMER',       false, 'LOCAL'),
    ( 9, '070998877', 'ratana@example.com',     '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Ratana Kim',   'CUSTOMER',       false, 'LOCAL'),
    (10, '086773311', 'rithy@example.com',      '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K', 'Rithy Long',   'CUSTOMER',       true,  'LOCAL');

-- ------------------------------------------------------ organiser profiles --
-- One per ORGANIZER user. Ids 1..3 map to app_user 2..4, and every venue and
-- event below references THESE ids, not the user ids - a distinction worth
-- keeping straight, since event.organizer_id points at organizer_profile(id).
INSERT INTO organizer_profile (id, user_id, org_name_en, org_name_km, telegram_chat_id)
OVERRIDING SYSTEM VALUE
VALUES
    (1, 2, 'Mekong Live Productions',   'ផលិតកម្មមេគង្គឡាយវ៍',   '-1001234567'),
    (2, 3, 'Angkor Events Co.',         'អង្គរ អ៊ីវេន',            NULL),
    (3, 4, 'Coastline Entertainment',   'ខូសឡាញ អេនធើថេនមិន',    NULL);

-- ---------------------------------------------------------------- venues ---
-- Spread across five provinces so the province filter has more than one
-- answer, and split between the three organisers so no dashboard is empty.
INSERT INTO venue (id, organizer_id, name_en, name_km, province_code, khan_district, sangkat_commune, street_address, lat, lng, is_disabled)
OVERRIDING SYSTEM VALUE
VALUES
    (1, 1, 'Koh Pich Convention Hall',     'សាលសន្និបាតកោះពេជ្រ',           '12', 'Chamkar Mon',        'Tonle Bassac',  'Koh Pich Street',       11.548900, 104.938600, false),
    (2, 2, 'Siem Reap Riverside Pavilion', 'សាលមាត់ទន្លេសៀមរាប',            '17', 'Siem Reap',          'Svay Dangkum',  'Achar Sva Street',      13.362200, 103.859700, false),
    (3, 3, 'Independence Beach Arena',     'កីឡដ្ឋានឆ្នេរឯករាជ្យ',           '18', 'Preah Sihanouk',     'Buon',          'Independence Beach Rd', 10.609300, 103.505200, false),
    (4, 2, 'Battambang Heritage Theatre',  'រោងមហោស្រពបេតិកភណ្ឌបាត់ដំបង',  '2',  'Battambang',         'Svay Por',      'Street 3',              13.102300, 103.199400, false),
    (5, 3, 'Kep Crab Market Lawn',         'ព្រៃស្មៅផ្សារក្ដាមកែប',          '23', 'Damnak Chang''aeur', 'Prey Thom',     'Crab Market Road',      10.483100, 104.316700, false);

-- ---------------------------------------------------------------- events ---
-- All ZONED. A zoned event's entire inventory is a few event_zone rows, while
-- a seated one needs venue_seat and event_seat grids to go with it, and the
-- storefront, filters and checkout exercise the same paths either way.
--
-- Eight are PUBLISHED so the catalogue has something to show. The last two are
-- deliberately not: one sits in PENDING_REVIEW so the admin review queue is
-- not empty on a fresh database, and one in DRAFT so the organiser dashboard
-- has an editable row. category is lowercase to match the frontend's
-- CATEGORY_ICON keys, and cover is zero-based over 0..8.
INSERT INTO event (id, organizer_id, venue_id, inventory_mode, slug, title_en, title_km, description_en, description_km, status, category, cover, starts_at, doors_open_at, sales_open_at, sales_close_at, submitted_at, cloudinary_image_id, cloudinary_banner_id)
OVERRIDING SYSTEM VALUE
VALUES
    ( 1, 1, 1, 'ZONED', 'bassac-jazz-night',     'Bassac Jazz Night',           'យប់ចាសបាសាក់',
      'A seven-piece Khmer jazz ensemble playing two sets, with support from the Bassac Horns.',
      'វង់ភ្លេងចាសខ្មែរ ៧ នាក់ លេងពីរវគ្គ។',
      'PUBLISHED', 'music', 6, '2026-10-03 19:00+07', '2026-10-03 18:00+07', '2026-08-15 09:00+07', '2026-10-03 17:00+07', NULL,
      'https://picsum.photos/seed/bassac-jazz-night/800/450', 'https://picsum.photos/seed/bassac-jazz-night-wide/1600/600'),

    ( 2, 2, 2, 'ZONED', 'angkor-lantern-festival', 'Angkor Lantern Festival',   'មហោស្រពគោមអង្គរ',
      'A lantern release on the river, followed by a night market and two live stages until midnight.',
      'ការលែងគោមលើទន្លេ ផ្សារយប់ និងឆាកតន្ត្រីពីរ។',
      'PUBLISHED', 'festival', 2, '2026-10-17 18:30+07', '2026-10-17 17:30+07', '2026-08-15 09:00+07', '2026-10-17 16:30+07', NULL,
      NULL, NULL),

    ( 3, 3, 3, 'ZONED', 'coastal-half-marathon', 'Coastal Half Marathon',       'ការរត់ពាក់កណ្តាលម៉ារ៉ាតុងឆ្នេរ',
      'Twenty-one kilometres along the coast road, starting before sunrise and finishing at the arena.',
      'ចម្ងាយ ២១ គីឡូម៉ែត្រតាមផ្លូវឆ្នេរ ចាប់ផ្ដើមមុនថ្ងៃរះ។',
      'PUBLISHED', 'sport', 7, '2026-11-08 05:30+07', '2026-11-08 04:30+07', '2026-08-15 09:00+07', '2026-11-07 20:00+07', NULL,
      'https://picsum.photos/seed/coastal-half-marathon/800/450', NULL),

    ( 4, 2, 4, 'ZONED', 'sbek-thom-shadow-play', 'Sbek Thom Shadow Play',       'ស្បែកធំ',
      'Large leather shadow puppetry with a pin peat ensemble, performed over three consecutive nights.',
      'ស្បែកធំ ជាមួយវង់ភ្លេងពិណពាទ្យ សម្តែងបីយប់ជាប់គ្នា។',
      'PUBLISHED', 'culture', 5, '2026-10-24 19:30+07', '2026-10-24 18:45+07', '2026-08-15 09:00+07', '2026-10-24 17:30+07', NULL,
      NULL, NULL),

    ( 5, 1, 1, 'ZONED', 'mekong-devfest-2026',  'Mekong DevFest 2026',          'មេគង្គដេវហ្វេស ២០២៦',
      'Two days of engineering talks on payments, offline-first apps and Khmer text handling.',
      'ពីរថ្ងៃនៃការពិភាក្សាផ្នែកវិស្វកម្មកម្មវិធី។',
      'PUBLISHED', 'conference', 3, '2026-11-21 08:30+07', '2026-11-21 08:00+07', '2026-08-15 09:00+07', '2026-11-20 23:00+07', NULL,
      'https://picsum.photos/seed/mekong-devfest-2026/800/450', 'https://picsum.photos/seed/mekong-devfest-2026-wide/1600/600'),

    ( 6, 3, 5, 'ZONED', 'kep-comedy-cellar',    'Kep Comedy Cellar',            'យប់កំប្លែងកែប',
      'Five comedians alternating Khmer and English sets in a room that holds under a hundred people.',
      'អ្នកកំប្លែងប្រាំនាក់ លេងជាភាសាខ្មែរ និងអង់គ្លេស។',
      'PUBLISHED', 'comedy', 0, '2026-10-10 20:00+07', '2026-10-10 19:15+07', '2026-08-15 09:00+07', '2026-10-10 18:00+07', NULL,
      NULL, NULL),

    ( 7, 2, 2, 'ZONED', 'pchum-ben-classical',  'Pchum Ben Classical Concert',  'ការប្រគំតន្ត្រីបុណ្យភ្ជុំបិណ្ឌ',
      'Court repertoire played on original instruments, programmed around the Pchum Ben holiday.',
      'តន្ត្រីបុរាណលេងដោយឧបករណ៍ដើម នៅបុណ្យភ្ជុំបិណ្ឌ។',
      'PUBLISHED', 'culture', 4, '2026-09-30 18:00+07', '2026-09-30 17:15+07', '2026-08-15 09:00+07', '2026-09-30 16:00+07', NULL,
      'https://picsum.photos/seed/pchum-ben-classical/800/450', NULL),

    ( 8, 1, 1, 'ZONED', 'pp-esports-finals',    'Phnom Penh Esports Finals',    'វគ្គផ្ដាច់ព្រ័ត្រអ៊ីស្ព័រភ្នំពេញ',
      'Eight qualifying teams, best of five, with the bracket run across a single afternoon.',
      'ក្រុមប្រកួតប្រាំបី ប្រកួតក្នុងរសៀលតែមួយ។',
      'PUBLISHED', 'sport', 1, '2026-11-14 13:00+07', '2026-11-14 12:00+07', '2026-08-15 09:00+07', '2026-11-14 11:00+07', NULL,
      'https://picsum.photos/seed/pp-esports-finals/800/450', NULL),

    ( 9, 3, 3, 'ZONED', 'rock-riel-live',       'Rock Riel Live',               'រ៉ុករៀលផ្ទាល់',
      'Four Cambodian rock bands on one bill, closing with a set of reworked 1960s standards.',
      'ក្រុមតន្ត្រីរ៉ុកខ្មែរបួនក្រុម បិទដោយបទចាស់ទសវត្សរ៍ ៦០។',
      'PENDING_REVIEW', 'music', 7, '2026-12-19 19:00+07', '2026-12-19 18:00+07', '2026-08-15 09:00+07', '2026-12-19 17:00+07', '2026-09-12 10:20+07',
      NULL, NULL),

    (10, 2, 4, 'ZONED', 'bamboo-train-festival', 'Bamboo Train Festival',       'មហោស្រពរថភ្លើងឬស្សី',
      'A day of food stalls, craft demonstrations and short bamboo train rides on the old line.',
      'អាហារ សិប្បកម្ម និងការជិះរថភ្លើងឬស្សី។',
      'DRAFT', 'festival', 8, '2026-12-05 09:00+07', '2026-12-05 08:30+07', '2026-08-15 09:00+07', '2026-12-04 22:00+07', NULL,
      NULL, NULL);

-- ----------------------------------------------------------------- zones ---
-- sold_qty is pre-filled at different fractions so the storefront's scarcity
-- badges have every case to render: comfortable, the "N left" band under 20%,
-- the almost-full band at 12 or fewer, and one sold out outright (event 2's
-- VIP Deck). held_qty stays 0 - a held seat that nobody is holding expires
-- into a confusing state, and holds belong to a running app, not a seed.
INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity, sold_qty)
VALUES
    ( 1, 'Table Seating', 'តុអង្គុយ',      4800,  90,  74),
    ( 1, 'General',       'ទូទៅ',          2200, 260,  88),
    ( 1, 'Standing',      'ឈរ',            1200, 150,  12),

    ( 2, 'VIP Deck',      'ជាន់ VIP',      5500,  60,  60),
    ( 2, 'Riverside',     'មាត់ទន្លេ',      2600, 340, 128),
    ( 2, 'General',       'ទូទៅ',          1400, 700, 155),

    ( 3, 'Competitive',   'ប្រកួតពេញ',      3500, 400, 162),
    ( 3, 'Open',          'ចំហ',           2000, 800, 244),
    ( 3, 'Fun Run',       'រត់កម្សាន្ត',     900, 600,  70),

    ( 4, 'Front Mat',     'កន្ទេលមុខ',      3200, 120,  98),
    ( 4, 'Stalls',        'ជាន់ក្រោម',      2100, 220,  64),
    ( 4, 'Balcony',       'យ៉រ',            1500, 180,  30),

    ( 5, 'Full Pass',     'សំបុត្រពេញ',     8500, 180,  52),
    ( 5, 'Single Day',    'មួយថ្ងៃ',        4500, 240,  61),
    ( 5, 'Student',       'និស្សិត',        1200, 100,  91),

    ( 6, 'Front Row',     'ជួរមុខ',        2600,  24,  21),
    ( 6, 'General',       'ទូទៅ',          1400,  76,  33),

    ( 7, 'Reserved',      'កៅអីកក់',       4000, 150,  57),
    ( 7, 'General',       'ទូទៅ',          1800, 320, 110),

    ( 8, 'Floor',         'ជាន់ខាងក្រោម',   3000, 200, 186),
    ( 8, 'Tiered',        'ជាន់ថ្នាក់',      1800, 450, 120),

    ( 9, 'Front Pit',     'ខាងមុខ',        5000, 250,   0),
    ( 9, 'General',       'ទូទៅ',          2400, 900,   0),
    ( 9, 'Far Stand',     'ខាងក្រោយ',      1300, 500,   0),

    (10, 'Day Pass',      'សំបុត្រថ្ងៃ',     1600, 500,   0),
    (10, 'Family Four',   'គ្រួសារ ៤ នាក់',  5200, 120,   0);

-- ----------------------------------------------------------- venue seats ---
-- Physical seat maps, for the venues that host SEATED and MIXED events.
--
-- venue_seat is the building's geometry and belongs to the venue, not to any
-- one event: the same chair is row C seat 7 whoever is playing. event_seat
-- below is what makes a given chair sellable for a given night.
--
-- Generated rather than listed, because a seat map is a grid and ninety-two
-- hand-written rows would be ninety-two chances to typo a coordinate.
INSERT INTO venue_seat (venue_id, section_label, row_label, seat_number, pos_x, pos_y)
SELECT 1, 'Orchestra', chr(64 + r), s::text, s * 30, r * 30
FROM generate_series(1, 6) r, generate_series(1, 12) s;

INSERT INTO venue_seat (venue_id, section_label, row_label, seat_number, pos_x, pos_y)
SELECT 1, 'Balcony', chr(70 + r), s::text, s * 30, 240 + r * 30
FROM generate_series(1, 2) r, generate_series(1, 10) s;

INSERT INTO venue_seat (venue_id, section_label, row_label, seat_number, pos_x, pos_y)
SELECT 4, 'Stalls', chr(64 + r), s::text, s * 30, r * 30
FROM generate_series(1, 5) r, generate_series(1, 10) s;

-- ------------------------------------------- events: modes and lifecycle ---
-- The first ten events above are all ZONED, all PUBLISHED and all comfortably
-- on sale, which exercises exactly one path through the catalogue. These cover
-- the rest: both other inventory modes, every sales-window state, and the
-- review statuses the first ten never reach.
--
-- Dates are absolute rather than relative to now(), so "expired" stays expired
-- and the sales windows keep the relationships they were written with. They
-- are set around 2026-09-13; shift them if you are reading this much later.
INSERT INTO event (id, organizer_id, venue_id, inventory_mode, slug, title_en, title_km, description_en, description_km, status, category, cover, starts_at, doors_open_at, sales_open_at, sales_close_at, submitted_at, cloudinary_image_id)
OVERRIDING SYSTEM VALUE
VALUES
    -- SEATED. Every place is a numbered chair; no zones at all.
    (11, 1, 1, 'SEATED', 'chaktomuk-piano-recital', 'Chaktomuk Piano Recital', 'ការប្រគំព្យាណូចតុមុខ',
     'A solo programme of Debussy and Khmer art song arrangements, played on a restored Bosendorfer.',
     'ការប្រគំព្យាណូទោល បទដេប៊ុយស៊ី និងចម្រៀងសិល្បៈខ្មែរ។',
     'PUBLISHED', 'culture', 5, '2026-10-29 19:30+07', '2026-10-29 18:45+07', '2026-09-01 09:00+07', '2026-10-29 17:30+07', NULL,
     'https://picsum.photos/seed/chaktomuk-piano-recital/800/450'),

    -- MIXED. Reserved seating downstairs, standing room and a terrace sold by
    -- headcount - the case the whole inventory split exists for.
    (12, 1, 1, 'MIXED', 'koh-pich-countdown', 'Koh Pich New Year Countdown', 'រាប់ថយក្រោយចូលឆ្នាំកោះពេជ្រ',
     'Seated dinner tables on the floor, standing room at the front and a terrace bar, through to midnight.',
     'តុអាហារអង្គុយ កន្លែងឈរ និងបារយ៉រ រហូតដល់អធ្រាត្រ។',
     'PUBLISHED', 'festival', 8, '2026-12-31 20:00+07', '2026-12-31 19:00+07', '2026-09-01 09:00+07', '2026-12-31 18:00+07', NULL,
     'https://picsum.photos/seed/koh-pich-countdown/800/450'),

    -- SEATED and sold out: every seat SOLD, so the detail page has to render a
    -- map with nothing left on it.
    (13, 2, 4, 'SEATED', 'heritage-theatre-gala', 'Heritage Theatre Gala', 'មហោស្រពរោងបេតិកភណ្ឌ',
     'The reopening night, with the original 1961 programme performed in full.',
     'យប់បើកដំណើរការឡើងវិញ ជាមួយកម្មវិធីដើមឆ្នាំ ១៩៦១។',
     'PUBLISHED', 'culture', 3, '2026-11-28 19:00+07', '2026-11-28 18:15+07', '2026-09-01 09:00+07', '2026-11-28 17:00+07', NULL,
     NULL),

    -- Published, but the sale has not opened yet. The card shows the event;
    -- the buy button must not work.
    (14, 3, 3, 'ZONED', 'sihanouk-sunrise-set', 'Sihanouk Sunrise Set', 'តន្ត្រីថ្ងៃរះសីហនុ',
     'An all-night beach set that finishes as the sun comes up. Tickets open in October.',
     'តន្ត្រីឆ្នេរពេញមួយយប់ បញ្ចប់ពេលថ្ងៃរះ។ សំបុត្របើកលក់ក្នុងខែតុលា។',
     'PUBLISHED', 'music', 1, '2026-12-28 22:00+07', '2026-12-28 21:00+07', '2026-10-01 09:00+07', '2026-12-28 20:00+07', NULL,
     NULL),

    -- Published and upcoming, but the sales window has already shut. Not the
    -- same as sold out, and the storefront should not say that it is.
    (15, 2, 2, 'ZONED', 'angkor-dawn-ceremony', 'Angkor Dawn Ceremony', 'ពិធីរះថ្ងៃអង្គរ',
     'A dawn ceremony with a capped attendance; the guest list closed in early September.',
     'ពិធីពេលថ្ងៃរះ មានកំណត់ចំនួនអ្នកចូលរួម។',
     'PUBLISHED', 'culture', 4, '2026-11-02 05:00+07', '2026-11-02 04:15+07', '2026-08-01 09:00+07', '2026-09-10 23:00+07', NULL,
     NULL),

    -- Over. Still PUBLISHED, because taking a past event out of the catalogue
    -- would break the link in the inbox of everybody who attended it.
    (16, 1, 1, 'ZONED', 'monsoon-jazz-august', 'Monsoon Jazz: August', 'ចាសរដូវវស្សា៖ សីហា',
     'The August edition of the monthly monsoon series. This one has already happened.',
     'កម្មវិធីប្រចាំខែសីហា។ បានប្រព្រឹត្តទៅរួចហើយ។',
     'PUBLISHED', 'music', 6, '2026-08-20 19:00+07', '2026-08-20 18:00+07', '2026-07-01 09:00+07', '2026-08-20 17:00+07', NULL,
     NULL),

    -- Approved but not published: the organiser is holding it for a launch
    -- date. The one status that proves APPROVED and PUBLISHED are different.
    (17, 3, 5, 'ZONED', 'kep-seafood-festival', 'Kep Seafood Festival', 'មហោស្រពអាហារសមុទ្រកែប',
     'Crab, pepper and a hundred stalls along the seafront. Announcement is being held for the launch.',
     'ក្ដាម ម្រេច និងតូបជាងមួយរយ តាមមាត់សមុទ្រ។',
     'APPROVED', 'festival', 2, '2027-01-24 10:00+07', '2027-01-24 09:30+07', '2026-11-01 09:00+07', '2027-01-23 22:00+07', '2026-09-05 11:00+07',
     NULL),

    -- Sent back for changes, with the reason in event_review below.
    (18, 2, 4, 'ZONED', 'battambang-circus-night', 'Battambang Circus Night', 'យប់សៀកបាត់ដំបង',
     'Phare circus performers in the round, two shows a night.',
     'អ្នកសម្តែងសៀកផារេ ពីរកម្មវិធីក្នុងមួយយប់។',
     'CHANGES_REQUESTED', 'culture', 7, '2026-12-12 19:00+07', '2026-12-12 18:15+07', '2026-10-15 09:00+07', '2026-12-12 17:00+07', NULL,
     NULL),

    -- Rejected. Terminal, and kept for the audit trail rather than deleted.
    (19, 3, 3, 'ZONED', 'unlicensed-beach-rave', 'Beach Rave', 'ប៉ាទីឆ្នេរ',
     'Submitted without a venue licence or a safety plan.',
     'ដាក់ស្នើដោយគ្មានអាជ្ញាបណ្ណទីកន្លែង។',
     'REJECTED', 'music', 0, '2026-11-15 23:00+07', '2026-11-15 22:00+07', '2026-09-20 09:00+07', '2026-11-15 21:00+07', '2026-09-08 14:30+07',
     NULL),

    -- Published, sold tickets, then pulled. TAKEN_DOWN is terminal and stays
    -- publicly readable on purpose: removing it would 404 the event page for
    -- everyone already holding a ticket to it.
    (20, 2, 2, 'ZONED', 'siem-reap-night-market-live', 'Night Market Live', 'ផ្សារយប់ផ្ទាល់',
     'Pulled after a licensing complaint from the venue''s neighbours. Tickets already sold stay valid.',
     'ត្រូវបានដកចេញបន្ទាប់ពីមានបណ្តឹងអាជ្ញាបណ្ណ។ សំបុត្រដែលបានលក់រួចនៅតែមានសុពលភាព។',
     'TAKEN_DOWN', 'music', 2, '2026-12-06 18:00+07', '2026-12-06 17:00+07', '2026-08-15 09:00+07', '2026-12-06 16:00+07', NULL,
     NULL);

-- ----------------------------------------------------------- seat classes ---
-- Priced tiers for the seated half of the inventory. The trg_guard_seat_class
-- trigger rejects these unless the event is SEATED or MIXED, so the events
-- above had to be inserted with the right mode first.
INSERT INTO seat_class (event_id, name_en, name_km, price_usd_cents)
VALUES
    (11, 'Orchestra',      'ជួរមុខ',        6500),
    (11, 'Balcony',        'យ៉រ',           3500),
    (12, 'Reserved Table', 'តុកក់ទុក',      9000),
    (13, 'Stalls',         'ជាន់ក្រោម',     2800);

-- ------------------------------------------------------------ event seats ---
-- One row per chair per event. Status is spread deterministically off the seat
-- number so the map has every state on it: mostly AVAILABLE, a band of SOLD at
-- the front, a couple HELD, and two BLOCKED seats standing in for a camera
-- position or a broken chair.
INSERT INTO event_seat (event_id, venue_seat_id, seat_class_id, status)
SELECT 11,
       vs.id,
       (SELECT sc.id FROM seat_class sc
         WHERE sc.event_id = 11
           AND sc.name_en = CASE WHEN vs.section_label = 'Orchestra' THEN 'Orchestra' ELSE 'Balcony' END),
       CASE
           WHEN vs.row_label IN ('A', 'B') THEN 'SOLD'
           WHEN vs.row_label = 'C' AND vs.seat_number::int <= 3 THEN 'HELD'
           WHEN vs.row_label = 'F' AND vs.seat_number::int IN (1, 12) THEN 'BLOCKED'
           ELSE 'AVAILABLE'
       END
FROM venue_seat vs
WHERE vs.venue_id = 1;

-- MIXED: only the Orchestra floor is sold as seats here; the rest of this
-- event's capacity is the two zones below.
INSERT INTO event_seat (event_id, venue_seat_id, seat_class_id, status)
SELECT 12,
       vs.id,
       (SELECT sc.id FROM seat_class sc WHERE sc.event_id = 12 AND sc.name_en = 'Reserved Table'),
       CASE WHEN vs.row_label IN ('A', 'B', 'C') THEN 'SOLD' ELSE 'AVAILABLE' END
FROM venue_seat vs
WHERE vs.venue_id = 1 AND vs.section_label = 'Orchestra';

-- Sold out: every seat in the house.
INSERT INTO event_seat (event_id, venue_seat_id, seat_class_id, status)
SELECT 13,
       vs.id,
       (SELECT sc.id FROM seat_class sc WHERE sc.event_id = 13 AND sc.name_en = 'Stalls'),
       'SOLD'
FROM venue_seat vs
WHERE vs.venue_id = 4;

-- ------------------------------------------------- zones for the new events --
-- Event 12 is MIXED, so these sit alongside its seat map rather than instead
-- of it. Events 14 to 19 are ZONED and this is all the inventory they have.
INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity, sold_qty)
VALUES
    (12, 'Standing Floor', 'កន្លែងឈរ',     3500, 400, 268),
    (12, 'Terrace Bar',    'បារយ៉រ',       5500, 120,  96),

    (14, 'Beachfront',     'មុខឆ្នេរ',      3000, 400,   0),
    (14, 'General',        'ទូទៅ',         1600, 700,   0),

    (15, 'Ceremony',       'ពិធី',          4500, 150, 150),
    (15, 'Observation',    'កន្លែងមើល',     2000, 200, 178),

    (16, 'Front',          'ខាងមុខ',       4000, 150, 132),
    (16, 'General',        'ទូទៅ',         2000, 350, 291),

    (17, 'Weekend Pass',   'សំបុត្រចុងសប្តាហ៍', 2600, 600,  0),
    (17, 'Day Pass',       'សំបុត្រថ្ងៃ',    1200, 900,   0),

    (18, 'Ringside',       'ជិតឆាក',       3800, 140,   0),
    (18, 'General',        'ទូទៅ',         1900, 260,   0),

    (19, 'General',        'ទូទៅ',         2500, 500,   0),

    (20, 'Front',          'ខាងមុខ',       3200, 180,  64),
    (20, 'General',        'ទូទៅ',         1700, 420, 110);

-- -------------------------------------------------- event review history ---
-- Event 9 is PENDING_REVIEW, and the organiser's status banner reads the most
-- recent event_review row to explain why. Without this the banner renders from
-- null and the review queue shows an event that appears to have arrived from
-- nowhere.
-- Each decided event carries its SUBMIT as well as the decision, because the
-- history panel is a trail and a decision with nothing before it reads as
-- though the event arrived already judged.
--
-- actor_id is an app_user id, not an organizer_profile id: submissions are by
-- the organisation's owner (users 3 and 4), decisions by the platform admin
-- (user 1). REJECT and REQUEST_CHANGES carry a message because
-- event_review_message_required refuses them without one.
INSERT INTO event_review (event_id, actor_id, action, message, from_status, to_status, created_at)
VALUES
    (9,  4, 'SUBMIT',          NULL, 'DRAFT',          'PENDING_REVIEW',    '2026-09-12 10:20+07'),

    (17, 4, 'SUBMIT',          NULL, 'DRAFT',          'PENDING_REVIEW',    '2026-09-05 11:00+07'),
    (17, 1, 'APPROVE',         NULL, 'PENDING_REVIEW', 'APPROVED',          '2026-09-06 09:40+07'),

    (18, 3, 'SUBMIT',          NULL, 'DRAFT',          'PENDING_REVIEW',    '2026-09-04 16:10+07'),
    (18, 1, 'REQUEST_CHANGES',
     'The two shows are listed at the same start time, and the zone capacities add up to more than the theatre holds. Please correct both and resubmit.',
     'PENDING_REVIEW', 'CHANGES_REQUESTED', '2026-09-07 10:05+07'),

    (19, 4, 'SUBMIT',          NULL, 'DRAFT',          'PENDING_REVIEW',    '2026-09-08 14:30+07'),
    (19, 1, 'REJECT',
     'No venue licence and no safety plan were attached, and the stated capacity exceeds what the beach permit allows. This cannot be approved as submitted.',
     'PENDING_REVIEW', 'REJECTED', '2026-09-09 08:15+07'),

    (20, 3, 'SUBMIT',          NULL, 'DRAFT',          'PENDING_REVIEW',    '2026-08-10 09:00+07'),
    (20, 1, 'APPROVE',         NULL, 'PENDING_REVIEW', 'APPROVED',          '2026-08-11 10:30+07');

-- --------------------------------------------- organiser applications ------
-- One waiting decision so the admin applications queue is not empty. Dara Sok
-- (user 5) is a CUSTOMER asking to become an organiser.
INSERT INTO organizer_application (user_id, org_name_en, org_name_km, status)
VALUES (5, 'Riverside Sound', 'សំឡេងមាត់ទន្លេ', 'PENDING');

-- ---------------------------------------------- bookings and payments ------
-- Enough money movement for the admin screens to have something to render.
-- Without it the dashboard shows nine zeroes, the payments table is empty, and
-- the "stuck payment" path - the one thing that screen exists to surface - can
-- never be seen working.
--
-- Both holds are CONSUMED because a booking is a converted hold: booking.hold_id
-- is NOT NULL and UNIQUE, so a booking cannot exist without one.
INSERT INTO hold (event_id, user_id, status, expires_at)
VALUES (1, 5, 'CONSUMED', now() + interval '1 hour'),
       (2, 6, 'CONSUMED', now() + interval '1 hour');

-- One CONFIRMED (counts towards gross receipts and the event's revenue) and one
-- AWAITING_CONFIRMATION (counts towards the reconciliation tile, not revenue).
INSERT INTO booking (booking_ref, event_id, user_id, hold_id, state, buyer_name,
                     buyer_phone_e164, subtotal_usd_cents, total_usd_cents,
                     fx_rate_khr_per_usd, total_khr)
SELECT 'KH-7QF2M8ZP', 1, 5, (SELECT id FROM hold WHERE event_id = 1 AND user_id = 5),
       'CONFIRMED', 'Dara Sok', '096112233', 9600, 9600, 4100.0000, 393600;

INSERT INTO booking (booking_ref, event_id, user_id, hold_id, state, buyer_name,
                     buyer_phone_e164, subtotal_usd_cents, total_usd_cents,
                     fx_rate_khr_per_usd, total_khr)
SELECT 'KH-3MD9XK4T', 2, 6, (SELECT id FROM hold WHERE event_id = 2 AND user_id = 6),
       'AWAITING_CONFIRMATION', 'Srey Mom', '088554477', 5200, 5200, 4100.0000, 213200;

-- The second attempt is backdated two hours on purpose. AdminPaymentService
-- flags an open attempt as stuck once it is older than one hour, so this is the
-- row that makes the dashboard's stuck counter and the payments screen's
-- "stuck only" filter demonstrably work rather than merely compile.
INSERT INTO payment_transaction (booking_id, provider, provider_ref, idempotency_key,
                                 currency_charged, amount_usd_cents, amount_khr,
                                 status, expires_at, created_at, resolved_at)
SELECT id, 'BAKONG_KHQR', 'md5-seed-01', 'idem-seed-01', 'USD', 9600, 393600,
       'SUCCESS', now() + interval '10 minutes', now() - interval '20 minutes', now()
FROM booking WHERE booking_ref = 'KH-7QF2M8ZP';

INSERT INTO payment_transaction (booking_id, provider, provider_ref, idempotency_key,
                                 currency_charged, amount_usd_cents, amount_khr,
                                 status, expires_at, created_at)
SELECT id, 'ABA_PAYWAY', 'md5-seed-02', 'idem-seed-02', 'USD', 5200, 213200,
       'PENDING', now() + interval '10 minutes', now() - interval '2 hours'
FROM booking WHERE booking_ref = 'KH-3MD9XK4T';

-- ------------------------------------------------- more booking outcomes ---
-- The two bookings above are the happy path and the one being reconciled.
-- These are everything else a booking can end up as, so the admin screens and
-- the customer's own bookings list have each state to render.
--
-- Every one needs its own hold: booking.hold_id is UNIQUE, one hold yields at
-- most one booking. The holds are RELEASED or EXPIRED to match the booking
-- that came of them rather than all being CONSUMED.
--
-- One trap worth knowing about. BookingService sweeps PENDING_PAYMENT,
-- AWAITING_CONFIRMATION and PAYMENT_FAILED to EXPIRED once state_changed_at is
-- older than the payment window (UNPAID_STATES). A booking seeded into one of
-- those states with a backdated state_changed_at is therefore rewritten by the
-- running app within a minute - which is correct behaviour, and makes the seed
-- look wrong. So the PAYMENT_FAILED row below is stamped now(): it is the one
-- state here that only survives while it is fresh.
INSERT INTO hold (event_id, user_id, status, expires_at)
VALUES (1,  7, 'CONSUMED', now() + interval '1 hour'),   -- -> REFUND_REQUESTED
       (3,  8, 'CONSUMED', now() + interval '1 hour'),   -- -> REFUNDED
       (5,  9, 'EXPIRED',  now() - interval '2 hours'),  -- -> EXPIRED
       (6,  7, 'RELEASED', now() - interval '3 hours'),  -- -> CANCELLED
       (8,  8, 'CONSUMED', now() + interval '1 hour'),   -- -> PAYMENT_FAILED
       (16, 9, 'CONSUMED', now() - interval '20 days'),  -- -> CONFIRMED, past event
       (11, 6, 'ACTIVE',   now() + interval '12 minutes'); -- -> PENDING_PAYMENT

INSERT INTO booking (booking_ref, event_id, user_id, hold_id, state, buyer_name,
                     buyer_phone_e164, subtotal_usd_cents, total_usd_cents,
                     fx_rate_khr_per_usd, total_khr, created_at, state_changed_at)
SELECT v.ref, v.event_id, v.user_id,
       (SELECT id FROM hold h WHERE h.event_id = v.event_id AND h.user_id = v.user_id
         ORDER BY h.id DESC LIMIT 1),
       v.state, v.buyer_name, v.phone, v.cents, v.cents, 4100.0000, v.cents * 41,
       v.created_at::timestamptz, coalesce(v.changed_at::timestamptz, now())
FROM (VALUES
    ('KH-5RT8WQ2N', 1,  7, 'REFUND_REQUESTED', 'Chenda Pich', '078220011', 4400, '2026-09-09 14:02+07', '2026-09-12 09:30+07'),
    ('KH-9BN4LC6V', 3,  8, 'REFUNDED',         'Nita Chhun',  '092667788', 4000, '2026-09-02 10:15+07', '2026-09-08 16:20+07'),
    ('KH-2XG7HP3K', 5,  9, 'EXPIRED',          'Ratana Kim',  '070998877', 9000, '2026-09-11 20:41+07', '2026-09-11 21:01+07'),
    ('KH-6WD1ZT5M', 6,  7, 'CANCELLED',        'Chenda Pich', '078220011', 2800, '2026-09-10 11:26+07', '2026-09-10 11:58+07'),
    ('KH-4KQ2VS9J', 8,  8, 'PAYMENT_FAILED',   'Nita Chhun',  '092667788', 6000, '2026-09-12 18:12+07', NULL),
    ('KH-8HJ3FD7R', 16, 9, 'CONFIRMED',        'Ratana Kim',  '070998877', 8000, '2026-08-04 09:33+07', '2026-08-04 09:35+07'),
    -- Someone at the pay screen right now. Stamped now() for the same reason
    -- as PAYMENT_FAILED above: PENDING_PAYMENT is swept once it goes stale.
    ('KH-1PZ6NY8L', 11, 6, 'PENDING_PAYMENT',  'Srey Mom',    '088554477', 6500, now()::text, NULL)
) AS v(ref, event_id, user_id, state, buyer_name, phone, cents, created_at, changed_at);

-- Attempts behind those bookings. Between them these cover every PaymentStatus
-- the enum has, which is what the payments screen's status filter needs in
-- order to be filtering anything.
INSERT INTO payment_transaction (booking_id, provider, provider_ref, idempotency_key,
                                 currency_charged, amount_usd_cents, amount_khr,
                                 status, expires_at, created_at, resolved_at)
SELECT b.id, v.provider, v.ref_hash, v.idem, 'USD', b.total_usd_cents, b.total_khr,
       v.status, v.created_at::timestamptz + interval '10 minutes',
       v.created_at::timestamptz, v.resolved_at::timestamptz
FROM (VALUES
    ('KH-5RT8WQ2N', 'BAKONG_KHQR', 'md5-seed-03', 'idem-seed-03', 'SUCCESS',   '2026-09-09 14:03+07', '2026-09-09 14:06+07'),
    ('KH-9BN4LC6V', 'BAKONG_KHQR', 'md5-seed-04', 'idem-seed-04', 'SUCCESS',   '2026-09-02 10:16+07', '2026-09-02 10:18+07'),
    ('KH-2XG7HP3K', 'BAKONG_KHQR', 'md5-seed-05', 'idem-seed-05', 'EXPIRED',   '2026-09-11 20:42+07', '2026-09-11 21:01+07'),
    ('KH-6WD1ZT5M', 'ABA_PAYWAY',  'md5-seed-06', 'idem-seed-06', 'CANCELLED', '2026-09-10 11:27+07', '2026-09-10 11:58+07'),
    ('KH-4KQ2VS9J', 'ABA_PAYWAY',  'md5-seed-07', 'idem-seed-07', 'FAILED',    '2026-09-12 18:13+07', '2026-09-12 18:19+07'),
    ('KH-8HJ3FD7R', 'BAKONG_KHQR', 'md5-seed-08', 'idem-seed-08', 'SUCCESS',   '2026-08-04 09:34+07', '2026-08-04 09:35+07'),
    -- CREATED: the QR is on screen and the provider has not said anything yet.
    ('KH-1PZ6NY8L', 'BAKONG_KHQR', 'md5-seed-09', 'idem-seed-09', 'CREATED',   now()::text,           NULL)
) AS v(ref, provider, ref_hash, idem, status, created_at, resolved_at)
JOIN booking b ON b.booking_ref = v.ref;

-- ----------------------------------------------------- items and tickets ---
-- A confirmed booking is not finished at the payment: it owns booking_item
-- rows saying what was bought, and one ticket per unit. Without these the
-- dashboard's tickets-issued and checked-in tiles both read zero however many
-- bookings exist.
--
-- Zone lines only. Seat-backed items would have to claim specific event_seat
-- rows, and uq_booking_item_seat_live means each of those can belong to one
-- live item - a constraint worth respecting rather than working around in a
-- seed.
INSERT INTO booking_item (booking_id, event_zone_id, qty, unit_price_usd_cents)
SELECT b.id, z.id, v.qty, z.price_usd_cents
FROM (VALUES
    ('KH-7QF2M8ZP', 1,  'Table Seating', 2),
    ('KH-3MD9XK4T', 2,  'Riverside',     2),
    ('KH-5RT8WQ2N', 1,  'General',       2),
    ('KH-9BN4LC6V', 3,  'Open',          2),
    ('KH-8HJ3FD7R', 16, 'Front',         2)
) AS v(ref, event_id, zone_name, qty)
JOIN booking b   ON b.booking_ref = v.ref
JOIN event_zone z ON z.event_id = v.event_id AND z.name_en = v.zone_name;

-- One ticket per unit bought. Only CONFIRMED and REFUND_REQUESTED bookings get
-- them: a ticket is proof of a completed purchase, and issuing one against an
-- awaiting-confirmation booking is how somebody walks in without having paid.
INSERT INTO ticket (booking_item_id, unit_seq)
SELECT bi.id, g.seq
FROM booking_item bi
JOIN booking b ON b.id = bi.booking_id
CROSS JOIN LATERAL generate_series(1, bi.qty) AS g(seq)
WHERE b.state IN ('CONFIRMED', 'REFUND_REQUESTED');

-- The past event's tickets were actually scanned at the door; the upcoming
-- ones have not been. checked_in_by is the admin standing in for a gate
-- operator, which is what scan_log would record in a real check-in.
UPDATE ticket t
   SET checked_in_at = '2026-08-20 18:32+07', checked_in_by = 1
  FROM booking_item bi
  JOIN booking b ON b.id = bi.booking_id
 WHERE t.booking_item_id = bi.id
   AND b.booking_ref = 'KH-8HJ3FD7R';

-- ------------------------------------------------------------- sequences ---
-- Every table above was given explicit ids, which leaves its identity sequence
-- still sitting at 1. The next INSERT the API makes would collide with seeded
-- row 1 and fail on the primary key. Catch each sequence up to its table.
SELECT setval(pg_get_serial_sequence('app_user', 'id'),          (SELECT MAX(id) FROM app_user));
SELECT setval(pg_get_serial_sequence('organizer_profile', 'id'), (SELECT MAX(id) FROM organizer_profile));
SELECT setval(pg_get_serial_sequence('venue', 'id'),             (SELECT MAX(id) FROM venue));
SELECT setval(pg_get_serial_sequence('event', 'id'),             (SELECT MAX(id) FROM event));

COMMIT;

-- ------------------------------------------------------------ what landed --
\echo ''
\echo '--- users ---'
SELECT id, phone_e164, display_name, role, is_disabled FROM app_user ORDER BY id;

\echo ''
\echo '--- catalogue by status ---'
SELECT status, category, count(*) AS events FROM event GROUP BY status, category ORDER BY status, category;

\echo ''
\echo '--- money ---'
SELECT b.booking_ref, b.state, b.total_usd_cents,
       p.provider, p.status AS payment_status,
       (p.status IN ('CREATED','PENDING') AND p.created_at <= now() - interval '1 hour') AS stuck
FROM booking b LEFT JOIN payment_transaction p ON p.booking_id = b.id
ORDER BY b.id;

\echo ''
\echo '--- inventory, by mode ---'
SELECT e.id, e.inventory_mode AS mode, e.slug, e.status,
       coalesce(z.zones, 0)                      AS zones,
       coalesce(s.seats, 0)                      AS seats,
       coalesce(z.capacity, 0) + coalesce(s.seats, 0)   AS capacity,
       coalesce(z.sold, 0)     + coalesce(s.sold, 0)    AS sold
FROM event e
LEFT JOIN (SELECT event_id, count(*) AS zones, sum(capacity) AS capacity, sum(sold_qty) AS sold
             FROM event_zone GROUP BY event_id) z ON z.event_id = e.id
LEFT JOIN (SELECT event_id, count(*) AS seats,
                  count(*) FILTER (WHERE status = 'SOLD') AS sold
             FROM event_seat GROUP BY event_id) s ON s.event_id = e.id
ORDER BY e.id;

\echo ''
\echo '--- sales window state ---'
SELECT e.id, e.slug,
       CASE
           WHEN e.starts_at   <= now() THEN 'over'
           WHEN e.sales_open_at  > now() THEN 'sale not open'
           WHEN e.sales_close_at < now() THEN 'sale closed'
           ELSE 'on sale'
       END AS window
FROM event e WHERE e.status = 'PUBLISHED' ORDER BY 3, e.id;

\echo ''
\echo '--- tickets ---'
SELECT count(*) AS issued, count(checked_in_at) AS checked_in FROM ticket;
