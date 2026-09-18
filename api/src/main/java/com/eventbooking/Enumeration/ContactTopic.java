package com.eventbooking.Enumeration;

/**
 * What an inbound support message is about.
 *
 * <p>Chosen by the sender from a fixed list, which is the only reason it is
 * worth storing at all. The obvious alternative - a free-text "subject" and let
 * the reader sort it out - is what the {@code subject} column already is; this
 * sits beside it so the admin inbox can filter, and a filter over strings the
 * sender invented filters nothing.
 *
 * <p>Kept short deliberately. A longer list is not more precise, it just moves
 * the guessing from the person reading the message to the person writing it,
 * and a sender who cannot see which box their problem belongs in picks the
 * first one rather than the right one. Five is about as many as somebody will
 * actually read before choosing.
 *
 * <p>Mirrored by a CHECK constraint in V33. Adding a value here without adding
 * it there fails on insert, not at compile time.
 */
public enum ContactTopic {

    /**
     * A ticket that did not arrive, a booking that cannot be found, a question
     * about getting in at the door. The commonest reason anyone writes in, and
     * the one most likely to come from somebody who cannot sign in to ask it
     * through the app.
     */
    BOOKING,

    /** Money left the sender and the platform does not agree that it did. */
    PAYMENT,

    /**
     * About running events rather than attending them. Not a substitute for
     * {@code /become-an-organizer}, which is the actual application - this is
     * for the questions that come before somebody is ready to fill that in.
     */
    ORGANIZER,

    /** The site itself is broken for them. */
    TECHNICAL,

    /**
     * Everything else, and the honest default. Present so that nobody is forced
     * to misfile a message in one of the four above just to send it.
     */
    OTHER
}
