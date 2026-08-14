package com.eventbooking.dto.VenueSeat;

import java.util.List;

// Grouped by section for the seat-map authoring screen — same shape
// pattern as SeatMapResponse from the event_seat DTOs, so the frontend
// can reuse the same rendering component for both "author the layout"
// and "view booking status"
public record VenueSeatMapResponse(
    Long venueId,
    List<VenueSeatSectionResponse> sections
) {}

