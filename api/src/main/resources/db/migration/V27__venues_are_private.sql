-- Venues belong to one organiser again.
--
-- V21 made venue.organizer_id nullable so a NULL could mean "a shared platform
-- venue that any organiser may host at and maintain", and OrganizerResolver
-- grew requireOwnerOrShared to wave those through. The reasoning there was
-- sound about real buildings - Koh Pich and Olympic Stadium are hired by
-- everyone - but it is not how this platform is meant to work: an organiser's
-- venue list is theirs, and one organiser should not be able to see, edit,
-- retire, or schedule an event into another's room.
--
-- So sharing is withdrawn. requireOwnerOrShared is gone, GET /venue is scoped
-- to the caller, and the four write paths (venue update, venue deactivate,
-- venue seat map, and binding an event to a venue) all demand ownership.
--
-- The column stays NULLABLE. Restoring NOT NULL is the tidier schema and the
-- wrong migration: it would fail outright on any database that still holds a
-- shared venue, and there is no correct value to backfill - "which organiser
-- owns Olympic Stadium" is a question about the real world that a migration
-- cannot answer, and guessing hands one organiser another's building.

COMMENT ON COLUMN venue.organizer_id IS
    'Owning organizer_profile.id. Venues are private to their owner. NULL is a '
    'legacy shared venue from V21 and is no longer reachable by anyone - see V27.';

-- Retire whatever is left, rather than leaving it orphaned.
--
-- With sharing gone a NULL-owner venue matches no organiser's list and passes
-- no ownership check, so it is already unusable - it would simply sit in the
-- table being invisible. is_disabled says that out loud: it is the flag the
-- product already uses for "retired, still referenced by the events booked
-- there", which is exactly the state these are in.
--
-- Events already hosted at one keep working. Venue lookup by id deliberately
-- does not filter on is_disabled (see VenueRepository), so their event pages,
-- tickets and booking confirmations all still render the venue.
UPDATE venue SET is_disabled = true WHERE organizer_id IS NULL AND is_disabled = false;
