package com.eventbooking.ticket.error;

import com.eventbooking.common.error.ApiException;
import com.eventbooking.common.error.ErrorCode;

/**
 * Also thrown for somebody else's ticket, for the same reason as bookings and
 * holds: a 403 would confirm the id exists, and ticket ids appear inside QR
 * payloads.
 */
public class TicketNotFoundException extends ApiException {
    public TicketNotFoundException(Long ticketId) {
        super(ErrorCode.TICKET_NOT_FOUND, "Ticket " + ticketId + " does not exist.");
    }
}
