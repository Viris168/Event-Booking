-- ------------------------------------------------------------
-- V23: the inbox.
--
-- Every role already learns things by going and looking: the customer
-- refreshes a booking to see whether the payment landed, the organiser
-- reopens /organizer to find out an event was approved overnight, and the
-- admin discovers a submitted event only by opening the review queue.
-- Nothing in the product can tell someone that something happened to them.
--
-- One table for all three roles rather than one per role. The recipient is
-- an app_user row and the role is already on it, so "notify every admin" is
-- a query, not a schema. Three tables would triple every index and force a
-- union on the only screen that reads them.
-- ------------------------------------------------------------

CREATE TABLE notification (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- CASCADE because a notification has no meaning apart from the person it
    -- was addressed to. Nothing else in the schema points at this row, so
    -- there is nothing to orphan by removing it with its recipient.
    recipient_user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,

    -- A NotificationType name. Text rather than a Postgres enum for the same
    -- reason scan_log.action is: adding a notification is then a code change,
    -- not a migration that takes a lock on a table the whole app writes to.
    type              TEXT NOT NULL,

    -- The nouns the sentence needs - bookingRef, eventTitleEn/Km, amount -
    -- never the sentence itself.
    --
    -- This is the whole reason the column exists. The UI is EN/KM and the
    -- locale is a per-viewer toggle, not an account setting: storing
    -- "Your booking BK-4821 is confirmed" would pin that row to English for
    -- the rest of its life, and a Khmer reader would find their inbox in a
    -- language they did not pick. The client renders type + params through
    -- the same i18n dictionary as the rest of the chrome, so flipping the
    -- toggle re-reads history too.
    params            JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Where clicking it goes. Held rather than derived from the type because
    -- two notifications of one type can point at different rows, and the
    -- server is the side that knows the id.
    link_url          TEXT,

    -- What makes this occurrence distinct - a booking ref, an event id, an
    -- application id.
    --
    -- NOT NULL on purpose: it is required so that writing a notification
    -- forces the author to answer "what would make this the same event
    -- twice". PaymentService polls the provider and BookingService retries,
    -- so a settled payment is genuinely observed more than once; without the
    -- unique index below, the customer's inbox would fill with the same good
    -- news.
    dedupe_key        TEXT NOT NULL,

    -- Null until opened. A timestamp rather than a boolean so "unread since
    -- when" stays answerable, which is what a digest email would need later.
    read_at           TIMESTAMPTZ,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The write guard. One occurrence, one row, per person: the same approval
-- observed twice inserts once and the second attempt is swallowed.
CREATE UNIQUE INDEX uq_notification_dedupe
    ON notification (recipient_user_id, type, dedupe_key);

-- The inbox itself, newest first - the only ordering the list is ever read in.
CREATE INDEX idx_notification_inbox
    ON notification (recipient_user_id, created_at DESC);

-- The badge. Partial, because the count is only ever taken over unread rows,
-- and this keeps the index the size of what is actually pending rather than
-- the size of everything that has ever been sent.
CREATE INDEX idx_notification_unread
    ON notification (recipient_user_id)
    WHERE read_at IS NULL;
