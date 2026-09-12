package com.eventbooking.dto.booking;

import jakarta.validation.constraints.Size;

/**
 * The optional free-text reason on a cancel, a refund request, or an admin's
 * decision on one. It lands in the note column of the booking_status_history
 * row the transition writes, so "why" survives next to "when" instead of
 * living only in a support inbox.
 *
 * <p>Optional on purpose: a customer cancelling an unpaid booking owes nobody
 * an explanation, and demanding one would only produce "asdf". The whole body
 * may be omitted.
 */
public record BookingReasonRequest(
        @Size(max = 500, message = "A reason may not exceed 500 characters")
        String reason
) {
}
