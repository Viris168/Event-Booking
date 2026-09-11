-- The demo identities seeded by V6 were given the literal string
-- 'hashed-password' as their password_hash. It is not a BCrypt hash and never
-- was: BCryptPasswordEncoder.matches("password", "hashed-password") cannot
-- parse it, logs a warning, and returns false. Every seeded account therefore
-- failed /auth/login with INVALID_CREDENTIALS, which looked exactly like a
-- wrong password and hid the fact that no demo account could sign in at all.
--
-- That went unnoticed because nothing ever called the endpoint: the web client
-- authenticated against its own mock store and sent the chosen user id in an
-- X-User-Id header. With that header gone and the API requiring a real token,
-- these rows have to hold something BCrypt can actually verify.
--
-- The value below is BCrypt("password", cost 10), matching the password the
-- login screen's demo panel fills in.
--
-- ⚠ These are DEVELOPMENT fixtures with a published password. Delete or disable
--   them in any environment reachable by anyone but you - a working login is a
--   great deal more dangerous than a broken one:
--       DELETE FROM app_user WHERE id <= 15;
--
-- Scoped to rows still holding the placeholder, so it can never overwrite a
-- password a real person has since chosen.
UPDATE app_user
   SET password_hash = '$2a$10$YGBHNV6zrTujC5bIsCGFr.9WojCiuxYzNEX.r3cYdyQfJfxIMIk0K'
 WHERE password_hash = 'hashed-password';
