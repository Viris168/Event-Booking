package com.eventbooking.dto.seatclass;

public record SeatAvailabilityResponse(
    Long eventSeatId,
    String sectionLabel,
    String rowLabel,
    String seatNumber,
    String status
) {}