package com.eventbooking.dto.event;

import com.eventbooking.Enumeration.InventoryMode;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * organizerId is deliberately absent. It used to be a field here, which meant
 * the client picked the row's owner and the server believed it - anyone could
 * create an event belonging to any organiser. The server now derives it from
 * the caller (OrganizerResolver), so forging it is not merely rejected, it is
 * unrepresentable.
 */
public record CreateEventRequest(
        @NotNull Long venueId,
        @NotNull InventoryMode inventoryMode,
        @NotBlank @Size(max = 200) String slug,
        @NotBlank String titleEn,
        @NotBlank String titleKm,
        String descriptionEn,
        String descriptionKm,
        String category,
        Integer cover,
        @NotNull @Future Instant startsAt,
        @NotNull Instant doorsOpenAt,
        @NotNull Instant salesOpenAt,
        @NotNull Instant salesCloseAt
) {
    @AssertTrue(message = "salesCloseAt must be before or equal to startsAt")
    public boolean isSalesWindowValid() {
        return salesCloseAt == null || startsAt == null || !salesCloseAt.isAfter(startsAt);
    }

    @AssertTrue(message = "salesOpenAt must be before salesCloseAt")
    public boolean isSalesPeriodValid() {
        return salesOpenAt == null || salesCloseAt == null || salesOpenAt.isBefore(salesCloseAt);
    }

    @AssertTrue(message = "doorsOpenAt must be before or equal to startsAt")
    public boolean isDoorsOpenTimeValid() {
        return doorsOpenAt == null || startsAt == null || !doorsOpenAt.isAfter(startsAt);
    }
}
