package com.eventbooking.dto.admin;

/**
 * The admin dashboard's counters, in one response.
 *
 * <p>Twenty numbers and one request. The screen used to derive all of these in
 * the browser by walking the mock store's arrays, which is only possible while
 * the whole database fits in a tab; against the real one the choice is either
 * this or twenty list endpoints the client immediately reduces to a length.
 *
 * <p>Every field is a count except the three in USD cents, which are sums of
 * CONFIRMED booking totals - money actually taken, not money invoiced.
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

        /**
         * The same sum over the last 30 days.
         *
         * <p>The lifetime figure beside it only ever goes up, so on its own it
         * cannot tell a good month from a dead one - by the second year it is a
         * number that changes slowly and means nothing in particular. This is
         * the one that answers "how are we doing".
         */
        long gross30dUsdCents,

        long ticketsIssued,
        long checkedIn,

        /** Open payment attempts older than the stuck threshold. */
        long stuckPayments,

        /** Organiser applications still waiting on a decision. */
        long pendingApplications,

        /**
         * Events whose sales window is open right now.
         *
         * <p>Deliberately beside {@code published} rather than replacing it.
         * Publishing is a decision that never expires, so that count includes
         * every show that has already happened; this one is what is actually
         * selling today, which is the number an admin is asked about.
         */
        long onSaleNow,

        /**
         * Payout requests nobody has finished with - REQUESTED and APPROVED
         * together, and what they add up to.
         *
         * <p>The two statuses are one queue from the dashboard's point of view:
         * both are money the platform still owes and somebody still has to act
         * on. The payouts screen keeps them apart, because there the difference
         * between "agree to it" and "send it" is the whole job.
         */
        long payoutsToSend,
        long payoutsToSendUsdCents
) {
}
