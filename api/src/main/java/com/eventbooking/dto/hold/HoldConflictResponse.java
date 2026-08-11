package com.eventbooking.dto.hold;

import java.time.Instant;

public record HoldConflictResponse(
        String error,
        Long existingHoldId,
        Instant existingHoldExpiresAt
) {
}
