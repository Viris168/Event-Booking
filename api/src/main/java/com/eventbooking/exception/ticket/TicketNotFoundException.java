package com.eventbooking.exception.ticket;

import com.eventbooking.exception.ApiException;
import com.eventbooking.exception.ErrorCode;

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
