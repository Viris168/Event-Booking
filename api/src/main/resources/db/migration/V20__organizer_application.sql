-- ============================================================
-- V20: applying to become an organiser
-- ============================================================
--
-- Being an organiser is currently something that only happens to you. V6 seeds
-- three users with role ORGANIZER and V13 backfills their profiles; there is
-- no path from a signed-up CUSTOMER to an organiser account that does not go
-- through a hand-written UPDATE. This table is that path.
--
-- The invariant V13 established stays untouched:
--
--     a row in organizer_profile MEANS you are an organiser
--
-- which is why the pending request does not live there. venue.organizer_id and
-- event.organizer_id are FKs to organizer_profile.id, so a PENDING row in that
-- table would be handing out a usable ownership id to someone nobody has
-- approved yet, and OrganizerResolver's "no profile, no writes" would quietly
-- have to become "no APPROVED profile, no writes" - a status column that every
-- future reader has to remember to filter on. A separate table costs one JOIN
-- that nothing on the hot path performs, and keeps the invariant absolute.
--
-- The flow:
--
--     CUSTOMER submits ──> PENDING ──approve──> APPROVED
--                             │                    │ (app_user.role = ORGANIZER,
--                             │                    │  INSERT organizer_profile)
--                             └──reject───> REJECTED (may apply again)
--
--
-- DELIBERATELY NOT AN APPEND-ONLY LOG
-- ------------------------------------------------------------
-- V14 refused reviewed_at/reviewed_by on `event` and built event_review
-- instead, because an event is reviewed many times - rejected, resubmitted,
-- approved - and one column keeps only the last decision.
--
-- That reasoning does not transfer. An application is decided once and the
-- person is then an organiser for good; a second application is a second row,
-- not a second decision on this one. Columns hold the whole history here, and
-- copying V14's shape would buy a join table to store one row per parent.
-- ============================================================


CREATE TABLE organizer_application (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

    -- ------------------------------------------------------------
    -- What the applicant claims. Copied into organizer_profile on approval.
    -- ------------------------------------------------------------
    -- Both names NOT NULL because organizer_profile.org_name_km is NOT NULL
    -- (V1 line 31). Accepting a nullable Khmer name here only defers the
    -- constraint violation to the approval INSERT, where it surfaces as an
    -- admin action failing rather than as a form the applicant can fix.
    org_name_en     TEXT NOT NULL,
    org_name_km     TEXT NOT NULL,

    -- A handle the admin can contact ("@sokha"). NOT organizer_profile
    -- .telegram_chat_id, which is the numeric id the bot sends to and can only
    -- be learned once the organiser messages the bot. Approval leaves that
    -- column NULL (it is nullable) rather than copying a handle into it.
    telegram_handle TEXT,
    facebook_url    TEXT,

    -- Free text, both of them: "Concert, Conference" and whatever the
    -- applicant wants the reviewer to know. Neither is queried.
    event_types     TEXT,
    message         TEXT,

    -- ------------------------------------------------------------
    -- The decision
    -- ------------------------------------------------------------
    status          TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    admin_note      TEXT,
    reviewed_by     BIGINT REFERENCES app_user(id),   -- the admin, an app_user.id
    reviewed_at     TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A decided row names who decided and when; a pending one names neither.
    -- Without this the "reviewed by" line in the admin table renders blank for
    -- rows that were updated by anything other than the review endpoint.
    CONSTRAINT organizer_application_review_consistent CHECK (
        (status = 'PENDING'  AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR
        (status <> 'PENDING' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),

    -- Same reasoning as V14's event_review_message_required: a rejection the
    -- applicant cannot act on is worse than no rejection. An approval has
    -- nothing to explain.
    CONSTRAINT organizer_application_note_required CHECK (
        status <> 'REJECTED'
        OR (admin_note IS NOT NULL AND length(btrim(admin_note)) > 0)
    )
);

COMMENT ON TABLE organizer_application IS
    'A request to become an organiser. On APPROVE the service promotes app_user.role and creates the organizer_profile row; this table keeps why.';


-- ------------------------------------------------------------
-- One open application per person
-- ------------------------------------------------------------
-- organizer_profile.user_id is UNIQUE, so the approved end of this is already
-- capped at one. The unguarded end is not: without this, a refresh-happy
-- applicant fills the admin queue with identical rows.
--
-- Partial rather than plain UNIQUE for the reason V14 gave uq_event_slug_live:
-- rejected rows are kept forever for the audit trail, and a plain UNIQUE would
-- let one rejection bar the user from ever applying again.
CREATE UNIQUE INDEX uq_organizer_application_pending
    ON organizer_application (user_id)
    WHERE status = 'PENDING';


-- ------------------------------------------------------------
-- The admin queue
-- ------------------------------------------------------------
-- Partial, like idx_event_pending_review: the queue asks for one status and
-- sorts by wait time, and decided rows will outnumber pending ones forever.
CREATE INDEX idx_organizer_application_pending
    ON organizer_application (submitted_at)
    WHERE status = 'PENDING';

-- "Have I applied before, and what happened?" - the applicant's own view,
-- newest first. Covers every status, unlike the queue index above.
CREATE INDEX idx_organizer_application_user
    ON organizer_application (user_id, submitted_at DESC);
