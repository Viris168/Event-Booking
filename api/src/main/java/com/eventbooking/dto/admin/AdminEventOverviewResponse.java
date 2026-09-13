package com.eventbooking.dto.admin;

import com.eventbooking.Enumeration.EventStatus;

import java.time.Instant;

/**
 * One row of the moderation table.
 *
 * <p>Not EventResponse. That one is built for the organiser's form and the
 * public detail page, so it carries every zone, seat class, the venue and the
 * whole review history - several kilobytes per event, of which this table
 * prints a title, an owner, a status, a date and two numbers.
 *
 * <p>The owner is denormalised to a name for the same reason: the column shows
 * "Mekong Live Productions · Sokha Meas", and resolving an organizer_id to that
 * string in the browser means the client needs the profile and user tables too.
 */
public record AdminEventOverviewResponse(
        Long id,
        String slug,
        String titleEn,
        String titleKm,
        EventStatus status,
        String category,
        Instant startsAt,

        Long organizerId,
        /** "Org name · owner display name", already localised by the caller's locale. */
        String organizerNameEn,
        String organizerNameKm,
        String organizerOwnerName,

        Long venueId,
        String venueNameEn,
        String venueNameKm,
        String provinceCode,

        int capacity,
        int sold,
        int held,

        /** Sum of CONFIRMED booking totals for this event, in USD cents. */
        long revenueUsdCents
) {
}
