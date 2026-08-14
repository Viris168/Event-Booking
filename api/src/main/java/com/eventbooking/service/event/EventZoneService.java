package com.eventbooking.service.event;

import com.eventbooking.dto.eventzone.CreateEventZoneRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.eventzone.UpdateZoneRequest;

import java.util.List;

public interface EventZoneService {
    EventZoneResponse createZone(Long eventId, CreateEventZoneRequest request);
    EventZoneResponse getZone(Long zoneId);
    List<EventZoneResponse> findByEvent(Long eventId);
    EventZoneResponse updateZone(Long zoneId, UpdateZoneRequest request);
    void deactivateZone(Long zoneId);
}