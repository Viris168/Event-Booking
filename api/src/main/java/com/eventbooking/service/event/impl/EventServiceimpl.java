package com.eventbooking.service.event.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.catalog.error.EventNotOnSaleException;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.InvalidEventStatusTransitionException;
import com.eventbooking.catalog.error.InventoryModeChangeBlockedException;
import com.eventbooking.catalog.error.VenueNotFoundException;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.mapper.Event.EventMapper;
import com.eventbooking.mapper.Event.EventZoneMapper;
import com.eventbooking.mapper.SeatClass.SeatClassMapper;
import com.eventbooking.model.Event;
import com.eventbooking.model.Venue;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.SeatClassRepository;
import com.eventbooking.repository.VenueRepository;
import com.eventbooking.service.event.EventService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class EventServiceimpl implements EventService {

    private final VenueRepository venueRepository;
    private final EventRepository eventRepository;
    private final SeatClassRepository seatClassRepository;
    private final EventZoneRepository eventZoneRepository;

    public EventServiceimpl(VenueRepository venueRepository, EventRepository eventRepository, SeatClassRepository seatClassRepository, EventZoneRepository eventZoneRepository) {
        this.venueRepository = venueRepository;
        this.eventRepository = eventRepository;
        this.seatClassRepository = seatClassRepository;
        this.eventZoneRepository = eventZoneRepository;
    }

    @Override
    @Transactional
    public EventResponse createEvent(CreateEventRequest request) {
        Venue venue = venueRepository.findById(request.venueId())
                .orElseThrow(() -> new VenueNotFoundException(request.venueId()));

        Event event = eventRepository.save(EventMapper.toEventEntity(request, venue));
        return EventMapper.toEventResponse(event, List.of(), List.of());
    }

    @Override
    @Transactional(readOnly = true)
    public EventResponse getEvent(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
        return toEventResponse(event);
    }

    @Override
    @Transactional
    public EventResponse updateEvent(Long eventId, UpdateEventRequest request) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        if (event.getInventoryMode() != request.inventoryMode()
                && (seatClassRepository.existsByEventId(eventId)
                || eventZoneRepository.existsByEventId(eventId))) {
            throw new InventoryModeChangeBlockedException(
                    "Cannot change inventory mode after inventory has been created for event: " + eventId);
        }

        Venue venue = venueRepository.findById(request.venueId())
                .orElseThrow(() -> new VenueNotFoundException(request.venueId()));

        event.setVenue(venue);
        event.setInventoryMode(request.inventoryMode());
        event.setSlug(request.slug());
        event.setTitleEn(request.titleEn());
        event.setTitleKm(request.titleKm());
        event.setDescriptionEn(request.descriptionEn());
        event.setDescriptionKm(request.descriptionKm());
        event.setStartsAt(request.startsAt());
        event.setDoorsOpenAt(request.doorsOpenAt());
        event.setSalesOpenAt(request.salesOpenAt());
        event.setSalesCloseAt(request.salesCloseAt());
        eventRepository.save(event);

        return toEventResponse(event);
    }

    @Override
    @Transactional
    public void publishEvent(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));

        if (event.getStatus() != EventStatus.DRAFT) {
            throw new InvalidEventStatusTransitionException(
                    event.getStatus(), EventStatus.PUBLISHED);
        }

        event.setStatus(EventStatus.PUBLISHED);
    }

    @Override
    @Transactional(readOnly = true)
    public void verifyEventIsOnSale(Long eventId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
        Instant now = Instant.now();

        if (event.getStatus() != EventStatus.PUBLISHED
                || now.isBefore(event.getSalesOpenAt())
                || !now.isBefore(event.getSalesCloseAt())) {
            throw new EventNotOnSaleException(eventId);
        }
    }

    private EventResponse toEventResponse(Event event) {
        List<SeatClassResponse> seatClasses =
                seatClassRepository.findAllByEventId(event.getId())
                        .stream()
                        .map(SeatClassMapper::toSeatClassResponse)
                        .toList();

        List<EventZoneResponse> zones =
                eventZoneRepository.findAllByEventId(event.getId())
                        .stream()
                        .map(EventZoneMapper::toEventZoneResponse)
                        .toList();
        return EventMapper.toEventResponse(event, seatClasses, zones);
    }
}
