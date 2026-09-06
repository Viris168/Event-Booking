package com.eventbooking.Enumeration;

/**
 * The verbs that move an event between {@link EventStatus} values.
 *
 * <p>Transitions are named rather than inferred from a target status because
 * two different actors can reach the same state for different reasons, and the
 * audit log has to tell them apart. {@code event_review.action} stores the
 * first five of these verbatim.
 *
 * <p>PUBLISH and TAKE_DOWN are not logged to {@code event_review}: that table
 * records review decisions, and these two are the organiser's own release
 * control and a post-publication moderation action respectively.
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
    TAKE_DOWN;

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
        return this == APPROVE || this == REJECT || this == REQUEST_CHANGES || this == TAKE_DOWN;
    }

    public boolean isOrganizerAction() {
        return !isAdminAction();
    }
}
