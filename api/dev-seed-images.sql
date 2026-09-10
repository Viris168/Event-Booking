-- ============================================================
-- Dev seed: image URLs on some events, so both render paths are visible.
--
-- Since V18 the two image columns hold a delivery URL rather than a Cloudinary
-- public id, which means an event can point at any image on the web and no
-- Cloudinary account is needed to see the storefront with artwork on it.
--
-- Deliberately only SOME events. The UI is meant to fall back to a gradient
-- when a slot is empty, and that path only gets exercised if some rows stay
-- NULL - so roughly half the catalogue is left without an image on purpose.
--
-- picsum.photos is used because it needs no key, serves a stable image per
-- seed, and is obviously placeholder art rather than something that could be
-- mistaken for a real poster. Swap these for Cloudinary URLs (or anything
-- else) whenever real artwork exists; nothing in the code cares about the host.
--
--   docker exec -i event-booking-postgres \
--     psql -U postgres -d event_booking < api/dev-seed-images.sql
--
-- Re-runnable: it assigns by slug, so a second run rewrites the same values.
-- To clear them again:
--   UPDATE event SET cloudinary_image_id = NULL, cloudinary_banner_id = NULL;
-- ============================================================

BEGIN;

-- Cover + banner: the full treatment, card and detail hero both photographic.
UPDATE event SET
    cloudinary_image_id  = 'https://picsum.photos/seed/' || slug || '/800/450',
    cloudinary_banner_id = 'https://picsum.photos/seed/' || slug || '-wide/1600/600'
WHERE slug IN (
    'angkor-sunset-sessions',
    'water-festival-riverside',
    'otres-beach-open-air',
    'khmer-classical-dance',
    'mekong-marathon-2026'
);

-- Cover only. The detail hero falls back to the banner slot's stand-in, which
-- eventArt resolves to the cover image rather than to a bare gradient.
UPDATE event SET
    cloudinary_image_id = 'https://picsum.photos/seed/' || slug || '/800/450'
WHERE slug IN (
    'bokator-championship-2026',
    'lunar-lantern-night'
);

-- Banner only, to prove the reverse fallback: the listing card has no cover of
-- its own and borrows the banner instead of dropping to a gradient.
UPDATE event SET
    cloudinary_banner_id = 'https://picsum.photos/seed/' || slug || '-wide/1600/600'
WHERE slug = 'siem-reap-comedy-fest';

COMMIT;

SELECT
    count(*) FILTER (WHERE cloudinary_image_id IS NOT NULL AND cloudinary_banner_id IS NOT NULL) AS both,
    count(*) FILTER (WHERE cloudinary_image_id IS NOT NULL AND cloudinary_banner_id IS NULL)     AS cover_only,
    count(*) FILTER (WHERE cloudinary_image_id IS NULL AND cloudinary_banner_id IS NOT NULL)     AS banner_only,
    count(*) FILTER (WHERE cloudinary_image_id IS NULL AND cloudinary_banner_id IS NULL)         AS gradient_only
FROM event;
