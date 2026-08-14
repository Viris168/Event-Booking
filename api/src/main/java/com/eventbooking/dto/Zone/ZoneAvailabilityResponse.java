package com.eventbooking.dto.Zone;

public record ZoneAvailabilityResponse(
    Long zoneId,
    String zoneName,
    int unitPriceUsdCents,
    int capacity,
    int consumedQuantity,
    int availableQuantity
) {}