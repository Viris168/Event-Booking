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
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventZoneService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class EventZoneServiceimpl implements EventZoneService {

    private final EventRepository eventRepository;
    private final EventZoneRepository eventZoneRepository;
    private final OrganizerResolver organizerResolver;

    public EventZoneServiceimpl(EventRepository eventRepository,
                                EventZoneRepository eventZoneRepository,
                                OrganizerResolver organizerResolver) {
        this.eventRepository = eventRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.organizerResolver = organizerResolver;
    }

    /**
     * A zone has no organiser of its own - it inherits the event's. Resolving
     * through the event is what makes "is this zone yours" answerable at all.
     */
    private EventZone requireOwnedZone(Long organizerId, Long zoneId) {
        EventZone zone = eventZoneRepository.findById(zoneId)
                .orElseThrow(() -> new EventZoneNotFoundException(zoneId));
        organizerResolver.requireOwner(
                organizerId, zone.getEvent().getOrganizerId(), "zone", zoneId);
        return zone;
    }

    @Override
    @Transactional
    public EventZoneResponse createZone(Long organizerId, Long eventId, CreateEventZoneRequest request) {
        Event e = eventRepository.findById(eventId).orElseThrow(()-> new EventNotFoundException(eventId));
        organizerResolver.requireOwner(organizerId, e.getOrganizerId(), "event", eventId);
        EventZone eventZone = EventZoneMapper.toEventZone(e, request);
        eventZoneRepository.save(eventZone);
        return EventZoneMapper.toEventZoneResponse(eventZone);
    }

    @Override
    @Transactional(readOnly = true)
    public EventZoneResponse getZone(Long zoneId) {
        EventZone eventZone =   eventZoneRepository.findById(zoneId).orElseThrow(()-> new EventZoneNotFoundException(zoneId));
        return EventZoneMapper.toEventZoneResponse(eventZone);
    }

    @Override
    @Transactional(readOnly = true)
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
    @Transactional
    public EventZoneResponse updateZone(Long organizerId, Long zoneId, UpdateZoneRequest request) {
        EventZone eventZone = requireOwnedZone(organizerId, zoneId);

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
    @Transactional
    public void deactivateZone(Long organizerId, Long zoneId) {
        EventZone eventZone = requireOwnedZone(organizerId, zoneId);
        eventZone.setActive(false);
        eventZoneRepository.save(eventZone);
    }
}
