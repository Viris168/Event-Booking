-- Clear the seeder's placeholder venue pin.
--
-- Every venue DatabaseSeeder created was given the same coordinates,
-- 11.5540 / 104.9388, along with the same invented address. Six buildings
-- scattered across Phnom Penh therefore all claimed one point on Koh Pich -
-- Morodok Techo is 14km north in Chroy Changvar, Olympic Stadium is in
-- Prampir Makara.
--
-- A wrong pin is worse than no pin. A null venue is honestly unplaceable and
-- the organiser form now asks for a Google Maps link to fix it; a placeholder
-- one looks like real data, plots a marker, and stacks silently with five
-- others. So these are set back to NULL rather than guessed at - the seeder
-- itself now writes each venue's real location, and anything already in a
-- database gets re-pinned deliberately, through the form, with the map
-- confirmation step in front of it.
--
-- Scoped to the exact placeholder pair. A venue that a human has since pinned
-- has different coordinates and is untouched; matching the pair rather than a
-- radius means this cannot reach a real pin that merely sits nearby. The
-- seeder is @Profile("dev"), so on a production database this is a no-op.
UPDATE venue
SET lat = NULL,
    lng = NULL
WHERE lat = 11.5540
  AND lng = 104.9388;
