package com.eventbooking.Enumeration;

/**
 * How far an admin has got with an inbound message.
 *
 * <p>Four states and no state machine, for the same reason
 * {@link OrganizerApplicationStatus} has none: the legal edges are few enough
 * to state in a sentence. Everything starts {@link #NEW}; an admin moves it to
 * {@link #OPEN}, {@link #CLOSED} or {@link #SPAM}, and may move it between
 * those three afterwards as often as reality requires.
 *
 * <p>Deliberately not a ticketing system. {@code ADMIN_LIMIT_REACHED} caps this
 * platform at three administrators, so there is nobody to assign a message to
 * and no queue to escalate it through - any stage that exists only to be
 * clicked past would simply never be clicked.
 *
 * <p>Mirrored by a CHECK constraint in V33, alongside
 * {@code contact_message_handled_consistent}, which is what makes NEW mean
 * "untouched" rather than merely "not yet closed": a row in any other status
 * has to name the admin who put it there.
 */
public enum ContactMessageStatus {

    /**
     * Nobody has looked at it. The only status a row can be created in, and the
     * only one for which {@code handled_by} and {@code handled_at} are null.
     */
    NEW,

    /**
     * Somebody is dealing with it. Distinct from NEW because the reply usually
     * happens by email, outside this system entirely - without this status the
     * inbox cannot tell a message nobody has read from one a colleague answered
     * an hour ago and is waiting to hear back on.
     */
    OPEN,

    /** Dealt with. Not deleted: the thread is the record that it was handled. */
    CLOSED,

    /**
     * Junk. Its own status rather than CLOSED so that the two can be counted
     * apart - a form open to the public without a token will attract some, and
     * the rate at which it does is the signal that tells us whether the limits
     * in ContactRateLimiter are set anywhere near right.
     */
    SPAM
}
