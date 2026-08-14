package com.eventbooking.dto.VenueSeat;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;

public record CreateVenueSeatsRequest(
        @NotNull Long venueId,
        @NotEmpty List<@NotNull VenueSeatLine> seats
) {
    @AssertTrue(message = "seats list contains a duplicate section/row/seat_number combination")
    private boolean isNoDuplicateWithinRequest() {
        var seen = new HashSet<String>();
        return seats == null || seats.stream()
                .map(s -> s.sectionLabel() + "|" + s.rowLabel() + "|" + s.seatNumber())
                .allMatch(seen::add);
    }

    public record VenueSeatLine(
            @NotBlank String sectionLabel,
            @NotBlank String rowLabel,
            @NotBlank String seatNumber,
            @NotNull BigDecimal posX,
            @NotNull BigDecimal posY
    ) {}
}