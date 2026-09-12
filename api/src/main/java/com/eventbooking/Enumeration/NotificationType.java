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

    /** An admin granted the refund and the money is on its way back. */
    BOOKING_REFUNDED,

    /**
     * An admin refused the refund; the booking is CONFIRMED again.
     *
     * <p>Its own type rather than a second BOOKING_CONFIRMED. REFUND_REQUESTED
     * to CONFIRMED is a legal transition, so without this the customer who asked
     * for their money back would be told "your tickets are ready" - technically
     * true, and no answer at all to the question they actually asked.
     */
    BOOKING_REFUND_DECLINED,

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

    /** Somebody bought tickets to an event this organiser owns. */
    EVENT_TICKETS_SOLD,

    // ------------------------------------------------------------------- admin

    /** An organiser put an event into the review queue. */
    EVENT_SUBMITTED_FOR_REVIEW,

    /** A customer asked to become an organiser. */
    ORGANIZER_APPLICATION_SUBMITTED,

    /** A customer asked for their money back; somebody has to decide. */
    REFUND_REQUESTED
}
