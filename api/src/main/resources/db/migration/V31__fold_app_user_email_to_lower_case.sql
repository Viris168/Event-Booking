-- ============================================================
-- V31 - app_user.email is matched case-insensitively
--
-- V1 gave email a plain UNIQUE, and Postgres compares text byte for byte.
-- Nothing between the request and the insert ever folded the case, so
-- 'Vannara@gmail.com' and 'vannara@gmail.com' are two different addresses
-- both to that constraint and to the existsByEmail checks placed in front
-- of it.
--
-- That difference is not cosmetic here. loginWithGoogle refuses to mint a
-- second account when the address already belongs to a local one - it is the
-- guard that stops the pre-hijack AuthService describes - and it asks with =.
-- Google always returns a lower-case address; a person typing theirs into the
-- registration form does not. Register as 'Vannara@gmail.com', sign in with
-- Google as 'vannara@gmail.com', and the guard matches nothing, the UNIQUE
-- matches nothing, and one person now holds two accounts with their bookings
-- split between them. That is the exact outcome V24 was written to prevent,
-- reached by walking around the comparison rather than through it.
--
-- Folding the stored value is what makes the column agree with the question
-- the service asks of it. The index is the real guarantee, as everywhere else
-- on this table: normalising in Java alone would hold only until the next
-- caller forgets, and two simultaneous registrations can still pass an
-- application check that the index then correctly refuses.
--
-- app_user_email_key (V1's inline UNIQUE) is deliberately left in place. It is
-- implied by this index rather than contested by it, and dropping a constraint
-- to put a stricter one in its place opens a window - however brief - in which
-- neither is enforced. V24 left uq_provider_subject standing for the same
-- reason.
-- ============================================================

-- Two accounts already differing only by case cannot both survive the fold.
-- Failing here names them; letting the UPDATE run would raise a bare 23505 on
-- app_user_email_key that says nothing about which rows to look at, and
-- merging two people's bookings is not a decision a migration should take on
-- its own.
DO $$
DECLARE
    clashes TEXT;
BEGIN
    SELECT string_agg(folded, ', ' ORDER BY folded)
      INTO clashes
      FROM (
          SELECT lower(email) AS folded
            FROM app_user
           WHERE email IS NOT NULL
           GROUP BY lower(email)
          HAVING count(*) > 1
      ) AS duplicated;

    IF clashes IS NOT NULL THEN
        RAISE EXCEPTION
            'app_user.email cannot be folded to lower case: % held by more than one account.',
            clashes
            USING HINT = 'Merge or clear the duplicate accounts by hand, then re-run this migration.';
    END IF;
END $$;

UPDATE app_user
   SET email = lower(email)
 WHERE email IS NOT NULL
   AND email <> lower(email);

-- Partial for the reason V24's is: email is null for every account that has
-- never supplied one, and there is no sense indexing those rows. A query of
-- the form lower(email) = lower(?) still reaches it - = is strict, so a null
-- email cannot satisfy it, and Postgres proves the predicate holds.
CREATE UNIQUE INDEX uq_app_user_email_lower
    ON app_user (lower(email))
    WHERE email IS NOT NULL;
