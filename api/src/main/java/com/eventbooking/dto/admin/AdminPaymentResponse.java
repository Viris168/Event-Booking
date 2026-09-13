package com.eventbooking.dto.admin;

import com.eventbooking.Enumeration.BookingStatus;
import com.eventbooking.Enumeration.PaymentCurrency;
import com.eventbooking.Enumeration.PaymentProvider;
import com.eventbooking.Enumeration.PaymentStatus;

import java.time.Instant;

/**
 * One payment attempt, flattened for the admin payments table.
 *
 * <p>The booking and event fields are inlined rather than nested. The screen
 * shows a reference, a title and a buyer name per row and nothing deeper, and
 * nesting two whole entities to reach three strings meant the list endpoint
 * serialised an event - venue, zones, seat classes and all - once per payment.
 *
 * <p>{@code stuck} is computed server-side for the same reason the filter is:
 * it is a question about elapsed time, and a browser that has been open since
 * yesterday answers it against a clock nobody has looked at since.
 */
public record AdminPaymentResponse(
        Long id,
        PaymentProvider provider,
        PaymentStatus status,
        PaymentCurrency currencyCharged,
        Long amountUsdCents,
        Long amountKhr,
        String providerRef,
        Instant createdAt,
        Instant expiresAt,
        Instant resolvedAt,

        /**
         * Still open, and opened longer ago than the stuck threshold. An
         * attempt nobody can settle and nobody has cancelled - the row the
         * screen exists to surface.
         */
        boolean stuck,

        Long bookingId,
        String bookingRef,
        BookingStatus bookingState,
        String buyerName,

        Long eventId,
        String eventTitleEn,
        String eventTitleKm
) {
}
