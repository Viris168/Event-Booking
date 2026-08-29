-- ============================================================
-- V11 - PayWay hosted checkout form
--
-- The ABA lane stops asking PayWay for a QR to render itself and instead
-- follows the official plugin: the server signs a purchase form, the browser
-- posts it to PayWay, and PayWay's own checkout page (rendered by its plugin
-- script) draws the QR. checkout_form stores that signed form (action + hidden
-- fields, JSON) so a page reload re-renders the same transaction instead of
-- signing a second one.
--
-- qr_payload stays NULL on the ABA lane, exactly as V4 anticipated
-- ("NULL for providers that redirect").
-- ============================================================

ALTER TABLE payment_transaction
    ADD COLUMN checkout_form TEXT;

COMMENT ON COLUMN payment_transaction.checkout_form IS
    'ABA lane: signed checkout form (JSON: action + hidden fields) the browser posts to PayWay. NULL for Bakong.';
