package com.eventbooking.dto.eventseat;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record GenerateEventSeatsRequest(
        @NotNull Long seatClassId,
        @NotEmpty List<Long> venueSeatIds
) {
}
