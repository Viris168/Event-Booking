-- ------------------------------------------------------------
-- V16: the gate's audit trail.
--
-- ticket.checked_in_by records who admitted a ticket, and that is
-- the only thing the gate has ever written down. It cannot answer:
--
--   * how many forged codes were presented tonight  (the fraud signal)
--   * who reversed a check-in, and why
--   * whether the same refused code was tried at three doors
--
-- A refused scan writes no ticket row by design, so without this
-- table every refusal is invisible the moment the response is sent.
-- ------------------------------------------------------------

CREATE TABLE scan_log (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id            BIGINT NOT NULL REFERENCES event(id),
    operator_user_id    BIGINT NOT NULL REFERENCES app_user(id),

    -- SCAN | GROUP_CONFIRM | UNDO. Text rather than an enum type so a new
    -- gate action is a code change, not a migration with a lock on it.
    action              TEXT NOT NULL,

    -- A ScanOutcome name, or UNDONE.
    outcome             TEXT NOT NULL,

    -- Null whenever the presented code matched no ticket - which is exactly
    -- the case this table exists to record.
    ticket_id           BIGINT REFERENCES ticket(id),
    booking_id          BIGINT REFERENCES booking(id),

    -- SHA-256 of the presented string, NEVER the string itself. A scanned
    -- payload is a bearer credential: logging it verbatim would turn this
    -- table into a pile of working tickets, and audit tables are read by
    -- more people than the ticket table is. The digest still answers "was
    -- this same code tried at four doors" without holding anything usable.
    payload_fingerprint TEXT,

    note                TEXT,
    at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The organiser's "what happened at the door" view, newest first.
CREATE INDEX idx_scan_log_event_at ON scan_log (event_id, at DESC);

-- Repeat-offender lookup: the same refused code presented over and over.
-- Partial, because a fingerprint is only interesting when it did NOT work -
-- successful scans are already answerable from the ticket table.
CREATE INDEX idx_scan_log_fingerprint ON scan_log (payload_fingerprint)
    WHERE outcome <> 'VALID';
