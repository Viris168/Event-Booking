package com.eventbooking.service.event.impl;

import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.catalog.error.InvalidZoneCapacityException;
import com.eventbooking.dto.eventzone.CreateEventZoneRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.eventzone.UpdateZoneRequest;
import com.eventbooking.mapper.Event.EventZoneMapper;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventZone;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.service.event.EventZoneService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class EventZoneServiceimpl implements EventZoneService {

    private final EventRepository eventRepository;
    private final EventZoneRepository eventZoneRepository;

    public EventZoneServiceimpl(EventRepository eventRepository, EventZoneRepository eventZoneRepository) {
        this.eventRepository = eventRepository;
        this.eventZoneRepository = eventZoneRepository;
    }

    @Override
    public EventZoneResponse createZone(Long eventId, CreateEventZoneRequest request) {
        Event e = eventRepository.findById(eventId).orElseThrow(()-> new EventNotFoundException(eventId));
        EventZone eventZone = EventZoneMapper.toEventZone(e, request);
        eventZoneRepository.save(eventZone);
        return EventZoneMapper.toEventZoneResponse(eventZone);
    }

    @Override
    public EventZoneResponse getZone(Long zoneId) {
        EventZone eventZone =   eventZoneRepository.findById(zoneId).orElseThrow(()-> new EventZoneNotFoundException(zoneId));
        return EventZoneMapper.toEventZoneResponse(eventZone);
    }

    @Override
    public List<EventZoneResponse> findByEvent(Long eventId) {
        if (!eventRepository.existsById(eventId)) {
            throw new EventNotFoundException(eventId);
        }
        List<EventZone> eventZone =   eventZoneRepository.findAllByEventId(eventId);
        return eventZone.stream()
                .map(EventZoneMapper::toEventZoneResponse)
                .toList();
    }

    @Override
    public EventZoneResponse updateZone(Long zoneId, UpdateZoneRequest request) {
        EventZone eventZone = eventZoneRepository.findById(zoneId)
                .orElseThrow(() -> new EventZoneNotFoundException(zoneId));

        if (request.nameEn() != null) {
            eventZone.setNameEn(request.nameEn());
        }
        if (request.nameKm() != null) {
            eventZone.setNameKm(request.nameKm());
        }
        if (request.priceUsdCents() != null) {
            eventZone.setPriceUsdCents(request.priceUsdCents());
        }
        if (request.capacity() != null) {
            if (request.capacity() < eventZone.getSoldQty() + eventZone.getHeldQty()) {
                throw new InvalidZoneCapacityException(zoneId);
            }
            eventZone.setCapacity(request.capacity());
        }

        return EventZoneMapper.toEventZoneResponse(eventZoneRepository.save(eventZone));
    }

    @Override
    public void deactivateZone(Long zoneId) {
        EventZone eventZone = eventZoneRepository.findById(zoneId)
                .orElseThrow(() -> new EventZoneNotFoundException(zoneId));
        eventZone.setActive(false);
        eventZoneRepository.save(eventZone);
    }
}
