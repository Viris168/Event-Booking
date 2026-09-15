package com.eventbooking.exception.payout;

import com.eventbooking.Enumeration.PayoutStatus;
import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * This event has already been claimed.
 *
 * <p>The database enforces it too, via {@code uq_payout_request_event} - one
 * payout per event for all time. Checking in the service is what turns it into
 * a 409 the organiser can read; letting the index catch it produces a
 * DataIntegrityViolationException and a 500.
 *
 * <p>The existing status is in the message because "already requested" is not
 * an answer: waiting on a decision, waiting on a transfer and already settled
 * are three different things to be told, and only one of them means the
 * organiser should go and chase somebody.
 */
public class PayoutAlreadyRequestedException extends ApiException {
    public PayoutAlreadyRequestedException(Long eventId, PayoutStatus status) {
        super(ErrorCode.PAYOUT_ALREADY_REQUESTED,
                "Event " + eventId + " already has a payout request, currently " + status);
    }
}
