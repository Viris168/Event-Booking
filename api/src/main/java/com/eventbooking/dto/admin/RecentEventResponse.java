package com.eventbooking.dto.admin;

import com.eventbooking.Enumeration.EventStatus;

import java.time.Instant;

/**
 * A row in the dashboard's "latest events" strip.
 *
 * <p>Not {@link AdminEventOverviewResponse}. That record backs the moderation
 * table, so it carries capacity, sold, held, revenue and a deletability hint -
 * five aggregates across the zone, seat and booking tables that the dashboard
 * prints none of. This is a title, an owner, a status and two dates.
 *
 * <p>The organiser is denormalised to a name for the same reason the overview
 * does it: the column shows one, and resolving an organizer_id to a name in the
 * browser means the client needs the profile table too.
 */
public record RecentEventResponse(
        Long id,
        String slug,
        String titleEn,
        String titleKm,
        EventStatus status,

        /** When the organiser created the listing - what this strip sorts on. */
        Instant createdAt,

        /*
         * The date the show happens, and its sales window.
         *
         * The window rides along because the strip renders the same on-sale
         * pill the moderation table does, and salesState() needs both ends of
         * it. Without them every published row would read "On sale", including
         * the ones whose sales shut last month.
         */
        Instant startsAt,
        Instant salesOpenAt,
        Instant salesCloseAt,

        Long organizerId,
        String organizerNameEn,
        String organizerNameKm,

        String venueNameEn,
        String venueNameKm,
        String provinceCode
) {
}
