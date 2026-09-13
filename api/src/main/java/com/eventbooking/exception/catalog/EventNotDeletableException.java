package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The event has something attached that a DELETE would destroy with it.
 *
 * <p>Deleting an event cascades to its seat classes, zones, seat map and review
 * history, which is exactly what an admin removing a spam or duplicate listing
 * wants. What it must never reach is a booking: {@code booking.event_id} has no
 * cascade, so the delete would either fail as a raw 23503 or - if the cascade
 * were ever widened - quietly void tickets somebody paid for and is expecting
 * to be scanned at a door.
 *
 * <p>An active hold blocks it too. That is a customer part-way through
 * checkout, and the row they are holding disappearing underneath them is a
 * crash on the payment screen rather than a clean refusal.
 *
 * <p>The message names take-down, because that is the action the admin actually
 * wants in every case this refuses: it pulls the listing off sale immediately
 * and leaves the sold tickets valid.
 */
public class EventNotDeletableException extends ApiException {
    public EventNotDeletableException(Long eventId, long bookings, long activeHolds) {
        super(ErrorCode.EVENT_NOT_DELETABLE, describe(eventId, bookings, activeHolds));
    }

    private static String describe(Long eventId, long bookings, long activeHolds) {
        if (bookings > 0) {
            return "Event " + eventId + " has " + bookings + " booking(s) and cannot be deleted. "
                    + "Take it down instead - that stops sales immediately and keeps sold tickets valid.";
        }
        return "Event " + eventId + " has " + activeHolds + " checkout(s) in progress and cannot be "
                + "deleted right now. Holds expire on their own; try again shortly, or take the event "
                + "down to stop new ones.";
    }
}
