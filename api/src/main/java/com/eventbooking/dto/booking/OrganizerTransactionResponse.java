package com.eventbooking.dto.booking;

import com.eventbooking.Enumeration.BookingStatus;

import java.time.Instant;

/**
 * One row of the organiser's transactions table.
 *
 * <p>Flattened on purpose. The screen shows event / time / customer / method /
 * reference / status / amount, and nesting the whole event and payment objects
 * to reach four fields would ship a payload many times the size for a table
 * that renders none of the rest.
 *
 * <p>Buyer contact is included because the organiser is who a customer calls
 * when a ticket does not arrive - but note this is their own customers only:
 * the query is scoped by event ownership, not filtered in the browser.
 */
public record OrganizerTransactionResponse(
        Long bookingId,
        String bookingRef,
        Long eventId,
        String eventTitleEn,
        String eventTitleKm,
        String buyerName,
        String buyerPhoneE164,
        /** Provider of the most recent payment attempt, or null if none was started. */
        String paymentProvider,
        BookingStatus state,
        Long totalUsdCents,
        Instant createdAt
) {
}
