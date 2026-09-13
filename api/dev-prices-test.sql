-- Drops every ticket price to 0.10 USD so a live ABA PayWay payment can be
-- driven end to end for pocket change.
--
-- DEV ONLY, and not a Flyway migration: it lives outside db/migration on
-- purpose so it never runs on its own. Apply it by hand:
--
--   docker exec -i event-booking-postgres \
--     psql -U postgres -d event_booking < api/dev-prices-test.sql
--
-- dev-prices-restore.sql puts the seeded prices back, row by row.
--
-- Bookings already taken are left alone. booking_item snapshots
-- unit_price_usd_cents at checkout, which is the point of that column - an
-- existing booking keeps the price it was sold at, so testing needs a NEW
-- booking, not a revisited one.
BEGIN;

UPDATE seat_class SET price_usd_cents = 10 WHERE price_usd_cents <> 10;
UPDATE event_zone SET price_usd_cents = 10 WHERE price_usd_cents <> 10;

COMMIT;
