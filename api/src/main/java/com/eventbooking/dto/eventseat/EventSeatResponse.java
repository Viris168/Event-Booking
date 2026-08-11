package com.eventbooking.dto.eventseat;

import com.eventbooking.Enumeration.SeatStatus;

import java.math.BigDecimal;
import java.time.Instant;

public record EventSeatResponse(
        Long id,
        Long eventId,
        Long venueSeatId,
        String sectionLabel,
        String rowLabel,
        String seatNumber,
        BigDecimal posX,
        BigDecimal posY,
        Long seatClassId,
        String seatClassNameEn,
        Integer priceUsdCents,
        SeatStatus status,
        Long holdId,
        Instant holdExpiresAt,
        Long version
) {
}
