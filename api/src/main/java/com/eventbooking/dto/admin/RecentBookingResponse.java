package com.eventbooking.dto.admin;

import com.eventbooking.Enumeration.BookingStatus;

import java.time.Instant;

/**
 * A row in the dashboard's "latest bookings" strip.
 *
 * <p>Carries the buyer's display name rather than their id, because the strip
 * renders a name and resolving ids to names one at a time is how a list of
 * eight bookings becomes nine requests.
 */
public record RecentBookingResponse(
        Long id,
        String bookingRef,
        BookingStatus state,
        Instant createdAt,
        Long totalUsdCents,

        /** As typed at checkout, which is not always the account holder's own. */
        String buyerName,
        String buyerPhoneE164,

        Long eventId,
        String eventTitleEn,
        String eventTitleKm,

        Long userId,
        String userDisplayName
) {
}
