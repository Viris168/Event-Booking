package com.eventbooking.dto.admin;

/**
 * How well one event is managing to collect money.
 *
 * <p>Not a revenue figure, and deliberately not comparable to one. What an
 * event <em>earned</em> is the sum of its CONFIRMED bookings - the definition
 * the dashboard, the moderation table and the payout invoice all share. This
 * record counts attempts instead, which is a different question: how many times
 * a customer tried to pay, and how often that worked.
 *
 * <p>The two diverge exactly where it matters. An event that collects $500 on
 * the third attempt every time has the same revenue as one that collects it
 * first time, and a checkout problem the revenue figure cannot show.
 */
public record EventPaymentHealthResponse(
        Long eventId,
        String titleEn,
        String titleKm,

        /** Every attempt against this event, in any status. */
        long attempts,

        /** SUCCESS. Money received. */
        long settled,

        /**
         * FAILED, CANCELLED and EXPIRED together - the attempts that finished
         * without collecting.
         *
         * <p>One number rather than three because the distinction is the
         * customer's, not the platform's: a declined card, an abandoned QR and
         * one that timed out all mean the same thing to whoever is asking why
         * this event cannot take money.
         */
        long failed,

        /**
         * CREATED and PENDING - still in flight, and not yet anybody's failure.
         *
         * <p>Carried separately so the caller can leave them out of the rate.
         * Counting an attempt opened ten seconds ago as a failure would make
         * every busy event look broken during its own on-sale.
         */
        long open,

        /**
         * What the provider actually settled for this event, in USD cents.
         *
         * <p>The sum of SUCCESS attempts - which is NOT the event's revenue,
         * however close the two usually land. Revenue is the sum of CONFIRMED
         * bookings, the figure the dashboard, the moderation table and the
         * payout invoice all share, and the one an organiser is paid against.
         *
         * <p>They diverge whenever a booking is paid and then cancelled, or
         * paid twice and refunded once: the money moved, so it is counted here,
         * while the booking it belonged to no longer counts as a sale. Labelled
         * "settled" on the screen for that reason, never "revenue".
         */
        long settledUsdCents
) {

    /**
     * Failures as a share of the attempts that finished.
     *
     * <p>The denominator is settled + failed, NOT attempts: an attempt still in
     * flight has not failed at anything yet, and counting it as one would make
     * every event look broken during its own on-sale, which is the moment
     * anybody is actually watching this number.
     *
     * <p>Lives on the record rather than in the service that sorts by it or the
     * screen that prints it, because it is the definition of the figure and
     * those are two places to get it wrong. An event with nothing finished is
     * 0, not a division by zero.
     */
    public double failureRate() {
        long finished = settled + failed;
        return finished == 0 ? 0 : (double) failed / finished;
    }
}
