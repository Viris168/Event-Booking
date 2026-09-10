-- ============================================================
-- Dev seed: a catalogue with actual variety.
--
-- The four seeded events were all category MUSIC, all cover 1, all MIXED, all
-- in province 12. Every card on the storefront therefore rendered the same
-- colour, the same icon and the same province - which made a working UI look
-- like a broken one. This script fills the catalogue out so the listing,
-- filters and scarcity badges all have something to show.
--
-- Three things it deliberately fixes as well as adds:
--
--   * category is written LOWERCASE. The frontend's CATEGORY_ICON map is keyed
--     'music' / 'sport' / …, so the stored 'MUSIC' matched nothing and every
--     event fell back to the generic ticket glyph.
--   * cover is spread across 0..8. It indexes the COVERS list zero-based (the
--     convention EventFormPage reads and writes), so 0 is sunset and 8 is rose.
--   * venues land in several provinces, so the province filter has more than
--     one answer.
--
-- NOT a Flyway migration, and deliberately not under db/migration - Flyway
-- would run it on every environment including CI. Run it by hand:
--
--   docker compose up -d
--   docker exec -i event-booking-postgres \
--     psql -U postgres -d event_booking < api/dev-seed-catalog.sql
--
-- Re-runnable: every insert is guarded on a natural key, so a second run adds
-- nothing and changes nothing.
--
-- Events are ZONED rather than SEATED/MIXED on purpose. A zoned event's whole
-- inventory is a handful of event_zone rows, while a seated one needs
-- venue_seat + event_seat grids; the storefront cards, filters and checkout
-- exercise the same paths either way.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------- venues ---
-- Spread across the country. province_code is the numeric ref code, which
-- V17__all_cambodian_provinces.sql guarantees exists.
INSERT INTO venue (organizer_id, name_en, name_km, province_code,
                   khan_district, sangkat_commune, street_address, lat, lng)
SELECT 1, v.name_en, v.name_km, v.province_code, v.khan, v.sangkat, v.street, v.lat, v.lng
FROM (VALUES
    ('Angkor Amphitheatre',    'រោងមហោស្រពអង្គរ',        '17', 'Siem Reap',   'Sala Kamreuk',  'Charles de Gaulle St', 13.412500, 103.866700),
    ('Otres Beach Stage',      'ឆ្នេរអូត្រេស',            '18', 'Sihanoukville', 'Otres',       'Otres Beach Road',     10.596700, 103.522500),
    ('Battambang Arts Centre', 'មជ្ឈមណ្ឌលសិល្បៈបាត់ដំបង', '2',  'Battambang',  'Svay Por',      'Street 1.5',           13.095700, 103.202200),
    ('Kampot Riverside Lawn',  'ព្រៃស្មៅមាត់ទន្លេកំពត',   '7',  'Kampot',      'Kampong Kandal','Riverside Road',       10.610400, 104.181000),
    ('Kampong Cham Arena',     'កីឡដ្ឋានកំពង់ចាម',        '3',  'Kampong Cham','Veal Vong',     'National Road 7',      11.992400, 105.463300)
) AS v(name_en, name_km, province_code, khan, sangkat, street, lat, lng)
WHERE NOT EXISTS (SELECT 1 FROM venue x WHERE x.name_en = v.name_en);

-- ---------------------------------------------------------------- events ---
-- Dates are relative to now(), so the catalogue is always upcoming however
-- long after writing this the script is run. sales_close_at stays at or before
-- starts_at, which the event_check constraint requires.
INSERT INTO event (organizer_id, venue_id, inventory_mode, slug,
                   title_en, title_km, description_en, description_km,
                   status, category, cover,
                   starts_at, doors_open_at, sales_open_at, sales_close_at)
SELECT 1,
       (SELECT id FROM venue WHERE name_en = e.venue_name ORDER BY id LIMIT 1),
       'ZONED', e.slug, e.title_en, e.title_km, e.description_en, e.description_km,
       'PUBLISHED', e.category, e.cover,
       now() + (e.days || ' days')::interval,
       now() + (e.days || ' days')::interval - interval '1 hour',
       now() - interval '10 days',
       now() + (e.days || ' days')::interval - interval '2 hours'
FROM (VALUES
    ('bokator-championship-2026', 'Bokator National Championship', 'ជើងឯកបុក្កតោជាតិ',
     'Cambodia''s traditional martial art, contested over three nights.',
     'សិល្បៈក្បាច់គុនបុរាណខ្មែរ ប្រកួតរយៈពេលបីយប់។',
     'sport', 0, 'Kampong Cham Arena', 6),

    ('angkor-sunset-sessions', 'Angkor Sunset Sessions', 'តន្ត្រីថ្ងៃលិចអង្គរ',
     'Open-air sets from Khmer and regional artists as the sun goes down.',
     'តន្ត្រីវាលទំនេរពីសិល្បករខ្មែរ និងតំបន់ ពេលថ្ងៃលិច។',
     'music', 1, 'Angkor Amphitheatre', 12),

    ('water-festival-riverside', 'Water Festival Riverside', 'បុណ្យអុំទូកមាត់ទន្លេ',
     'Three days of racing, food stalls and night markets along the river.',
     'បីថ្ងៃនៃការប្រណាំងទូក អាហារ និងផ្សារយប់។',
     'festival', 2, 'Kampot Riverside Lawn', 20),

    ('phnom-penh-tech-week', 'Phnom Penh Tech Week', 'សប្តាហ៍បច្ចេកវិទ្យាភ្នំពេញ',
     'Two days of talks on payments, logistics and building for Cambodia.',
     'ពីរថ្ងៃនៃការពិភាក្សាអំពីបច្ចេកវិទ្យា។',
     'conference', 3, 'Battambang Arts Centre', 27),

    ('otres-beach-open-air', 'Otres Beach Open Air', 'តន្ត្រីឆ្នេរអូត្រេស',
     'Sunset to sunrise on the sand, with a stage right on the shoreline.',
     'ពីថ្ងៃលិចដល់ថ្ងៃរះនៅលើឆ្នេរខ្សាច់។',
     'music', 4, 'Otres Beach Stage', 34),

    ('khmer-classical-dance', 'Khmer Classical Dance Gala', 'ការសម្តែងរបាំព្រះរាជទ្រព្យ',
     'Royal Ballet repertoire performed with a full live ensemble.',
     'របាំព្រះរាជទ្រព្យ ជាមួយវង់ភ្លេងផ្ទាល់។',
     'culture', 5, 'Angkor Amphitheatre', 41),

    ('standup-night-battambang', 'Stand-Up Night Battambang', 'យប់កំប្លែងបាត់ដំបង',
     'Six comedians, two languages, one very small room.',
     'អ្នកកំប្លែងប្រាំមួយនាក់ ពីរភាសា។',
     'comedy', 6, 'Battambang Arts Centre', 15),

    ('mekong-marathon-2026', 'Mekong Marathon 2026', 'ម៉ារ៉ាតុងមេគង្គ',
     'Full and half distances along the riverfront, finishing at the arena.',
     'ការរត់ប្រណាំងតាមមាត់ទន្លេមេគង្គ។',
     'sport', 7, 'Kampong Cham Arena', 55),

    ('kampot-writers-festival', 'Kampot Writers Festival', 'មហោស្រពអ្នកនិពន្ធកំពត',
     'Readings, workshops and late-night music across the riverside.',
     'ការអាន សិក្ខាសាលា និងតន្ត្រី។',
     'festival', 8, 'Kampot Riverside Lawn', 48),

    ('startup-summit-sihanoukville', 'Coastal Startup Summit', 'កិច្ចប្រជុំស្តាតអាប់ឆ្នេរ',
     'Founders and investors from across the Mekong region.',
     'ស្ថាបនិក និងវិនិយោគិនមកពីតំបន់មេគង្គ។',
     'conference', 2, 'Otres Beach Stage', 62),

    ('lunar-lantern-night', 'Lunar Lantern Night', 'យប់គោមព្រះច័ន្ទ',
     'A lantern release, a night market and a single long set of live music.',
     'ការលែងគោម ផ្សារយប់ និងតន្ត្រីផ្ទាល់។',
     'culture', 4, 'Kampot Riverside Lawn', 9),

    ('siem-reap-comedy-fest', 'Siem Reap Comedy Festival', 'មហោស្រពកំប្លែងសៀមរាប',
     'A weekend of stand-up, improv and sketch across three stages.',
     'ចុងសប្តាហ៍នៃការកំប្លែង។',
     'comedy', 1, 'Angkor Amphitheatre', 73)
) AS e(slug, title_en, title_km, description_en, description_km, category, cover, venue_name, days)
WHERE NOT EXISTS (SELECT 1 FROM event x WHERE x.slug = e.slug);

-- ----------------------------------------------------------------- zones ---
-- Three tiers per event. sold_qty is pre-filled at different fractions so the
-- storefront's scarcity badges have every case to render: comfortable, the
-- "N seats left" band under 20%, the <= 12 "almost full" band, and sold out.
INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity, sold_qty)
SELECT ev.id, z.name_en, z.name_km, z.price_usd_cents, z.capacity, z.sold_qty
FROM (VALUES
    ('bokator-championship-2026',   'Ringside',   'ជិតសង្វៀន',   4500, 120,  96),
    ('bokator-championship-2026',   'Grandstand', 'តាំងទ្រុង',    2000, 600, 210),
    ('bokator-championship-2026',   'Standing',   'ឈរ',          1200, 400,  85),

    ('angkor-sunset-sessions',      'Front Pit',  'ខាងមុខ',      5500, 200, 194),
    ('angkor-sunset-sessions',      'General',    'ទូទៅ',        2800, 800, 320),
    ('angkor-sunset-sessions',      'Lawn',       'ព្រៃស្មៅ',     1500, 500,  60),

    ('water-festival-riverside',    'VIP Deck',   'ជាន់ VIP',    6000,  80,  80),
    ('water-festival-riverside',    'Riverside',  'មាត់ទន្លេ',    2500, 400, 150),
    ('water-festival-riverside',    'General',    'ទូទៅ',        1000, 900, 120),

    ('phnom-penh-tech-week',        'Full Pass',  'សំបុត្រពេញ',   9000, 150,  40),
    ('phnom-penh-tech-week',        'Day One',    'ថ្ងៃទីមួយ',    4500, 200,  55),
    ('phnom-penh-tech-week',        'Student',    'និស្សិត',      1500, 120,  95),

    ('otres-beach-open-air',        'Cabana',     'ខ្ទមឆ្នេរ',    7500,  40,  34),
    ('otres-beach-open-air',        'Beachfront', 'មុខឆ្នេរ',     3200, 350, 120),
    ('otres-beach-open-air',        'General',    'ទូទៅ',        1800, 600,  95),

    ('khmer-classical-dance',       'Stalls',     'ជាន់ក្រោម',    5000, 180,  60),
    ('khmer-classical-dance',       'Balcony',    'យ៉រ',          3000, 220,  70),
    ('khmer-classical-dance',       'Rear',       'ខាងក្រោយ',    1600, 260,  40),

    ('standup-night-battambang',    'Front Row',  'ជួរមុខ',      2800,  30,  27),
    ('standup-night-battambang',    'General',    'ទូទៅ',        1500, 120,  44),

    ('mekong-marathon-2026',        'Full',       'ចម្ងាយពេញ',    4000, 500, 180),
    ('mekong-marathon-2026',        'Half',       'ពាក់កណ្តាល',   2500, 700, 260),
    ('mekong-marathon-2026',        'Fun Run',    'រត់កម្សាន្ត',   1000, 900, 300),

    ('kampot-writers-festival',     'Weekend',    'ចុងសប្តាហ៍',   3500, 250,  70),
    ('kampot-writers-festival',     'Day Pass',   'សំបុត្រថ្ងៃ',   1800, 400, 110),

    ('startup-summit-sihanoukville','Investor',   'វិនិយោគិន',   12000,  60,  18),
    ('startup-summit-sihanoukville','Founder',    'ស្ថាបនិក',     5000, 200,  64),
    ('startup-summit-sihanoukville','General',    'ទូទៅ',        2500, 300,  70),

    ('lunar-lantern-night',         'Riverside',  'មាត់ទន្លេ',    3000, 200, 188),
    ('lunar-lantern-night',         'General',    'ទូទៅ',        1400, 500, 140),

    ('siem-reap-comedy-fest',       'Weekend',    'ចុងសប្តាហ៍',   4200, 180,  52),
    ('siem-reap-comedy-fest',       'Single Show','មួយកម្មវិធី',   1900, 320,  88)
) AS z(slug, name_en, name_km, price_usd_cents, capacity, sold_qty)
JOIN event ev ON ev.slug = z.slug
WHERE NOT EXISTS (
    SELECT 1 FROM event_zone x WHERE x.event_id = ev.id AND x.name_en = z.name_en
);

-- ------------------------------------------------- fix the original four ---
-- Lowercase so CATEGORY_ICON resolves, and spread the covers so the first four
-- cards are not all the same colour as each other.
UPDATE event SET category = lower(category) WHERE category <> lower(category);

UPDATE event SET category = 'music',      cover = 1 WHERE slug = 'event-1-2026';
UPDATE event SET category = 'conference', cover = 3 WHERE title_en = 'Cambodia Tech Summit';
UPDATE event SET category = 'music',      cover = 7 WHERE title_en = 'K-Pop Live in PP';
UPDATE event SET category = 'comedy',     cover = 5 WHERE title_en = 'National Comedy Night';

COMMIT;

-- What the catalogue looks like now.
SELECT category, count(*) AS events, min(cover) AS cover_lo, max(cover) AS cover_hi
FROM event WHERE status = 'PUBLISHED' GROUP BY category ORDER BY category;
