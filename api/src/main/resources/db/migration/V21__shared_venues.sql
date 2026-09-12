-- Venues that belong to nobody in particular.
--
-- Until now venue.organizer_id was NOT NULL, so every venue was the private
-- property of one organiser: only its owner could edit it, edit its seat map,
-- retire it, or HOST AN EVENT AT IT. That last one is the reason this hurts.
-- Koh Pich Theatre, Olympic Stadium and Chaktomuk Theatre are public buildings
-- that any promoter can hire; modelling them as one organiser's possession
-- means the second organiser to want one cannot put an event on there at all,
-- and there is no way to express the venue everybody shares.
--
-- NULL now means exactly that: a shared venue, part of the platform's own
-- catalogue. Any organiser may host at it and any organiser may maintain it.
-- A non-NULL owner keeps the old meaning - a room that one organiser runs, and
-- only they can touch.
--
-- Nullable rather than a separate `is_shared` flag: a venue is either somebody's
-- or it is not, and two columns that can disagree ("owned by 4 AND shared") is a
-- state nothing in the code would know how to answer.
ALTER TABLE venue ALTER COLUMN organizer_id DROP NOT NULL;

COMMENT ON COLUMN venue.organizer_id IS
    'Owning organizer_profile.id, or NULL for a shared platform venue that any organizer may host at and maintain.';

-- Deliberately NO data change here.
--
-- Which existing venues should become shared is a judgement about real places,
-- and it differs per environment - on this project''s dev database every seeded
-- venue happens to sit under one demo organiser, but a migration that assumed
-- "organizer_id = 1 means seeded" would quietly hand away a real organiser's
-- venues anywhere that was not true. Marking a venue shared is an admin action
-- on the data, not a schema step.
