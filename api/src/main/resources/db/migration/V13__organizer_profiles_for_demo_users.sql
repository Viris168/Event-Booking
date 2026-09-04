-- ============================================================
-- V13 - every ORGANIZER account gets the profile it now needs
--
-- Ownership of a venue or event is an organizer_profile.id, but callers
-- identify themselves with an app_user.id. Nothing bridged the two, so the
-- catalog endpoints took the owner id from the request body and believed it.
-- They now derive it from the caller instead (OrganizerResolver), and having
-- a profile row is what being an organiser MEANS - no profile, no writes.
--
-- That turns an inconsistency in the demo data into a hard failure. V6 seeds
-- users 2, 4 and 15 with role ORGANIZER, but only user 2 ever got a profile
-- (created at runtime by DatabaseSeeder). Users 4 and 15 would authenticate
-- fine and then be refused, which reads as a bug in the resolver rather than
-- as missing data.
--
-- Names come from app_user.display_name rather than being invented here: the
-- row exists to make the id resolvable, and a placeholder that looks like a
-- real organisation name is worse than an obvious one.
--
-- Idempotent by the NOT EXISTS guard and by user_id being UNIQUE, so this is
-- safe on a database where DatabaseSeeder already made user 2's profile.
-- ============================================================

INSERT INTO organizer_profile (user_id, org_name_en, org_name_km, telegram_chat_id)
SELECT u.id, u.display_name, u.display_name, NULL
  FROM app_user u
 WHERE u.role = 'ORGANIZER'
   AND NOT EXISTS (
       SELECT 1 FROM organizer_profile p WHERE p.user_id = u.id
   );
