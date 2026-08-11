package com.eventbooking.dto.hold;

public record HeldZoneItem(
        Long eventZoneId,
        String nameEn,
        Integer qty,
        Integer unitPriceUsdCents
) {
}
