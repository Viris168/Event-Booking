-- ============================================================
-- Dev seed, part four: one event for every state worth testing.
--
--   docker exec -i event-booking-postgres psql -U postgres \
--     -v ON_ERROR_STOP=1 -d event_booking < api/dev-seed-statuses.sql
--
-- Run AFTER dev-seed-all.sql. Additive and re-runnable: it removes its own
-- previous output first, matching on the 'zz-' slug prefix every event here
-- carries.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- The main seed covers all seven lifecycle statuses, but only one or two events
-- each, and it leaves the interesting COMBINATIONS empty. Lifecycle status and
-- sales state are independent - an event can be PUBLISHED and finished, or
-- PUBLISHED and sold out, or PUBLISHED and not yet on sale - and every one of
-- those takes a different path through the product:
--
--   * PUBLISHED + finished      organiser may take it down whatever it sold,
--                               admin may NOT reopen it, hidden from browse
--   * PUBLISHED + sold out      still on sale by the clock, nothing left
--   * PUBLISHED + not yet open  listed, but nobody can buy
--   * PUBLISHED + sales closed  the window shut, the show is still coming
--   * TAKEN_DOWN + upcoming     hidden from browse, page still readable,
--                               admin may reopen
--   * TAKEN_DOWN + finished     hidden, page readable, reopen REFUSED
--
-- Several rows per queue status too, so the review queue and the applications
-- screen have something to page and step through rather than a single row.
--
-- Dates are relative to now(), so this file does not rot: re-run it in six
-- months and "finished last week" is still finished last week.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------ re-runnable ---
DELETE FROM event_review WHERE event_id IN (SELECT id FROM event WHERE slug LIKE 'zz-%');
DELETE FROM event_zone   WHERE event_id IN (SELECT id FROM event WHERE slug LIKE 'zz-%');
DELETE FROM event        WHERE slug LIKE 'zz-%';

-- ----------------------------------------------------------------- events ---
-- organizer_id 1/2/3 are the three seeded organisers; venue 1..5 are theirs.
-- Every row is ZONED, because the zone below is what gives it a price and a
-- capacity - a SEATED event with no seat map would be untestable in a different
-- way and the main seed already has two of those.
INSERT INTO event (organizer_id, venue_id, inventory_mode, slug, title_en, title_km,
                   description_en, description_km, status, category, cover,
                   starts_at, doors_open_at, sales_open_at, sales_close_at, submitted_at)
VALUES
    -- PUBLISHED, already over. The case the main seed never had: still
    -- published, but finished - so its organiser may take it down and no admin
    -- may put it back.
    (1, 1, 'ZONED', 'zz-finished-jazz', 'Riverside Jazz (last month)', 'ជាហ្ស៍មុនខែ',
     'A night that has already happened. Published, finished, never taken down.', 'បានប្រព្រឹត្តទៅរួចហើយ។',
     'PUBLISHED', 'music', 2,
     now() - interval '32 days', now() - interval '32 days' - interval '1 hour',
     now() - interval '120 days', now() - interval '33 days', now() - interval '150 days'),

    (3, 3, 'ZONED', 'zz-finished-run', 'Coastline Fun Run (last week)', 'រត់ឆ្នេរសប្តាហ៍មុន',
     'Finished a week ago and still on sale by its status alone.', 'បានបញ្ចប់កាលពីសប្តាហ៍មុន។',
     'PUBLISHED', 'sport', 4,
     now() - interval '6 days', now() - interval '6 days' - interval '1 hour',
     now() - interval '90 days', now() - interval '7 days', now() - interval '100 days'),

    -- A run of finished events across the three organisers and across time, so
    -- "past" is a list rather than a single row: the organiser dashboard's Past
    -- tab, the admin table's Finished pill and the catalogue's date filter all
    -- want more than one subject to be worth looking at.
    (2, 2, 'ZONED', 'zz-finished-lantern', 'Lantern Night (3 months ago)', 'រាត្រីចង្កៀង៣ខែមុន',
     'Sold well and finished. Its revenue still counts.', 'បានលក់អស់ និងបញ្ចប់។',
     'PUBLISHED', 'festival', 3,
     now() - interval '92 days', now() - interval '92 days' - interval '1 hour',
     now() - interval '200 days', now() - interval '93 days', now() - interval '210 days'),

    (3, 5, 'ZONED', 'zz-finished-comedy', 'Crab Market Comedy (6 weeks ago)', 'កំប្លែងផ្សារក្ដាម',
     'A small room that filled up. Finished sold out.', 'បន្ទប់តូចដែលពេញ។',
     'PUBLISHED', 'comedy', 9,
     now() - interval '44 days', now() - interval '44 days' - interval '1 hour',
     now() - interval '150 days', now() - interval '45 days', now() - interval '160 days'),

    (1, 1, 'ZONED', 'zz-finished-recital', 'Chaktomuk Recital (yesterday)', 'ការសម្តែងចក្តុមុខ',
     'Finished yesterday - the freshest past event, for testing the boundary.', 'បានបញ្ចប់ម្សិលមិញ។',
     'PUBLISHED', 'culture', 6,
     now() - interval '1 day', now() - interval '1 day' - interval '1 hour',
     now() - interval '60 days', now() - interval '2 days', now() - interval '70 days'),

    (2, 4, 'ZONED', 'zz-finished-film', 'Battambang Film Night (last year)', 'យប់ភាពយន្តឆ្នាំមុន',
     'Old enough to fall outside the twelve-month revenue chart.', 'ចាស់ជាងមួយឆ្នាំ។',
     'PUBLISHED', 'culture', 5,
     now() - interval '400 days', now() - interval '400 days' - interval '1 hour',
     now() - interval '500 days', now() - interval '401 days', now() - interval '510 days'),

    (3, 3, 'ZONED', 'zz-finished-pulled', 'Beach Set (finished, then pulled)', 'ឆ្នេរបញ្ចប់ហើយដក',
     'Happened, and an admin pulled the listing afterwards. Cannot be reopened.', 'បានប្រព្រឹត្ត រួចដកចេញ។',
     'TAKEN_DOWN', 'music', 7,
     now() - interval '20 days', now() - interval '20 days' - interval '1 hour',
     now() - interval '120 days', now() - interval '21 days', now() - interval '130 days'),

    -- PUBLISHED but the sales window has not opened. Listed, unbuyable.
    (2, 2, 'ZONED', 'zz-notopen-gala', 'Winter Gala (sales open later)', 'ពិធីរដូវរងា',
     'Announced early. Nobody can buy for another month.', 'ប្រកាសមុន។ មិនទាន់លក់។',
     'PUBLISHED', 'culture', 5,
     now() + interval '120 days', now() + interval '120 days' - interval '1 hour',
     now() + interval '30 days', now() + interval '119 days', now() - interval '10 days'),

    -- PUBLISHED, window shut, show still ahead. Ticket holders still need the
    -- page: this is the case where hiding it would be wrong.
    (2, 4, 'ZONED', 'zz-closed-theatre', 'Heritage Night (sales closed)', 'រាត្រីបេតិកភណ្ឌ',
     'Sales shut yesterday; the performance is next week.', 'បិទការលក់ម្សិលមិញ។',
     'PUBLISHED', 'culture', 6,
     now() + interval '7 days', now() + interval '7 days' - interval '1 hour',
     now() - interval '60 days', now() - interval '1 day', now() - interval '70 days'),

    -- TAKEN_DOWN but still to come: hidden from browse, page readable, and an
    -- admin may reopen it.
    (1, 1, 'ZONED', 'zz-down-upcoming', 'Pulled Show (still upcoming)', 'កម្មវិធីដកចេញ',
     'Taken down by an admin. Reopening this one is allowed.', 'ត្រូវបានដកចេញ។',
     'TAKEN_DOWN', 'music', 8,
     now() + interval '45 days', now() + interval '45 days' - interval '1 hour',
     now() - interval '30 days', now() + interval '44 days', now() - interval '40 days'),

    -- Three more waiting on review, so the queue is a queue.
    (1, 1, 'ZONED', 'zz-review-a', 'Mekong Sunset Session', 'មេគង្គថ្ងៃលិច',
     'Submitted and waiting. Nothing wrong with it.', 'កំពុងរង់ចាំការត្រួតពិនិត្យ។',
     'PENDING_REVIEW', 'music', 1,
     now() + interval '70 days', now() + interval '70 days' - interval '1 hour',
     now() + interval '2 days', now() + interval '69 days', now() - interval '3 days'),

    (2, 2, 'ZONED', 'zz-review-b', 'Siem Reap Street Food Fair', 'ពិធីបុណ្យម្ហូបសៀមរាប',
     'A large capacity submission, for testing the capacity column.', 'ពិធីបុណ្យម្ហូប។',
     'PENDING_REVIEW', 'festival', 3,
     now() + interval '95 days', now() + interval '95 days' - interval '1 hour',
     now() + interval '5 days', now() + interval '94 days', now() - interval '2 days'),

    (3, 5, 'ZONED', 'zz-review-c', 'Kep Sunrise Yoga', 'យូហ្គាអរុណរះកែប',
     'A small one, priced low - the opposite end of the queue.', 'យូហ្គាពេលព្រឹក។',
     'PENDING_REVIEW', 'sport', 9,
     now() + interval '40 days', now() + interval '40 days' - interval '1 hour',
     now() + interval '1 day', now() + interval '39 days', now() - interval '1 day'),

    -- Decided, so the review queue's other tabs are not empty.
    (2, 2, 'ZONED', 'zz-changes', 'Angkor Light Parade', 'ក្បួនភ្លើងអង្គរ',
     'An admin asked for changes. The reason is on the review row.', 'ត្រូវការកែប្រែ។',
     'CHANGES_REQUESTED', 'festival', 5,
     now() + interval '80 days', now() + interval '80 days' - interval '1 hour',
     now() + interval '10 days', now() + interval '79 days', now() - interval '6 days'),

    (3, 3, 'ZONED', 'zz-rejected', 'Unlicensed Beach Party', 'ពិធីឆ្នេរគ្មានអាជ្ញាប័ណ្ណ',
     'Turned down. Terminal - it cannot be resubmitted.', 'ត្រូវបានបដិសេធ។',
     'REJECTED', 'music', 7,
     now() + interval '55 days', now() + interval '55 days' - interval '1 hour',
     now() + interval '5 days', now() + interval '54 days', now() - interval '8 days'),

    (1, 1, 'ZONED', 'zz-approved', 'Bassac Riverside Encore', 'បាសាក់ជុំទីពីរ',
     'Cleared review. Waiting on its organiser to publish it.', 'បានអនុម័ត រង់ចាំផ្សាយ។',
     'APPROVED', 'music', 2,
     now() + interval '110 days', now() + interval '110 days' - interval '1 hour',
     now() + interval '14 days', now() + interval '109 days', now() - interval '12 days'),

    -- Two more drafts, so the organiser dashboard has something unsubmitted.
    (3, 5, 'ZONED', 'zz-draft-a', 'Crab Market Acoustic', 'ផ្សារក្ដាមអាកូស្ទិក',
     'Still being written. Only its organiser can see it.', 'កំពុងសរសេរ។',
     'DRAFT', 'music', 4,
     now() + interval '150 days', now() + interval '150 days' - interval '1 hour',
     now() + interval '20 days', now() + interval '149 days', NULL),

    (2, 4, 'ZONED', 'zz-draft-b', 'Battambang Film Night', 'យប់ភាពយន្តបាត់ដំបង',
     'A second draft, for testing the draft filter.', 'សេចក្ដីព្រាងទីពីរ។',
     'DRAFT', 'culture', 6,
     now() + interval '200 days', now() + interval '200 days' - interval '1 hour',
     now() + interval '30 days', now() + interval '199 days', NULL);

-- ------------------------------------------------------------------ zones ---
-- One zone each, so every event above has a price and a capacity. The sold_qty
-- is set to the capacity on the sold-out one and left at zero elsewhere: the
-- others are meant to be bookable, and a sold_qty with no booking behind it is
-- exactly the inconsistency dev-seed-more.sql exists to avoid.
INSERT INTO event_zone (event_id, name_en, name_km, price_usd_cents, capacity, sold_qty)
SELECT e.id, 'General', 'ទូទៅ',
       CASE e.slug
           WHEN 'zz-review-c' THEN 500
           WHEN 'zz-notopen-gala' THEN 5500
           ELSE 2500
       END,
       CASE e.slug WHEN 'zz-review-b' THEN 2400 ELSE 300 END,
       0
FROM event e WHERE e.slug LIKE 'zz-%';

-- --------------------------------------------------------- sold out ---------
-- One PUBLISHED event with nothing left, so the "Sold out" pill has a subject.
-- Its capacity is dropped to what the seeded bookings would cover rather than
-- inventing sales with no bookings behind them.
UPDATE event_zone SET capacity = 300, sold_qty = 300
 WHERE event_id IN (SELECT id FROM event
                     WHERE slug IN ('zz-closed-theatre', 'zz-finished-comedy'));

-- ----------------------------------------------------------- review trail ---
-- A decision needs a row naming who made it: the organiser's status banner
-- reads the latest event_review, and a CHANGES_REQUESTED event with no reason
-- is one the organiser cannot act on.
INSERT INTO event_review (event_id, actor_id, action, message, from_status, to_status, created_at)
SELECT e.id, 1, 'REQUEST_CHANGES',
       'The sales window closes after the event starts, and the banner image is missing.',
       'PENDING_REVIEW', 'CHANGES_REQUESTED', now() - interval '5 days'
  FROM event e WHERE e.slug = 'zz-changes'
UNION ALL
SELECT e.id, 1, 'REJECT',
       'No venue licence attached, and the address does not match a venue we recognise.',
       'PENDING_REVIEW', 'REJECTED', now() - interval '7 days'
  FROM event e WHERE e.slug = 'zz-rejected'
UNION ALL
SELECT e.id, 1, 'APPROVE', NULL, 'PENDING_REVIEW', 'APPROVED', now() - interval '11 days'
  FROM event e WHERE e.slug = 'zz-approved';

COMMIT;

\echo ''
\echo '--- every status, and the sales state inside it ---'
SELECT e.status,
       count(*) AS events,
       count(*) FILTER (WHERE e.starts_at < now())                                     AS finished,
       count(*) FILTER (WHERE e.starts_at > now() AND e.sales_open_at > now())          AS not_open,
       count(*) FILTER (WHERE e.starts_at > now() AND e.sales_close_at < now())         AS sales_closed,
       count(*) FILTER (WHERE e.starts_at > now() AND e.sales_open_at <= now()
                                                  AND e.sales_close_at >= now())        AS on_sale
  FROM event e GROUP BY e.status ORDER BY e.status;
