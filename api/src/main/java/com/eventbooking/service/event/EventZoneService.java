package com.eventbooking.service.event;

import com.eventbooking.dto.eventzone.CreateEventZoneRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.eventzone.UpdateZoneRequest;

import java.util.List;

/**
 * Zones are the ZONED tier's inventory: a named capacity at a price.
 *
 * <p>Every write takes an {@code organizerId} because a zone belongs to an
 * event, and an event belongs to an organiser. The reads do not: what is on
 * sale at an event is public.
 */
public interface EventZoneService {
    EventZoneResponse createZone(Long organizerId, Long eventId, CreateEventZoneRequest request);
    EventZoneResponse getZone(Long zoneId);
    List<EventZoneResponse> findByEvent(Long eventId);
    EventZoneResponse updateZone(Long organizerId, Long zoneId, UpdateZoneRequest request);
    void deactivateZone(Long organizerId, Long zoneId);
}
