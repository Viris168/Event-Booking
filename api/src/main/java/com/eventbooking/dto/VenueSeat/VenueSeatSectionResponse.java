package com.eventbooking.dto.VenueSeat;

import java.util.List;

public record VenueSeatSectionResponse(
    String sectionLabel,
    List<VenueSeatResponse> seats
) {}