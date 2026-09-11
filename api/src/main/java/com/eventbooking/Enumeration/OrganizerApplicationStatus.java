package com.eventbooking.Enumeration;

/**
 * Where a request to become an organiser has got to.
 *
 * <p>Three states and no state machine, unlike {@link EventStatus}. An
 * application is decided once: the only legal edges are PENDING to APPROVED and
 * PENDING to REJECTED, which a single guard at the review endpoint expresses
 * better than a transition table would.
 *
 * <p>Neither decided state is reopened. An applicant who was rejected and wants
 * to try again submits a new row - {@code uq_organizer_application_pending}
 * allows that, because it only constrains rows still in {@link #PENDING}.
 */
public enum OrganizerApplicationStatus {

    /** Submitted, waiting for a platform admin. At most one per user. */
    PENDING,

    /**
     * Terminal. By the time a row reads APPROVED the side effects have already
     * happened: {@code app_user.role} is ORGANIZER and the
     * {@code organizer_profile} row exists. The row is what records who decided.
     */
    APPROVED,

    /**
     * Terminal for this row, not for the person. {@code admin_note} carries the
     * reason and is required by a DB CHECK - a rejection the applicant cannot
     * act on is worse than none.
     */
    REJECTED
}
