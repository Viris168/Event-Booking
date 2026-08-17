-- ============================================================
-- V5 - Google sign-in support on app_user
--
-- V1 assumed one way in: a +855 phone plus a password this service hashes
-- and checks. Google sign-in breaks both halves of that assumption - the
-- identity is proven by Google, so there is no password to store, and the
-- profile Google returns carries an email but never a phone number. Both
-- columns therefore have to become optional.
--
-- Phone stays required to BOOK, just not to EXIST: booking.buyer_phone_e164
-- is NOT NULL and CheckoutRequest validates the +855 format, so a Google
-- user who has not supplied a number yet simply cannot complete checkout.
-- That check lives in the booking lane and needs no change here.
--
-- Dropping NOT NULL is safe for the UNIQUE indexes: Postgres treats NULLs
-- as distinct, so any number of profile-incomplete Google users coexist
-- without colliding on phone_e164. The +855 CHECK also stays as written -
-- a CHECK passes when the value is NULL, since it only rejects on a
-- definite false.
--
-- provider/provider_subject identify the account at the provider.
-- provider_subject is Google's "sub" claim: stable for the life of the
-- account and, unlike email, never reassigned or changed by the user, so
-- it is the only safe key to match a returning user on. The UNIQUE is
-- composite because subjects are only unique WITHIN a provider.
-- ============================================================

ALTER TABLE app_user ALTER COLUMN phone_e164 DROP NOT NULL;
ALTER TABLE app_user ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE app_user ADD COLUMN provider TEXT NOT NULL DEFAULT 'LOCAL'
    CHECK (provider IN ('LOCAL','GOOGLE'));

ALTER TABLE app_user ADD COLUMN provider_subject TEXT;

ALTER TABLE app_user ADD CONSTRAINT uq_provider_subject
    UNIQUE (provider, provider_subject);
