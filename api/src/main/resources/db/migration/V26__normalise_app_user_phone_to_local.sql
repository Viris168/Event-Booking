-- Bring every stored login number to the one spelling the client now sends.
--
-- V25 widened the CHECK to accept '+85512345678' and '012345678' alike, and
-- the web client moved to writing the second. Widening the column was right;
-- it just left the rows that were already there in the other spelling, and
-- phone_e164 is not a display field - it is the login identifier, matched by
-- findByPhoneE164 as a literal string:
--
--     WHERE phone_e164 = ?
--
-- So every account created before that change stopped being reachable. Not
-- disabled, not deleted - simply never found, and the honest single answer the
-- login endpoint gives ("invalid credentials", so a stranger cannot discover
-- which numbers hold an account) makes it look like a forgotten password.
-- Typing the stored '+855...' form does not help either: the client normalises
-- that to '0...' too, so there is no input that reaches the row.
--
-- Both spellings stay legal in the column, exactly as V25 left them. The
-- constraint describes what the database will accept; this describes what is
-- actually in it. One stored spelling is what makes the UNIQUE index mean
-- anything - '+85512345678' and '012345678' are one line to a person and two
-- rows to Postgres, which is a second account for a number that already has
-- one, and then neither logs in predictably.
--
-- app_user only. booking.buyer_phone_e164 is contact detail recorded as the
-- buyer typed it, never a lookup key, and it is handed to ABA PayWay inside a
-- signed payload; rewriting settled orders would change history to fix a
-- problem they do not have. payments.phone is copied from it and follows.

-- Refuse rather than guess if some number already exists in both spellings.
-- The UPDATE would hit the unique index and fail anyway, on a message naming
-- an index instead of the accounts - and merging two real accounts is a
-- decision about whose bookings survive, not something a migration should
-- silently make.
DO $$
DECLARE
    clashes text;
BEGIN
    SELECT string_agg(a.phone_e164 || ' / 0' || substring(a.phone_e164 from 5), ', ')
      INTO clashes
      FROM app_user a
     WHERE a.phone_e164 LIKE '+855%'
       AND EXISTS (SELECT 1
                     FROM app_user b
                    WHERE b.phone_e164 = '0' || substring(a.phone_e164 from 5));

    IF clashes IS NOT NULL THEN
        RAISE EXCEPTION
            'Both spellings exist for: %. Merge or delete one side, then re-run.',
            clashes;
    END IF;
END $$;

-- '+855' is four characters, so the subscriber digits start at position 5 and
-- the trunk '0' takes the place the country code held.
UPDATE app_user
   SET phone_e164 = '0' || substring(phone_e164 from 5)
 WHERE phone_e164 LIKE '+855%';
