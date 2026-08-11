package com.eventbooking.dto.eventseat;

import java.util.List;

public record SeatSectionResponse(
        String sectionLabel,
        List<EventSeatResponse> seats
) {
}
