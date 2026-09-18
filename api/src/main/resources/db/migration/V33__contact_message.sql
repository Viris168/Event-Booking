-- ============================================================
-- V33 - contact_message
--
-- Somewhere for a message from outside to land.
--
-- Every inbound channel this platform has so far requires an account first.
-- V20 gives a signed-in CUSTOMER a way to ask for an organiser role, V28 and
-- V32 record handles so that WE can reach a known person, and V23's
-- notification table only ever points inward at an app_user. None of that
-- helps a visitor who has not signed up, or a ticket holder who cannot sign in
-- and therefore cannot use any screen that would let them say so - which is
-- the single most likely reason somebody needs to reach support at all.
--
-- So this table is deliberately reachable with no token. That is its purpose
-- and also its whole risk profile, which is why the shape below is stricter
-- than any other write in the schema.
--
--
-- NOT AN app_user ROW, AND NOT A NOTIFICATION
-- ------------------------------------------------------------
-- user_id is nullable, and that nullability is the point. An anonymous sender
-- is the expected case, not a degraded one. When the sender did happen to be
-- signed in the column is filled, because knowing which account wrote in turns
-- "my ticket did not arrive" from a question into an answerable one - but
-- nothing here requires it, and no read path may assume it.
--
-- The reply does NOT go through notification. That table reaches an app_user
-- by id, and the sender of the average row here has no id. Replies leave by
-- the channel the sender gave us (their email, their Telegram handle), which
-- is why reply_to is captured as free text rather than resolved to an account.
--
--
-- WHY status IS A COLUMN AND NOT A SEPARATE LOG
-- ------------------------------------------------------------
-- Same reasoning V20 set out for organizer_application, and the same
-- conclusion. V14 built event_review as a log because an event is judged over
-- and over. A support message is read once and dealt with once; a second
-- question is a second message, not a second verdict on this one. Columns
-- hold it.
-- ============================================================


CREATE TABLE contact_message (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- ------------------------------------------------------------
    -- Who wrote in
    -- ------------------------------------------------------------
    -- Nullable, and usually null - see the header. ON DELETE SET NULL rather
    -- than CASCADE: if the account goes, the message must not go with it. An
    -- unresolved complaint is not less true because its author closed their
    -- account, and a support inbox that silently loses rows when a user is
    -- deleted is one nobody can reconcile.
    user_id     BIGINT REFERENCES app_user(id) ON DELETE SET NULL,

    -- What they typed, not what their account says. Even for a signed-in
    -- sender these are captured as given: someone writing about a family
    -- member's booking puts a different name and a different address in the
    -- form, and overwriting that with the account's own details would send the
    -- reply to the wrong person.
    sender_name TEXT NOT NULL,

    -- The address a reply goes to. NOT NULL because a message nobody can
    -- answer is a message that wastes the reader's time as well as the
    -- sender's; the form requires it for the same reason.
    --
    -- The CHECK is shape only - one @, something either side, a dot in the
    -- domain. It is not an attempt to validate an address properly, which
    -- cannot be done by pattern and is settled by whether the reply arrives.
    -- It is here to catch a typed-in sentence, and it lives on the column
    -- rather than only in the DTO because seed scripts and psql sessions never
    -- pass through Jakarta validation.
    reply_to    TEXT NOT NULL
                    CHECK (reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

    -- Optional second channel. Bare handle, no @ and no t.me/ prefix - the
    -- same normalisation V32 settled on for app_user.telegram_username, and
    -- the same CHECK, so web/src/lib/contactLinks.js can rebuild the link from
    -- either column without caring which it read.
    telegram_username TEXT
                    CHECK (telegram_username ~ '^[A-Za-z0-9_]{5,32}$'),

    -- ------------------------------------------------------------
    -- What they wrote
    -- ------------------------------------------------------------
    -- Routing, chosen from a fixed list on the form. A CHECK rather than free
    -- text because the admin inbox filters on it, and a filter over strings
    -- the sender invented filters nothing.
    topic       TEXT NOT NULL
                    CHECK (topic IN ('BOOKING','PAYMENT','ORGANIZER','TECHNICAL','OTHER')),

    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,

    -- Context the sender should not have to find, and could not be trusted to
    -- report accurately anyway. Free text: it is quoted back to whoever reads
    -- the message and is never joined on, because the reference the sender
    -- pasted may well not exist - a mistyped booking code is itself a useful
    -- thing for support to see.
    booking_ref TEXT,

    -- ------------------------------------------------------------
    -- Handling it
    -- ------------------------------------------------------------
    -- NEW -> OPEN -> CLOSED, and NEW -> SPAM. Deliberately small: this is a
    -- three-admin platform (ADMIN_LIMIT_REACHED caps it), so anything
    -- resembling a ticketing workflow would be ceremony nobody performs.
    status      TEXT NOT NULL DEFAULT 'NEW'
                    CHECK (status IN ('NEW','OPEN','CLOSED','SPAM')),

    -- Admin-only. The sender never sees this, which is what lets it hold
    -- "duplicate of #412" and "phoned instead".
    admin_note  TEXT,

    handled_by  BIGINT REFERENCES app_user(id),
    handled_at  TIMESTAMPTZ,

    -- Not from the sender. Their own clock is not evidence of anything and the
    -- inbox sorts on this.
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The same consistency rule V20 applies to its review columns: a row that
    -- has been dealt with names who dealt with it and when; an untouched one
    -- names neither. Without it the "handled by" cell renders blank for any
    -- row updated by something other than the admin endpoint.
    CONSTRAINT contact_message_handled_consistent CHECK (
        (status = 'NEW' AND handled_by IS NULL AND handled_at IS NULL)
        OR
        (status <> 'NEW' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

COMMENT ON TABLE contact_message IS
    'Inbound support messages from the public contact form. Reachable without a token; user_id is filled only when the sender happened to be signed in.';


-- ------------------------------------------------------------
-- The inbox
-- ------------------------------------------------------------
-- Partial on the two statuses that still need somebody, for the reason V20's
-- idx_organizer_application_pending is partial: handled rows outnumber live
-- ones permanently, and the queue never asks for them.
CREATE INDEX idx_contact_message_open
    ON contact_message (received_at DESC)
    WHERE status IN ('NEW', 'OPEN');

-- The full inbox, every status, newest first - the view an admin gets when
-- they clear the queue and go looking for something they answered last week.
CREATE INDEX idx_contact_message_received
    ON contact_message (received_at DESC);

-- "Has this person written in before?" Partial because the column is null for
-- most rows and an index over those nulls is dead weight on every insert.
CREATE INDEX idx_contact_message_user
    ON contact_message (user_id, received_at DESC)
    WHERE user_id IS NOT NULL;
