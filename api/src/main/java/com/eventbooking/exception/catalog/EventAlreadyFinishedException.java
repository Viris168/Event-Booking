package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The event has already happened, so there is nothing to put back on sale.
 *
 * <p>RESTORE exists to undo a take-down: an event pulled by mistake goes back
 * to PUBLISHED exactly as it was, and starts selling again. Neither half of
 * that applies once the date has passed. {@code verifyEventIsOnSale} checks the
 * clock as well as the status, so it still could not sell; and the catalogue
 * lists from today onward, so it would not reappear. The only thing that would
 * change is the badge - which would then read "Published" against a show that
 * finished last month.
 *
 * <p>Nothing is lost by refusing. The event stays readable at its own URL for
 * everyone who holds a ticket to it, which is the reason TAKEN_DOWN is a
 * publicly visible status in the first place.
 */
public class EventAlreadyFinishedException extends ApiException {

    /** RESTORE: there is nothing to put back on sale. */
    public static EventAlreadyFinishedException cannotRestore(Long eventId) {
        return new EventAlreadyFinishedException(
                "Event " + eventId + " has already taken place, so it cannot be put back on sale. "
                        + "It stays readable at its own page for everyone holding a ticket to it.");
    }

    /**
     * TAKE_DOWN: there is nothing left to take down.
     *
     * <p>A finished event left the catalogue the moment its date passed - the
     * public list runs from today onward - so pulling it would change a status
     * and nothing else. Offering the action at all implied there was still
     * something on sale to stop.
     */
    public static EventAlreadyFinishedException cannotTakeDown(Long eventId) {
        return new EventAlreadyFinishedException(
                "Event " + eventId + " has already taken place and is no longer listed publicly, "
                        + "so there is nothing to take down.");
    }

    /**
     * PATCH: the event is over, so there is nothing an edit can still affect.
     *
     * <p>Applies to the admin as much as to the owner, unlike the
     * {@code isEditable} status gate. That one protects review - approve
     * version A, publish version B - and an admin moderating is the party it
     * protects, so they edit past it. This one is not about review at all: the
     * show happened, the attendees came, and rewriting its date or its venue
     * now only makes the record disagree with what took place.
     */
    public static EventAlreadyFinishedException cannotEdit(Long eventId) {
        return new EventAlreadyFinishedException(
                "Event " + eventId + " has already taken place, so it can no longer be edited. "
                        + "Its page stays as it was for everyone holding a ticket to it.");
    }

    private EventAlreadyFinishedException(String message) {
        super(ErrorCode.EVENT_ALREADY_FINISHED, message);
    }
}
