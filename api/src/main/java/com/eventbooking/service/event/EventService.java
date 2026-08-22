package com.eventbooking.service.event;

import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import org.springframework.data.domain.Page;

import java.util.List;

public interface EventService {
    Page<EventResponse> listEvents(int page, int size);
    EventResponse createEvent(CreateEventRequest request);
    EventResponse getEvent(Long eventId);
    EventResponse updateEvent(Long eventId, UpdateEventRequest request);
    EventResponse publishEvent(Long eventId);
    void verifyEventIsOnSale(Long eventId);
}
