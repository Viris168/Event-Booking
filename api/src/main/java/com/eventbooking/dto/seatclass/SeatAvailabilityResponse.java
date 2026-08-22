package com.eventbooking.dto.seatclass;

public record SeatAvailabilityResponse(
    Long id,
    String sectionLabel,
    String rowLabel,
    String seatNumber,
    Long seatClassId,
    String seatClassNameEn,
    Integer priceUsdCents,
    String status
) {}