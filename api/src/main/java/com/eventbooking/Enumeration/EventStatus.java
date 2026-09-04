package com.eventbooking.Enumeration;

/**
 * Where an event sits in the review lifecycle.
 *
 * <p>Order of declaration follows the happy path, which is also the order the
 * organiser sees in the lifecycle bar. The legal edges between these live in
 * {@link com.eventbooking.catalog.EventStateMachine}, not here - an enum can
 * say what states exist but not which ones follow which.
 *
 * <p>Everything except {@link #PUBLISHED} is non-sellable, and that falls out
 * for free: all three sell-side guards (EventServiceimpl.verifyEventIsOnSale,
 * HoldServiceimpl, ZoneHoldServiceimpl) test {@code != PUBLISHED} rather than
 * enumerating the states that are not on sale, so adding states here can never
 * accidentally put one on sale.
 */
public enum EventStatus {

    /** Being written. Only the organiser can see it. */
    DRAFT,

    /** Submitted, waiting for a platform admin. The organiser cannot edit it. */
    PENDING_REVIEW,

    /**
     * An admin asked for something to change. Editable again, and the reason is
     * the latest REQUEST_CHANGES row in {@code event_review}.
     */
    CHANGES_REQUESTED,

    /**
     * The platform is satisfied. Deliberately not the same as PUBLISHED: the
     * organiser still chooses the moment it goes on sale, which is what lets
     * them hold an approved event back for a launch date.
     */
    APPROVED,

    /** Terminal. The row is kept for the reason and the audit trail. */
    REJECTED,

    /** On sale, subject to the sales window. */
    PUBLISHED,

    /** Pulled after publication. Terminal, and a moderation action. */
    TAKEN_DOWN
}
