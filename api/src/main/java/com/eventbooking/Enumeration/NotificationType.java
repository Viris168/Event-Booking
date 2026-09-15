package com.eventbooking.Enumeration;

/**
 * What happened, not what it says.
 *
 * <p>Each constant is half of a notification; the other half is the {@code params}
 * JSON beside it. The reader's language decides the wording, and that decision is
 * made in the browser at render time - so a type is never a sentence, and adding
 * a language never touches this file or a stored row.
 *
 * <p>Grouped by who receives it. The grouping is a comment rather than a field
 * because the recipient is an {@code app_user} row and its role is already
 * there: a type that carried its own audience would be a second answer to the
 * same question, free to disagree with the first.
 */
public enum NotificationType {

    // ---------------------------------------------------------------- customer

    /** Payment settled, tickets issued. The one people wait for. */
    BOOKING_CONFIRMED,

    /** The charge was refused. Recoverable: the booking can still be paid. */
    BOOKING_PAYMENT_FAILED,

    /** Cancelled before payment, by the customer or by an admin. */
    BOOKING_CANCELLED,

    /** The hold ran out before payment landed; the seats went back on sale. */
    BOOKING_EXPIRED,

    /** The application to run events was granted; the organiser area is open. */
    ORGANIZER_APPLICATION_APPROVED,

    /** The application was refused. Carries the admin's note. */
    ORGANIZER_APPLICATION_REJECTED,

    // --------------------------------------------------------------- organizer

    /** The event cleared review and is live in the catalogue. */
    EVENT_APPROVED,

    /** Review refused it outright. Carries the admin's message. */
    EVENT_REJECTED,

    /** Review wants edits before it can go live. Carries the admin's message. */
    EVENT_CHANGES_REQUESTED,

    /** A published event was pulled from the catalogue by an admin. */
    EVENT_TAKEN_DOWN,

    /**
     * An admin put a taken-down event back on sale.
     *
     * <p>Its own type rather than reusing EVENT_APPROVED: the organiser did
     * nothing to trigger either one, and "your event is live again" is the
     * answer to the take-down they were told about, not a review result.
     */
    EVENT_RESTORED,

    /** Somebody bought tickets to an event this organiser owns. */
    EVENT_TICKETS_SOLD,

    /**
     * An admin agreed the platform owes this payout. The money has not moved.
     *
     * <p>Its own type rather than folding into PAYOUT_PAID, because the wait
     * between the two is exactly what the organiser wants to know about: told
     * only when the transfer lands, an approval that sits for three days looks
     * identical to a request nobody has read.
     */
    PAYOUT_APPROVED,

    /** The transfer was made. Carries the bank's reference. */
    PAYOUT_PAID,


    // ------------------------------------------------------------------- admin

    /** An organiser put an event into the review queue. */
    EVENT_SUBMITTED_FOR_REVIEW,

    /** A customer asked to become an organiser. */
    ORGANIZER_APPLICATION_SUBMITTED,

    /** An organiser asked to be settled for a finished event. */
    PAYOUT_REQUESTED
}
