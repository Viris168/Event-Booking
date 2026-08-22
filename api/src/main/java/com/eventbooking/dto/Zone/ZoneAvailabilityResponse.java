package com.eventbooking.dto.Zone;

public record ZoneAvailabilityResponse(
    Long id,
    String nameEn,
    String nameKm,
    int priceUsdCents,
    int capacity,
    int heldQty,
    int soldQty
) {}