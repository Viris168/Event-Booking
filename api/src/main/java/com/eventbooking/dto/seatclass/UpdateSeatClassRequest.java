package com.eventbooking.dto.seatclass;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record UpdateSeatClassRequest(
        @Size(min = 1, max = 255) String nameEn,
        @Size(min = 1, max = 255) String nameKm,
        @Positive Integer priceUsdCents
) {
}
