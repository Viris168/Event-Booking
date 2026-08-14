-- ============================================================
-- V4 - Bakong KHQR polling (issue #31)
--
-- V1 modelled payment_transaction for a webhook-driven provider: a row is
-- opened, the provider calls back, the row is resolved. Bakong's open API has
-- no callback for merchant accounts - the integration polls
-- /v1/check_transaction_by_md5 instead - so the row has to carry three extra
-- things a poller needs and a webhook never did:
--
--   * the KHQR string itself, so a page reload re-renders the SAME QR instead
--     of minting a second one (a new QR means a new md5, a new provider_ref,
--     and a second open attempt for one booking),
--   * the poller's own bookkeeping (when it last asked, how many times), so
--     the sweep can order by staleness instead of re-checking everything,
--   * the settlement hash Bakong returns on success, which is a DIFFERENT
--     value from the md5 we poll with and is what a later refund has to quote.
--
-- provider_ref stays the md5 of qr_payload: it is the provider's handle on
-- this attempt and V1's uq_payment_txn_provider_ref already makes it unique,
-- which is one of the layers stopping a duplicate poll from settling twice.
-- ============================================================

ALTER TABLE payment_transaction
    ADD COLUMN qr_payload          TEXT,
    ADD COLUMN provider_txn_hash   TEXT,
    ADD COLUMN last_polled_at      TIMESTAMPTZ,
    ADD COLUMN poll_attempts       INTEGER NOT NULL DEFAULT 0 CHECK (poll_attempts >= 0),
    ADD COLUMN note                TEXT;

COMMENT ON COLUMN payment_transaction.qr_payload IS
    'The EMVCo/KHQR string handed to the customer. NULL for providers that redirect (PayWay).';
COMMENT ON COLUMN payment_transaction.provider_ref IS
    'Bakong: md5 of qr_payload, the key /v1/check_transaction_by_md5 is polled with.';
COMMENT ON COLUMN payment_transaction.provider_txn_hash IS
    'Bakong: the settled transaction hash, returned only once the money has landed.';
COMMENT ON COLUMN payment_transaction.note IS
    'Free text for the reconciler: decline reason, or a flag such as money arriving after the booking died.';

-- The poller''s work queue: attempts still open, oldest check first. Partial so
-- the index stays small - settled rows are kept forever as financial history
-- but are never polled again.
CREATE INDEX idx_payment_txn_open_poll
    ON payment_transaction (last_polled_at NULLS FIRST, id)
    WHERE status IN ('CREATED', 'PENDING');
