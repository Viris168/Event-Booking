-- Ties an ABA PayWay transaction to the booking it is paying for.
--
-- Without this the PayWay lane was an island: check-transaction could tell us
-- the money had landed, but nothing knew which booking to confirm, so no
-- booking ever reached CONFIRMED and no tickets were ever issued.
--
-- Nullable on purpose: the column is new, every row that predates it has no
-- booking, and the standalone /api/payment/create-qr call (no booking_id in
-- the payload) is still allowed for gateway testing.
ALTER TABLE payments
    ADD COLUMN booking_id BIGINT REFERENCES booking(id);

CREATE INDEX idx_payments_booking_id ON payments (booking_id);
