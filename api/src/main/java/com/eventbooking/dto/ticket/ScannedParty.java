package com.eventbooking.dto.ticket;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Who the gate is looking at, for both halves of a group scan.
 *
 * <p>Top-level rather than nested inside either response, because
 * {@link GroupPreviewResponse} and {@link GroupConfirmResponse} are two views
 * of one conversation - the steward previews, then confirms - and a client that
 * had to map two identical four-field shapes would write the same adapter
 * twice and let them drift.
 *
 * <p>Hoisted out of the ticket lists for the same reason it is shared: the
 * buyer is the same on every row, and repeating a name eight times is noise on
 * a screen read at arm's length over a queue.
 */
@Schema(description = "The booking behind a scanned code.")
public record ScannedParty(
        Long bookingId,
        String bookingRef,
        String buyerName,
        String eventTitleEn
) {
}
