package com.eventbooking.dto.venue;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record CreateVenueRequest(
        @NotNull Long organizerId,
        @NotBlank String nameEn,
        @NotBlank String nameKm,
        @NotBlank String provinceCode,
        @NotBlank String khanDistrict,
        @NotBlank String sangkatCommune,
        @NotBlank String streetAddress,
        BigDecimal lat,
        BigDecimal lng
) {
}
