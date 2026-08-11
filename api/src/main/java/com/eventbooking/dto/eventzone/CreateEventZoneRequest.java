package com.eventbooking.dto.eventzone;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record CreateEventZoneRequest(
        @NotBlank String nameEn,
        @NotBlank String nameKm,
        @Positive Integer priceUsdCents,
        @Positive Integer capacity
) {
}
