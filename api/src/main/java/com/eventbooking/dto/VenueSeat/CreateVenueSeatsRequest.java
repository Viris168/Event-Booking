package com.eventbooking.dto.VenueSeat;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;

/**
 * <p><b>The venue is not in here.</b> It used to be, while the id was also in
 * the URL - which meant ownership could be checked against the path value while
 * the write happened against the body value, and the check protected nothing.
 * One id, one source: the path.
 */
public record CreateVenueSeatsRequest(
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