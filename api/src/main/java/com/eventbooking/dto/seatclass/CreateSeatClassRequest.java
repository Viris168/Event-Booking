package com.eventbooking.dto.seatclass;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record CreateSeatClassRequest(
        @NotBlank String nameEn,
        @NotBlank String nameKm,
        @Positive Integer priceUsdCents
) {
}
