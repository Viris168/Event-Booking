package com.eventbooking.dto.booking;

/**
 * Confirmed booking value for one calendar month.
 *
 * <p>Exists so a twelve-bar chart costs twelve objects instead of five hundred
 * bookings. The dashboard previously fetched a page of raw bookings and summed
 * them in the browser, which was both wasteful and wrong past the page size -
 * a thirteenth month of data simply vanished.
 */
public record MonthlyRevenueResponse(
        int year,
        /** 1-12, not 0-11: this is a wire format, and Java's Month is 1-based. */
        int month,
        long cents,
        long bookings
) {
}
