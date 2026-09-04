-- ============================================================
-- V14: event review lifecycle
-- ============================================================
--
-- V1 gave the event three states:
--
--     CHECK (status IN ('DRAFT','PUBLISHED','TAKEN_DOWN'))
--
-- which describes a world where an organiser publishes their own event and
-- the platform only reacts afterwards, by taking it down. The product needs
-- the opposite order: nothing reaches customers until a human has looked at
-- it. That needs four more states and somewhere to record who decided what.
--
-- The full set after this migration:
--
--     DRAFT ──submit──> PENDING_REVIEW ──approve────> APPROVED ──publish──> PUBLISHED
--       ^                   │  │                                               │
--       │                   │  └──reject──────────> REJECTED (terminal)        │
--       └──withdraw─────────┘  │                                               │
--       ^                      └──request changes──> CHANGES_REQUESTED         │
--       └─────────────────────────────resubmit───────────┘                     │
--                                                                              v
--                                                                        TAKEN_DOWN
--
-- APPROVED is deliberately not PUBLISHED. Approval says the platform is
-- satisfied; it does not say the organiser is ready to go on sale. Keeping
-- them apart is what lets an organiser hold an approved event back for a
-- launch date. The state machine in the service layer owns these edges - the
-- CHECK below only constrains the vocabulary, not the order.
--
-- The three sell-side guards (EventServiceimpl.verifyEventIsOnSale,
-- HoldServiceimpl, ZoneHoldServiceimpl) all test `!= PUBLISHED`, so every
-- new state is non-sellable without touching them.
-- ============================================================


-- ------------------------------------------------------------
-- 1. The status vocabulary
-- ------------------------------------------------------------
-- Named constraints, not the inline UNIQUE/CHECK V1 used: an unnamed one gets
-- an auto-generated name that a later migration has to guess at. These are
-- the names Postgres happened to pick, pinned so the next change can drop
-- them by name with no archaeology.

ALTER TABLE event DROP CONSTRAINT event_status_check;

ALTER TABLE event ADD CONSTRAINT event_status_check CHECK (status IN (
    'DRAFT',
    'PENDING_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
    'REJECTED',
    'PUBLISHED',
    'TAKEN_DOWN'
));


-- ------------------------------------------------------------
-- 2. When it entered the queue
-- ------------------------------------------------------------
-- Nullable and on the event itself because it is lifecycle state, not audit:
-- the review queue sorts by it ("waiting longest first") and the organiser's
-- banner counts from it. It is reset to NULL on withdraw so a resubmitted
-- event does not claim to have been waiting since its first attempt.
--
-- Deliberately absent: reviewed_at / reviewed_by. Those look symmetrical but
-- an event can be reviewed many times - rejected, resubmitted, approved - and
-- a single column keeps only the last one, silently destroying the history
-- the organiser is owed. That history lives in event_review below.

ALTER TABLE event ADD COLUMN submitted_at TIMESTAMPTZ;

COMMENT ON COLUMN event.submitted_at IS
    'When the event most recently entered PENDING_REVIEW. NULL when it has never been submitted, or was withdrawn.';


-- ------------------------------------------------------------
-- 3. The transition log
-- ------------------------------------------------------------
-- Append-only: rows are never updated or deleted, so the sequence of
-- decisions on an event is reconstructible forever. This is what the amber
-- "Changes requested" banner reads (the latest REQUEST_CHANGES row) and what
-- an organiser sees as their submission history.
--
-- actor_id, not reviewer_id: organiser actions (SUBMIT, WITHDRAW) belong in
-- the same timeline as admin ones, otherwise "resubmitted after changes" is
-- invisible and the log cannot explain how the event reached its state.
--
-- from_status/to_status are stored rather than derived. Replaying the log to
-- work out what a transition meant would break the moment the state machine
-- changes, and this table is meant to outlive its own code.

CREATE TABLE event_review (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    actor_id        BIGINT NOT NULL REFERENCES app_user(id),
    action          TEXT NOT NULL
                        CHECK (action IN ('SUBMIT','WITHDRAW','APPROVE','REJECT','REQUEST_CHANGES')),
    -- Required for the two actions the organiser has to act on; an approval
    -- needs no explanation and a submit has nothing to explain.
    message         TEXT,
    from_status     TEXT NOT NULL,
    to_status       TEXT NOT NULL,

    -- The reviewable fields as they stood at this decision. Written on APPROVE
    -- and on SUBMIT; null on the others, which change no content.
    --
    -- This is what turns a re-review into a diff. Without it an admin looking
    -- at a resubmitted event has to re-read the whole thing to find the one
    -- word that changed, because nothing records what they approved last time.
    -- JSONB rather than a shadow event table: the snapshot is read for display
    -- and never joined or updated, and a second copy of the event schema is a
    -- second thing to keep in step with the first.
    snapshot        JSONB,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT event_review_message_required CHECK (
        action NOT IN ('REJECT','REQUEST_CHANGES')
        OR (message IS NOT NULL AND length(btrim(message)) > 0)
    )
);

COMMENT ON TABLE event_review IS
    'Append-only log of every review-lifecycle transition. Never updated, never deleted.';

-- Newest first for one event: the banner wants the latest row, the history
-- view wants all of them in order.
CREATE INDEX idx_event_review_event ON event_review (event_id, created_at DESC);


-- ------------------------------------------------------------
-- 4. The admin queue
-- ------------------------------------------------------------
-- Partial: the queue only ever asks for one status, and indexing the other
-- six would be dead weight on a table where PUBLISHED rows dominate.

CREATE INDEX idx_event_pending_review
    ON event (submitted_at)
    WHERE status = 'PENDING_REVIEW';


-- ------------------------------------------------------------
-- 5. Stop a rejected event from burning its slug
-- ------------------------------------------------------------
-- event.slug is UNIQUE and a rejected event keeps its row forever (the
-- organiser is owed the reason, and admin the audit trail). Under a plain
-- UNIQUE that permanently reserves the good URL: reject
-- "royal-ballet-2026" once and every later attempt has to be
-- "royal-ballet-2026-v2", which is what customers then see.
--
-- A partial index scopes uniqueness to events that still matter. Two
-- rejected events may share a slug; a live one is still unique against every
-- other live one.

ALTER TABLE event DROP CONSTRAINT event_slug_key;

CREATE UNIQUE INDEX uq_event_slug_live
    ON event (slug)
    WHERE status <> 'REJECTED';
