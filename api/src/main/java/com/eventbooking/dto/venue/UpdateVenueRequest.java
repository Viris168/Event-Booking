package com.eventbooking.dto.venue;

import java.math.BigDecimal;

public record UpdateVenueRequest(
        String nameEn,
        String nameKm,
        String provinceCode,
        String khanDistrict,
        String sangkatCommune,
        String streetAddress,
        BigDecimal lat,
        BigDecimal lng
) {
}
