package com.eventbooking.dto.VenueSeat;

import java.math.BigDecimal;

public record VenueSeatResponse(
    Long id,
    Long venueId,
    String sectionLabel,
    String rowLabel,
    String seatNumber,
    BigDecimal posX,
    BigDecimal posY
) {}