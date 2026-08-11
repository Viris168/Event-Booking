package com.eventbooking.dto.seatclass;

public record SeatClassResponse(
        Long id,
        Long eventId,
        String nameEn,
        String nameKm,
        Integer priceUsdCents,
        long seatCount,
        long soldCount
) {
}
