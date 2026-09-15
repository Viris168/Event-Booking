package com.eventbooking.dto.admin;

/**
 * The admin dashboard's counters, in one response.
 *
 * <p>Sixteen numbers and one request. The screen used to derive all of these in
 * the browser by walking the mock store's arrays, which is only possible while
 * the whole database fits in a tab; against the real one the choice is either
 * this or sixteen list endpoints the client immediately reduces to a length.
 *
 * <p>Every field is a count except {@code grossUsdCents}, which is the sum of
 * SUCCESS payment attempts - money actually received, not money invoiced.
 */
public record PlatformStatsResponse(
        long users,
        long customers,
        long organizers,
        long disabled,

        long events,
        long published,
        long drafts,
        long pendingReview,
        long takenDown,

        long bookings,
        long confirmed,
        long awaitingConfirmation,

        long grossUsdCents,

        long ticketsIssued,
        long checkedIn,

        /** Open payment attempts older than the stuck threshold. */
        long stuckPayments,

        /** Organiser applications still waiting on a decision. */
        long pendingApplications
) {
}
