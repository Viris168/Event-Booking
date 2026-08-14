package com.eventbooking.dto.event;

import com.eventbooking.Enumeration.InventoryMode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record UpdateEventRequest(
        @NotNull Long venueId,
        @NotNull InventoryMode inventoryMode,
        @NotBlank @Size(max = 200) String slug,
        @NotBlank String titleEn,
        @NotBlank String titleKm,
        String descriptionEn,
        String descriptionKm,
        @NotNull @Future Instant startsAt,
        @NotNull Instant doorsOpenAt,
        @NotNull Instant salesOpenAt,
        @NotNull Instant salesCloseAt
) {
    @AssertTrue(message = "salesCloseAt must be before or equal to startsAt")
    private boolean isSalesWindowValid() {
        return salesCloseAt == null || startsAt == null || !salesCloseAt.isAfter(startsAt);
    }
}
