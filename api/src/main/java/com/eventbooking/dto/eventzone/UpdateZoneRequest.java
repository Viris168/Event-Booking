package com.eventbooking.dto.eventzone;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record UpdateZoneRequest(
        @Size(min = 1, max = 255) String nameEn,
        @Size(min = 1, max = 255) String nameKm,
        @Positive Integer priceUsdCents,
        @Positive Integer capacity
) {
}
