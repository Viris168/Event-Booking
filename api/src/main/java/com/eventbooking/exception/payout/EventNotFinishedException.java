package com.eventbooking.exception.payout;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

import java.time.Instant;

/**
 * The event has not happened yet, so there is nothing to settle.
 *
 * <p>"Finished" means {@code starts_at} is in the past. There is no
 * {@code ends_at} column on {@code event} - never has been - and the rest of
 * the codebase already reads finishing the same way: {@code EventServiceimpl}
 * gates three separate operations on {@code startsAt.isBefore(now)}, and the
 * FINISHED badge the catalogue renders is derived from it too. Inventing a
 * second definition here would mean an event that the organiser's own dashboard
 * calls finished could still be refused a payout.
 *
 * <p>409 rather than 400: nothing about the request is malformed. The same call
 * will succeed once the date passes, which is the distinction CONFLICT is for.
 */
public class EventNotFinishedException extends ApiException {
    public EventNotFinishedException(Long eventId, Instant startsAt) {
        super(ErrorCode.EVENT_NOT_FINISHED,
                "Event " + eventId + " starts at " + startsAt + " and cannot be paid out until it has happened");
    }
}
