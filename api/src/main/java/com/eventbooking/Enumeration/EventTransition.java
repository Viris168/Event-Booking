package com.eventbooking.Enumeration;

/**
 * The verbs that move an event between {@link EventStatus} values.
 *
 * <p>Transitions are named rather than inferred from a target status because
 * two different actors can reach the same state for different reasons, and the
 * audit log has to tell them apart. {@code event_review.action} stores the
 * first five of these verbatim.
 *
 * <p>PUBLISH, TAKE_DOWN and RESTORE are not logged to {@code event_review}:
 * that table records review decisions, and these three are the organiser's own
 * release control and two post-publication moderation actions respectively.
 */
public enum EventTransition {

    /** Organiser: DRAFT or CHANGES_REQUESTED -> PENDING_REVIEW. */
    SUBMIT,

    /** Organiser: PENDING_REVIEW -> DRAFT, taking it back out of the queue. */
    WITHDRAW,

    /** Admin: PENDING_REVIEW -> APPROVED. */
    APPROVE,

    /** Admin: PENDING_REVIEW -> REJECTED. Requires a message. */
    REJECT,

    /** Admin: PENDING_REVIEW -> CHANGES_REQUESTED. Requires a message. */
    REQUEST_CHANGES,

    /** Organiser: APPROVED -> PUBLISHED. */
    PUBLISH,

    /** Admin: PUBLISHED -> TAKEN_DOWN. */
    TAKE_DOWN,

    /**
     * Admin: TAKEN_DOWN -> PUBLISHED. The undo for TAKE_DOWN.
     *
     * <p>Take-down used to be terminal, on the reasoning that a pulled event
     * should be re-created rather than revived. In practice most take-downs are
     * a listing pulled while something is checked, and leaving the admin no way
     * back meant the only remedy for a decision made in a minute was asking the
     * organiser to build the whole event again - seat map, pricing and all -
     * under a new id that every existing ticket and link points away from.
     *
     * <p>Restoring is safe in a way rebuilding is not: the event's inventory,
     * bookings and tickets never went anywhere, so putting the status back puts
     * it back on sale exactly as it was. Nothing else has to be reconciled.
     */
    RESTORE;

    /**
     * Whose action this is.
     *
     * <p>availableTransitions answers "legal from this status", which is not the
     * same question as "yours to perform" - APPROVE is legal from PENDING_REVIEW
     * but is not the organiser's. Both clients were filtering the array with
     * their own hardcoded allowlist, which meant the organiser dashboard and the
     * admin queue would hold two copies of a rule the server already knows.
     */
    public boolean isAdminAction() {
        return this == APPROVE || this == REJECT || this == REQUEST_CHANGES
                || this == TAKE_DOWN || this == RESTORE;
    }

    /**
     * Whose action this is, from the other side.
     *
     * <p>Written out rather than {@code !isAdminAction()}, which is what it used
     * to be. That made the two audiences strict complements - every transition
     * belonged to exactly one - and TAKE_DOWN now belongs to both: an admin may
     * pull any event as moderation, and an organiser may pull their own while
     * nothing has sold. Once a ticket exists it is a refund decision and the
     * organiser's copy is refused, but that is a rule about sales rather than
     * about who they are, so it lives in the service and not here.
     *
     * <p>RESTORE is deliberately absent. It is the undo for a take-down and
     * carries no record of who made that decision, so handing it to organisers
     * would let them reverse an admin's moderation - the take-down would stand
     * for exactly as long as it took the organiser to notice.
     */
    public boolean isOrganizerAction() {
        return this == SUBMIT || this == WITHDRAW || this == PUBLISH || this == TAKE_DOWN;
    }
}
