-- ------------------------------------------------------------
-- V17: the rest of Cambodia.
--
-- province_ref held exactly two rows - Phnom Penh and Siem Reap - because the
-- seeder only ever needed those two, and venue.province_code is a FOREIGN KEY
-- to it. So an organiser creating a venue anywhere else got a constraint
-- violation, surfaced (correctly) as "an unexpected database error" because
-- DatabaseExceptionTranslator will not leak a constraint name to a client.
--
-- The codes are ISO 3166-2:KH subdivision numbers, which is what the two
-- existing rows already used. The web app had invented its own two-letter set
-- ('PP', 'SR', 'BB'...) in mock/seed.js that matched nothing here; it now reads
-- this table instead.
--
-- Idempotent, so a database seeded before this migration keeps its two rows
-- rather than erroring on the conflict.
-- ------------------------------------------------------------

INSERT INTO province_ref (code, name_en, name_km) VALUES
    ( '1', 'Banteay Meanchey', 'បន្ទាយមានជ័យ'),
    ( '2', 'Battambang',       'បាត់ដំបង'),
    ( '3', 'Kampong Cham',     'កំពង់ចាម'),
    ( '4', 'Kampong Chhnang',  'កំពង់ឆ្នាំង'),
    ( '5', 'Kampong Speu',     'កំពង់ស្ពឺ'),
    ( '6', 'Kampong Thom',     'កំពង់ធំ'),
    ( '7', 'Kampot',           'កំពត'),
    ( '8', 'Kandal',           'កណ្ដាល'),
    ( '9', 'Koh Kong',         'កោះកុង'),
    ('10', 'Kratie',           'ក្រចេះ'),
    ('11', 'Mondulkiri',       'មណ្ឌលគិរី'),
    ('12', 'Phnom Penh',       'ភ្នំពេញ'),
    ('13', 'Preah Vihear',     'ព្រះវិហារ'),
    ('14', 'Prey Veng',        'ព្រៃវែង'),
    ('15', 'Pursat',           'ពោធិ៍សាត់'),
    ('16', 'Ratanakiri',       'រតនគិរី'),
    ('17', 'Siem Reap',        'សៀមរាប'),
    ('18', 'Preah Sihanouk',   'ព្រះសីហនុ'),
    ('19', 'Stung Treng',      'ស្ទឹងត្រែង'),
    ('20', 'Svay Rieng',       'ស្វាយរៀង'),
    ('21', 'Takeo',            'តាកែវ'),
    ('22', 'Oddar Meanchey',   'ឧត្ដរមានជ័យ'),
    ('23', 'Kep',              'កែប'),
    ('24', 'Pailin',           'ប៉ៃលិន'),
    ('25', 'Tbong Khmum',      'ត្បូងឃ្មុំ')
ON CONFLICT (code) DO NOTHING;
