package com.eventbooking.dto.booking;

/**
 * One booking line. Exactly one of eventSeatId / eventZoneId is populated;
 * the other stays null, matching the booking_item CHECK constraint.
 */
public record BookingItemResponse(
        Long id,
        Long eventSeatId,
        Long eventZoneId,
        String label,
        Integer qty,
        Integer unitPriceUsdCents,
        Integer lineTotalUsdCents
) {
}
