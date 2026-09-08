package com.eventbooking.dto.ticket;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * How the door is doing, for one event.
 *
 * <p>Counted from the ticket table rather than from {@code scan_log}: a ticket
 * is the thing that admits a person, and a scan log row is only a record that
 * somebody tried. Counting attempts would inflate the number every time a
 * steward scans the same code twice.
 *
 * @param refusedScans refusals recorded at this event's doors. Not a subset of
 *                     anything above it - a refusal admits nobody, so it
 *                     belongs to a different total entirely. Worth showing
 *                     beside them because a night with 400 refusals and 200
 *                     admissions is a night somebody should look at
 */
@Schema(description = "Admission progress for one event.")
public record CheckInStatsResponse(

        Long eventId,
        long ticketsIssued,
        long checkedIn,
        long remaining,
        long refusedScans
) {
    public static CheckInStatsResponse of(Long eventId, long issued, long checkedIn, long refused) {
        return new CheckInStatsResponse(eventId, issued, checkedIn, Math.max(0, issued - checkedIn), refused);
    }
}
