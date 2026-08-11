package com.eventbooking.dto.hold;

import com.eventbooking.Enumeration.HoldStatus;

import java.time.Instant;
import java.util.List;

public record HoldResponse(
        Long id,
        Long eventId,
        Long userId,
        HoldStatus status,
        Instant expiresAt,
        Instant createdAt,
        boolean extended,
        List<HeldSeatItem> seats,
        List<HeldZoneItem> zones,
        Integer totalUsdCents
) {
}
