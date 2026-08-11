package com.eventbooking.dto.hold;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;
import java.util.Map;

public record CreateHoldRequest(
        @NotNull Long eventId,
        List<Long> seatIds,
        Map<Long, @Positive Integer> zoneQty
) {
    @AssertTrue(message = "cart must contain at least one seat or zone item")
    private boolean isNotEmpty() {
        boolean hasSeats = seatIds != null && !seatIds.isEmpty();
        boolean hasZones = zoneQty != null && !zoneQty.isEmpty();
        return hasSeats || hasZones;
    }
}
