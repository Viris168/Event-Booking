-- [FIX] The web prototype's mock auth (web/src/mock/seed.js) issues demo
-- accounts with ids 1..15 and sends that id as the X-User-Id header. The
-- backend resolves the header against app_user, so the same demo identities
-- must exist here, or every hold/booking call from the prototype fails with
-- 400 INVALID_HOLD_TARGET ("User not found").
--
-- One collision to clear first: the DatabaseSeeder's Dev Organizer was given
-- Dara's phone (+85512345678, mock id 1). On databases seeded before this
-- migration, move it aside; on fresh databases this updates nothing.
UPDATE app_user
   SET phone_e164 = '+85599990001'
 WHERE phone_e164 = '+85512345678'
   AND id <> 1;

INSERT INTO app_user (id, phone_e164, email, password_hash, display_name, locale, role, is_disabled)
OVERRIDING SYSTEM VALUE
VALUES
    ( 1, '+85512345678', 'dara@example.com',            'hashed-password', 'Dara Sok',         'KM', 'CUSTOMER',      false),
    ( 2, '+85512987654', 'organizer@example.com',       'hashed-password', 'Chantha Meas',     'EN', 'ORGANIZER',     false),
    ( 3, '+85510111222', 'admin@example.com',           'hashed-password', 'Platform Admin',   'EN', 'PLATFORM_ADMIN', false),
    ( 4, '+85517443322', 'sophea@angkorevents.kh',      'hashed-password', 'Sophea Nou',       'KM', 'ORGANIZER',     false),
    ( 5, '+85596112233', 'lyhour@example.com',          'hashed-password', 'Ly Hour',          'KM', 'CUSTOMER',      false),
    ( 6, '+85588554477', NULL,                          'hashed-password', 'Srey Mom',         'KM', 'CUSTOMER',      false),
    ( 7, '+85570998877', 'spam.buyer@example.com',      'hashed-password', 'Vuthy Kh',         'EN', 'CUSTOMER',      true),
    ( 8, '+85592334455', 'ratana.k@example.com',        'hashed-password', 'Ratana Kim',       'KM', 'CUSTOMER',      false),
    ( 9, '+85578220011', NULL,                          'hashed-password', 'Chenda Pich',      'KM', 'CUSTOMER',      false),
    (10, '+85512667788', 'nita@example.com',            'hashed-password', 'Nita Chhun',       'EN', 'CUSTOMER',      false),
    (11, '+85517889900', 'sokha.t@example.com',         'hashed-password', 'Sokha Tep',        'KM', 'CUSTOMER',      false),
    (12, '+85569445566', 'bopha@example.com',           'hashed-password', 'Bopha Rin',        'KM', 'CUSTOMER',      false),
    (13, '+85597001122', 'james.w@example.com',         'hashed-password', 'James Whitfield',  'EN', 'CUSTOMER',      false),
    (14, '+85586773311', 'chargeback@example.com',      'hashed-password', 'Rithy Long',       'EN', 'CUSTOMER',      true),
    (15, '+85511556677', 'battambang.arts@example.com', 'hashed-password', 'Sovann Chey',      'KM', 'ORGANIZER',     false)
ON CONFLICT DO NOTHING;

-- Explicit ids above must not collide with future identity-generated rows.
SELECT setval(pg_get_serial_sequence('app_user', 'id'), (SELECT MAX(id) FROM app_user));
