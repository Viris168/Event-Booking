package com.eventbooking.dto.venue;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

/** organizerId comes from the caller, not the body - see CreateEventRequest. */
public record CreateVenueRequest(
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
