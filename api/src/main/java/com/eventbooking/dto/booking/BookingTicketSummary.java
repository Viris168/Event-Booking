package com.eventbooking.dto.booking;

/**
 * How many tickets a booking has and how many have been scanned at the gate.
 *
 * <p>Carried on the "my bookings" list so the page can say "2 QR" or "All
 * used" without asking for each booking's tickets one request at a time.
 */
public record BookingTicketSummary(long total, long checkedIn) {

    public static final BookingTicketSummary NONE = new BookingTicketSummary(0, 0);
}
