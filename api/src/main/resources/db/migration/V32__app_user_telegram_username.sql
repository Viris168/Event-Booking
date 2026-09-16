-- ============================================================
-- V32 - app_user.telegram_username
--
-- Telegram is already the channel this platform reaches people on: V28 gave
-- organizer_profile a telegram_chat_id so the bot can message an organiser,
-- and V20 gave organizer_application a telegram_handle so a reviewer can reach
-- an applicant before either of those exists. Neither covers an ordinary
-- account. A customer whose payment needs chasing, or whose refund needs a
-- word, is reachable only by the phone number they signed in with - and in
-- Cambodia that number is a Telegram account far more reliably than it is a
-- line anyone answers.
--
-- So this is contact information, stored on the account and supplied by its
-- owner from the account panel. It is NOT a sign-in method and nothing here
-- treats it as one: no unique index, and no bearing on authentication. Two
-- people typing the same handle is a mistake one of them made about their own
-- contact details, not a collision the database should arbitrate - unlike
-- email, which V31 indexes precisely because loginWithGoogle matches on it.
--
-- The CHECK is Telegram's own rule: 5-32 characters of [A-Za-z0-9_]. It is
-- here rather than only in AuthService for the reason V25's phone checks are -
-- the column outlives any one caller, and the seed scripts and psql sessions
-- that write to this table directly never pass through the service at all.
-- Null passes, as a CHECK on an unknown value always does, which is what makes
-- the column optional.
--
-- Stored bare: no leading @, no t.me/ prefix. Those are how a handle is
-- WRITTEN, not what it is, and someone pasting "https://t.me/sokha" into the
-- form means the same person as someone typing "sokha". AuthService strips
-- both before the value ever reaches this constraint, and web/src/lib/
-- contactLinks.js already builds the link back up the same way for organiser
-- handles.
-- ============================================================

ALTER TABLE app_user ADD COLUMN telegram_username TEXT;

ALTER TABLE app_user ADD CONSTRAINT app_user_telegram_username_check
    CHECK (telegram_username ~ '^[A-Za-z0-9_]{5,32}$');
