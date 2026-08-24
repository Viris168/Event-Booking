package com.eventbooking.dto.seatclass;

public record SeatClassResponse(
        Long id,
        Long eventId,
        String nameEn,
        String nameKm,
        Integer priceUsdCents,
        long seatCount,
        long soldCount,
        /* Seats someone else is part-way through buying. Counted separately from
           sold because a hold is temporary - it lapses back to available - and a
           capacity bar that folded the two together would tell a customer a tier
           was gone when it was only busy. */
        long heldCount
) {
}
