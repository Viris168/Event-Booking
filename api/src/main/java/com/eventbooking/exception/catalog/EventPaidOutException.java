package com.eventbooking.exception.catalog;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

/**
 * The event has been paid out, so not even a force delete may erase it.
 *
 * <p>The single refusal on the force-delete path, and it is not about the
 * tickets - force delete exists precisely to get past those. It is about an
 * invoice. A PAID {@code payout_request} records money that has already left
 * the platform's account and arrived in the organiser's, and {@code
 * paid_reference} on it is the bank's confirmation number. Deleting the event
 * would take the only description of what that transfer was for, leaving the
 * platform's books with an outgoing payment and nothing to match it against.
 *
 * <p>Unlike {@link EventNotDeletableException} this is not pointing at a gentler
 * action that achieves the same end - take-down does not resolve it either.
 * What resolves it is settling the payout question with the organiser first,
 * which is a conversation rather than an endpoint.
 */
public class EventPaidOutException extends ApiException {
    public EventPaidOutException(Long eventId, String invoiceNo) {
        super(ErrorCode.EVENT_PAID_OUT,
                "Event " + eventId + " has already been paid out on invoice " + invoiceNo
                        + " and cannot be deleted, even by force. The transfer is recorded against this "
                        + "event and deleting it would leave that payment unaccounted for. Take the event "
                        + "down and settle the payout with the organizer first.");
    }
}
