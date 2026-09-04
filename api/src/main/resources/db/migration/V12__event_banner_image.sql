-- ============================================================
-- V12 - Cloudinary image ids for events and users
--
-- Adds Cloudinary public ids for event cover images, event listing banners,
-- and user avatars.
--
-- Two named slots, not a child table: an event has exactly a cover and a
-- banner. If a gallery is ever needed, that is an event_image table with a
-- role column, and these two columns backfill into it.
--
-- Only the Cloudinary public id is stored. The delivery URL is derived at
-- read time (CloudinaryService.urlFor), so a change of cloud name or
-- transformation does not leave a stale URL behind in the database.
-- ============================================================

ALTER TABLE event ADD COLUMN cloudinary_image_id VARCHAR(255);

ALTER TABLE event ADD COLUMN cloudinary_banner_id VARCHAR(255);

ALTER TABLE app_user ADD COLUMN cloudinary_image_id VARCHAR(255);

COMMENT ON COLUMN event.cloudinary_image_id IS
    'Cloudinary public id of the cover image. Delivery URL is derived, not stored.';

COMMENT ON COLUMN event.cloudinary_banner_id IS
    'Cloudinary public id of the wide banner image. Delivery URL is derived, not stored.';

COMMENT ON COLUMN app_user.cloudinary_image_id IS
    'Cloudinary public id of the avatar. Delivery URL is derived, not stored.';
