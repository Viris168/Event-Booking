package com.eventbooking.dto.admin;

import com.eventbooking.Enumeration.BookingStatus;

import java.time.Instant;

/**
 * One line of somebody's booking history, as the admin user list renders it.
 *
 * <p>Deliberately not BookingResponse. That carries items, tickets, the hold it
 * came from and the buyer's contact details - none of which the admin list
 * shows, and all of which would be sent once per booking per user for every row
 * on screen. This is the four fields the expanded row actually prints.
 */
public record AdminBookingSummary(
        Long id,
        String bookingRef,
        BookingStatus state,
        Instant createdAt,
        Long totalUsdCents
) {
}
