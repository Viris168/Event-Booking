package com.eventbooking.ticket.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Asked to reverse a check-in that never happened.
 *
 * <p>A 409 rather than a silent no-op: two supervisors both undoing the same
 * mistaken scan should not both be told it worked, or the second will go
 * looking for a second mistake that does not exist.
 */
public class TicketNotCheckedInException extends ApiException {
    public TicketNotCheckedInException(Long ticketId) {
        super(ErrorCode.TICKET_NOT_CHECKED_IN,
                "Ticket " + ticketId + " has not been checked in, so there is nothing to reverse.");
    }
}
