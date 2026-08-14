package com.eventbooking.dto.venue;

import java.math.BigDecimal;
import java.time.Instant;

public record VenueResponse(
        Long id,
        Long organizerId,
        String nameEn,
        String nameKm,
        String provinceCode,

        String khanDistrict,
        String sangkatCommune,
        String streetAddress,
        BigDecimal lat,
        BigDecimal lng,
        Instant createdAt
) {
}
