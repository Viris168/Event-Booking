package com.eventbooking.exception.payout;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The event finished owing the organiser nothing.
 *
 * <p>Reachable when nothing on it ever reached CONFIRMED - expired holds and
 * cancellations are not receipts. Refused rather than allowed through as a
 * $0.00 invoice, because a payout request is a thing an admin has to work: a
 * queue full of zero-value requests is a queue people stop reading, and the
 * organiser gains nothing from a document certifying that they are owed
 * nothing.
 *
 * <p>Note what this does NOT check: whether the net clears the fee. The fee is
 * a percentage, so net is zero only when gross is - there is no band where an
 * organiser sold something and ends up owed nothing.
 */
public class NothingToPayOutException extends ApiException {
    public NothingToPayOutException(Long eventId) {
        super(ErrorCode.NOTHING_TO_PAY_OUT,
                "Event " + eventId + " has no settled revenue to pay out");
    }
}
