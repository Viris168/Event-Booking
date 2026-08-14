package com.eventbooking.payment.bakong;

/**
 * What Bakong said about one QR, flattened to the three answers the reconciler
 * can actually act on.
 *
 * @param outcome         paid, not yet, or we could not tell
 * @param transactionHash Bakong's settled transaction hash - present only on
 *                        {@link Outcome#PAID}, and distinct from the md5 the
 *                        question was asked with
 * @param message         the provider's own wording, kept for the audit note
 */
public record BakongCheckResult(Outcome outcome, String transactionHash, String message) {

    public enum Outcome {
        /** The money is in. Settle the attempt and confirm the booking. */
        PAID,
        /**
         * Bakong has no transaction for this md5. The ordinary answer while a
         * customer is still deciding - not an error, and not a failure either:
         * the QR simply has not been paid yet.
         */
        NOT_FOUND,
        /**
         * The provider could not be reached, or answered something this client
         * does not understand. Deliberately distinct from NOT_FOUND: an
         * unreachable provider must never be read as "unpaid" and must not
         * fail a booking on its own.
         */
        UNAVAILABLE
    }

    public static BakongCheckResult paid(String transactionHash, String message) {
        return new BakongCheckResult(Outcome.PAID, transactionHash, message);
    }

    public static BakongCheckResult notFound(String message) {
        return new BakongCheckResult(Outcome.NOT_FOUND, null, message);
    }

    public static BakongCheckResult unavailable(String message) {
        return new BakongCheckResult(Outcome.UNAVAILABLE, null, message);
    }
}
