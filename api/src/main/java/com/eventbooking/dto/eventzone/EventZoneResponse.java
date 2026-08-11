package com.eventbooking.dto.eventzone;

public record EventZoneResponse(
        Long id,
        Long eventId,
        String nameEn,
        String nameKm,
        Integer priceUsdCents,
        Integer capacity,
        Integer heldQty,
        Integer soldQty,
        Integer remainingQty,
        Long version
) {
}
