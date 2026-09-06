-- ============================================================
-- V15: give organizer profiles real names
-- ============================================================
--
-- V13 backfilled organizer_profile from app_user and had nothing better than
-- the person's own name to put in it:
--
--     SELECT u.id, u.display_name, u.display_name
--
-- So org_name_en reads "Chantha Meas" where it should name an organisation,
-- and org_name_km holds Latin text in a column the Khmer font renders. Both
-- surface directly in the organiser dashboard heading and the admin events
-- table, and will start showing the moment those screens read the profile from
-- the API rather than the frontend's own seed.
--
-- Only rows still carrying that placeholder are touched. The WHERE clause means
-- an organiser who has since set a real name keeps it, and re-running this
-- against a restored database cannot overwrite anything.
-- ============================================================

UPDATE organizer_profile op
   SET org_name_en = v.name_en,
       org_name_km = v.name_km
  FROM (VALUES
        (5,  'Dev Productions',            'ផលិតកម្មអភិវឌ្ឍន៍'),
        (2,  'Mekong Live Productions',    'ផលិតកម្មមេគង្គឡាយវ៍'),
        (4,  'Angkor Events Co.',          'អង្គរ អ៊ីវេន'),
        (15, 'Battambang Arts Collective', 'សមាគមសិល្បៈបាត់ដំបង')
       ) AS v(user_id, name_en, name_km)
 WHERE op.user_id = v.user_id
   AND op.org_name_en = (SELECT u.display_name FROM app_user u WHERE u.id = op.user_id);
