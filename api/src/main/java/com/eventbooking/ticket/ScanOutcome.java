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
    WRONG_EVENT;

    /** The single question the turnstile actually needs answered. */
    public boolean admitted() {
        return this == VALID;
    }
}
