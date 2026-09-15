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
 * <p>So does sold inventory, which is a separate question from the booking
 * count rather than a restatement of it. {@code event_zone.sold_qty} and a
 * SOLD seat are what the event itself says it sold, and the two can disagree
 * with the booking table - a seat marked sold by a path that left no booking
 * row, or by a seed. When they disagree the safe answer is the larger one:
 * the row that says something was sold is the one that might be somebody's
 * ticket.
 *
 * <p>The message names take-down, because that is the action the admin actually
 * wants in every case this refuses: it pulls the listing off sale immediately
 * and leaves the sold tickets valid.
 */
public class EventNotDeletableException extends ApiException {
    public EventNotDeletableException(Long eventId, long bookings, long activeHolds) {
        this(eventId, bookings, activeHolds, 0);
    }

    public EventNotDeletableException(Long eventId, long bookings, long activeHolds, long sold) {
        super(ErrorCode.EVENT_NOT_DELETABLE, describe(eventId, bookings, activeHolds, sold));
    }

    private static String describe(Long eventId, long bookings, long activeHolds, long sold) {
        if (bookings > 0 || sold > 0) {
            // Whichever is larger is the honest number: they are two records of
            // the same sale and a delete has to respect both.
            long attendees = Math.max(bookings, sold);
            return "Event " + eventId + " has " + attendees + " ticket(s) sold and cannot be deleted. "
                    + "Take it down instead - that stops sales immediately and keeps sold tickets valid.";
        }
        return "Event " + eventId + " has " + activeHolds + " checkout(s) in progress and cannot be "
                + "deleted right now. Holds expire on their own; try again shortly, or take the event "
                + "down to stop new ones.";
    }
}
