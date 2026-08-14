package com.eventbooking.service.event;

import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;

public interface EventService {
    EventResponse createEvent(CreateEventRequest request);
    EventResponse getEvent(Long eventId);
    EventResponse updateEvent(Long eventId, UpdateEventRequest request);
    void publishEvent(Long eventId);
    void verifyEventIsOnSale(Long eventId);
}
