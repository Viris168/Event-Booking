-- ============================================================
-- Accept the local Cambodian phone format (0xx) alongside E.164 (+855xx).
--
-- V1 pinned both phone columns to '^\+855[0-9]{8,9}$'. That is the correct
-- storage format and nothing here argues otherwise - but it is not the format
-- anyone in Cambodia writes their own number in. People give 012 345 678, and
-- the leading 0 is the same digit the +855 replaces, so the two spellings
-- describe the same line.
--
-- Widening rather than switching is deliberate. Every row already stored is
-- +855, the Google set-phone flow sends +855, and ABA's payment payloads carry
-- +855; tightening to 0-only would break all three at once for a cosmetic gain.
-- So both spellings are legal here, and the application layer stays free to
-- normalise to one of them later without another migration.
--
-- {8,9} digits after the prefix is carried over unchanged from V1: a Cambodian
-- subscriber number is 8 or 9 digits, and 0 + 8..9 is the same length as +855
-- + 8..9 because the 0 and the 855 occupy the same position.
-- ============================================================

-- DROP ... IF EXISTS so this is re-runnable. dev-seed-all.sql applies the same
-- two statements by hand, for the case where a developer wipes and reseeds
-- before the API has had a chance to boot and let Flyway get here; without the
-- guard, whichever of the two ran second would fail on the already-dropped
-- constraint.
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_phone_e164_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_phone_e164_check
    CHECK (phone_e164 ~ '^(\+855|0)[0-9]{8,9}$');

-- booking carries the buyer's number as typed at checkout, independently of
-- any account, so it needs the same widening or a 0-prefixed customer cannot
-- complete a booking even once their account accepts the format.
ALTER TABLE booking DROP CONSTRAINT IF EXISTS booking_buyer_phone_e164_check;
ALTER TABLE booking ADD CONSTRAINT booking_buyer_phone_e164_check
    CHECK (buyer_phone_e164 ~ '^(\+855|0)[0-9]{8,9}$');
