package com.eventbooking.Enumeration;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

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
    TAKEN_DOWN;

    /**
     * The statuses a customer is allowed to see.
     *
     * <p>Defined once, here, because the catalogue list and the event detail
     * page both need the answer and had drifted into not asking at all - a
     * plain findAll() and a plain findById(), which between them published
     * every DRAFT the moment it was created.
     *
     * <p>TAKEN_DOWN is included deliberately. Removing it would 404 the event
     * page for everyone already holding a ticket to it, turning a moderation
     * decision into a broken link in someone's inbox. The event stays readable;
     * verifyEventIsOnSale is what stops anyone buying more.
     */
    private static final Set<EventStatus> PUBLICLY_VISIBLE =
            Collections.unmodifiableSet(EnumSet.of(PUBLISHED, TAKEN_DOWN));

    public static Set<EventStatus> publiclyVisible() {
        return PUBLICLY_VISIBLE;
    }

    public boolean isPubliclyVisible() {
        return PUBLICLY_VISIBLE.contains(this);
    }
}
