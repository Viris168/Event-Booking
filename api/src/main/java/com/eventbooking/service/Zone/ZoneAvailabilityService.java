package com.eventbooking.service.Zone;

import com.eventbooking.dto.Zone.ZoneAvailabilityResponse;

import java.util.List;

public interface ZoneAvailabilityService {
    ZoneAvailabilityResponse getAvailability(Long zoneId);
    List<ZoneAvailabilityResponse> getEventAvailability(Long eventId);
}