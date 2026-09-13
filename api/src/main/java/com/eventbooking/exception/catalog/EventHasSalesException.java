package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The organiser asked to take down an event that has already sold tickets.
 *
 * <p>Organisers may pull their own listing while nothing has sold - a date
 * typed wrong, a show that fell through, a duplicate posted twice. None of that
 * needs an admin, and making someone queue for one to undo their own mistake is
 * friction with nothing behind it.
 *
 * <p>The first sale changes what the action means. People now hold tickets, so
 * pulling the event is a refund decision rather than a listing decision, and
 * this platform makes those - which is why past that point take-down stays on
 * the admin controller. Not 403: the caller owns the event and is allowed to
 * ask, it is the sales that make it somebody else's call.
 */
public class EventHasSalesException extends ApiException {
    public EventHasSalesException(Long eventId, int sold) {
        super(ErrorCode.EVENT_HAS_SALES,
                "Event " + eventId + " has already sold " + sold + " ticket(s), so taking it down is a "
                        + "refund decision. Ask a platform admin to pull it.");
    }
}
