package com.eventbooking.ticket;

/**
 * Every way a scan at the gate can end.
 *
 * <p>These are answers, not errors: asking "is this ticket good?" and hearing
 * "no, it was used at 19:42" is a successful call. The scan endpoint therefore
 * answers 200 with one of these rather than an RFC 7807 problem, so the gate
 * app has one shape to render green or red from - and so a steward under
 * pressure is never shown a stack of HTTP codes to interpret.
 */
public enum ScanOutcome {

    /** Admit. The ticket was good and this scan is the one that consumed it. */
    VALID,

    /** Someone already came in on this ticket. Carries when, so a steward can judge. */
    ALREADY_CHECKED_IN,

    /** Not one of our codes at all - a shop barcode, a boarding pass, noise. */
    MALFORMED,

    /** Our format, wrong HMAC. Someone edited a code or generated their own. */
    BAD_SIGNATURE,

    /**
     * Correctly signed but no such ticket, or the token inside does not match
     * the one on file. Both answer the same way on purpose: distinguishing them
     * would confirm which ticket ids exist.
     */
    UNKNOWN_TICKET,

    /**
     * The booking behind it is not CONFIRMED - refunded, or expired before it
     * was ever paid. Tickets are only issued on CONFIRMED, so in practice this
     * means the booking moved on afterwards.
     */
    BOOKING_NOT_CONFIRMED,

    /** A real, valid ticket - for a different event. The commonest honest mistake. */
    WRONG_EVENT,

    /**
     * Group scan only: the steward asked to admit more people than the booking
     * has left. Never returned by the single-ticket endpoint.
     *
     * <p>Lives on this enum rather than a parallel {@code GroupScanOutcome} so
     * a gate app keeps one mapping from outcome to the colour it paints. Two
     * enums covering six identical values is two things to keep in step.
     */
    REQUESTED_MORE_THAN_REMAINING,

    /**
     * Group scan only: the gate named a ticket that is not on the scanned
     * booking, or one that has already been used.
     *
     * <p>Refuses the whole call rather than admitting the rest. A steward who
     * selected three people and silently got two will wave three through - the
     * same reason {@link #REQUESTED_MORE_THAN_REMAINING} admits nobody.
     */
    TICKET_NOT_IN_PARTY;

    /** The single question the turnstile actually needs answered. */
    public boolean admitted() {
        return this == VALID;
    }
}
