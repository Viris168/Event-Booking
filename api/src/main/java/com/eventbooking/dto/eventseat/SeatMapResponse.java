package com.eventbooking.dto.eventseat;

import java.util.List;

public record SeatMapResponse(
        Long eventId,
        List<SeatSectionResponse> sections
) {
}
