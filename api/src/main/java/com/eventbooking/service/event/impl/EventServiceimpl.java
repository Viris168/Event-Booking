package com.eventbooking.service.event.impl;

import com.eventbooking.catalog.error.VenueNotFoundException;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.mapper.Event.EventMapper;
import com.eventbooking.model.Event;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.service.event.EventService;
import org.springframework.stereotype.Service;

@Service
public class EventServiceimpl implements EventService {

    private final VenueRepository venueRepository;
    private final EventRepository eventRepository;

    public EventServiceimpl(VenueRepository venueRepository, EventRepository eventRepository) {
        this.venueRepository = venueRepository;
        this.eventRepository = eventRepository;
    }

    @Override
    public EventResponse createEvent(CreateEventRequest request) {
        Venue venue = venueRepository.findById(request.venueId()).orElseThrow(() -> new VenueNotFoundException(request.venueId()));
        Event event = EventMapper.toEventEntity(request, venue);
        eventRepository.save(event);
        return null;
    }

    @Override
    public EventResponse getEvent(Long eventId) {
        return null;
    }

    @Override
    public EventResponse updateEvent(Long eventId, UpdateEventRequest request) {
        return null;
    }

    @Override
    public void publishEvent(Long eventId) {

    }

    @Override
    public void verifyEventIsOnSale(Long eventId) {

    }
}
