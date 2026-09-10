-- ============================================================
-- V18 - Event image columns now hold a URL, not a Cloudinary public id
--
-- V12 stored a Cloudinary public id and derived the delivery URL at read time
-- (CloudinaryService.urlFor). That is the right shape while Cloudinary is the
-- only image host, and the wrong shape the moment it is not: the column cannot
-- express an image that lives anywhere else, so switching provider - or simply
-- pointing an event at an image already on the web - is unrepresentable.
--
-- The columns keep their names and now hold the delivery URL itself. Cloudinary
-- still works exactly as before: the uploader already returns `secure_url`
-- alongside the public id, so the upload path stores that instead, and the
-- public id is recovered from the URL when an image has to be destroyed
-- (CloudinaryService.publicIdFromUrl). An image hosted anywhere else is simply
-- a URL that nobody tries to destroy.
--
-- Names left alone deliberately. They are referenced by name in the entity, the
-- snapshotter and two repository updates, and renaming them buys nothing the
-- comment below does not say just as well.
--
-- VARCHAR(255) -> TEXT: signed or transformed delivery URLs run well past 255
-- characters, and a public id comfortably fit where a URL may not.
--
-- No backfill needed - both columns are entirely NULL at the time this is
-- written. Were that not true this would have to convert each stored public id
-- into a URL first, because the new read path does no derivation.
-- ============================================================

ALTER TABLE event ALTER COLUMN cloudinary_image_id TYPE TEXT;
ALTER TABLE event ALTER COLUMN cloudinary_banner_id TYPE TEXT;

COMMENT ON COLUMN event.cloudinary_image_id IS
    'Delivery URL of the cover image (NOT a public id since V18). Any host - a Cloudinary upload stores its secure_url here.';

COMMENT ON COLUMN event.cloudinary_banner_id IS
    'Delivery URL of the wide banner image (NOT a public id since V18). Any host, same as the cover column.';
