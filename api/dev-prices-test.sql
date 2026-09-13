-- Drops the ticket prices on a HANDFUL of events to 0.10 USD, so a live ABA
-- PayWay payment can be driven end to end for pocket change.
--
--   docker exec -i event-booking-postgres \
--     psql -U postgres -d event_booking < api/dev-prices-test.sql
--
-- DEV ONLY, and not a Flyway migration: it lives outside db/migration on
-- purpose so it never runs on its own.
--
-- ---------------------------------------------------------------------------
-- WHY ONLY A FEW EVENTS
--
-- This used to set EVERY price on the platform to 0.10. That made the whole
-- catalogue cost ten cents, so every screen that shows money - the organiser
-- dashboards, "revenue by event", the admin payments table - described a
-- platform where nothing costs anything, and a $0.10 line item stopped being a
-- signal that you were looking at a test event.
--
-- Five events are enough to test a payment against. The rest keep the seeded
-- prices, so the money on screen still looks like money.
--
-- Bookings already taken are left alone. booking_item snapshots
-- unit_price_usd_cents at checkout, which is the point of that column: an
-- existing booking keeps the price it was sold at, and the revenue history
-- stays true. Testing needs a NEW booking, not a revisited one.
-- ============================================================
BEGIN;

-- The five cheapest-to-reason-about live events: PUBLISHED, on sale, and with
-- room left. Chosen by id so the same five are picked every run.
CREATE TEMP TABLE test_events ON COMMIT DROP AS
SELECT id FROM event
 WHERE status = 'PUBLISHED'
 ORDER BY id
 LIMIT 5;

UPDATE event_zone SET price_usd_cents = 10
 WHERE event_id IN (SELECT id FROM test_events) AND price_usd_cents <> 10;

UPDATE seat_class SET price_usd_cents = 10
 WHERE event_id IN (SELECT id FROM test_events) AND price_usd_cents <> 10;

COMMIT;

\echo ''
\echo '--- events now priced for payment testing ---'
SELECT e.id, e.title_en,
       min(z.price_usd_cents) AS min_cents,
       max(z.price_usd_cents) AS max_cents
  FROM event e JOIN event_zone z ON z.event_id = e.id
 WHERE z.price_usd_cents = 10
 GROUP BY e.id, e.title_en ORDER BY e.id;

\echo '--- everything else keeps real prices ---'
SELECT count(*) AS zones_at_real_prices,
       '$' || round(min(price_usd_cents)/100.0, 2) || ' – $' || round(max(price_usd_cents)/100.0, 2) AS range
  FROM event_zone WHERE price_usd_cents <> 10;
