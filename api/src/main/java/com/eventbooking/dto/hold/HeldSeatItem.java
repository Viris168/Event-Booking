package com.eventbooking.dto.hold;

public record HeldSeatItem(
        Long eventSeatId,
        String sectionLabel,
        String rowLabel,
        String seatNumber,
        Integer priceUsdCents
) {
}
