-- [FIX] app_user.locale is persisted by JPA as the Java enum name
-- ('KM' / 'EN' via EnumType.STRING), but the V1 check constraint only
-- allowed lowercase 'km' / 'en'. Every other enum-valued CHECK in this
-- schema stores uppercase enum names, so align locale with that
-- convention: drop the old check, normalize existing rows, re-issue.
ALTER TABLE app_user DROP CONSTRAINT app_user_locale_check;

UPDATE app_user SET locale = upper(locale) WHERE locale IN ('km','en');

ALTER TABLE app_user ALTER COLUMN locale SET DEFAULT 'KM';

ALTER TABLE app_user ADD CONSTRAINT app_user_locale_check
    CHECK (locale IN ('KM','EN'));
