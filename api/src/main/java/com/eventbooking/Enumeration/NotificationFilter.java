package com.eventbooking.Enumeration;

/**
 * Which slice of the inbox to return.
 *
 * <p>An enum rather than the pair of booleans this replaced. {@code unreadOnly}
 * answered the question with two states and a third was wanted; adding
 * {@code readOnly} beside it would have made {@code unreadOnly=true&readOnly=true}
 * expressible, which is a request with no meaning that every layer below would
 * then have to decide what to do with. One parameter, three values, no
 * combination to rule out.
 */
public enum NotificationFilter {

    /** Everything addressed to the caller, newest first. */
    ALL,

    /** Only what has not been opened - the filter the bell's dropdown offers. */
    UNREAD,

    /** Only what has. Not the complement of a badge but a place to go back to. */
    READ
}
