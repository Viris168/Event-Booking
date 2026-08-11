package com.eventbooking.dto.venue;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record UpdateVenueRequest(
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
