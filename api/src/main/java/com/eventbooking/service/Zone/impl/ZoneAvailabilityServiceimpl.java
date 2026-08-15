package com.eventbooking.service.Zone.impl;

import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.dto.Zone.ZoneAvailabilityResponse;
import com.eventbooking.model.EventZone;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.service.Zone.ZoneAvailabilityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ZoneAvailabilityServiceimpl implements ZoneAvailabilityService {

    private final EventZoneRepository eventZoneRepository;
    private final EventRepository eventRepository;

    public ZoneAvailabilityServiceimpl(
            EventZoneRepository eventZoneRepository,
            EventRepository eventRepository
    ) {
        this.eventZoneRepository = eventZoneRepository;
        this.eventRepository = eventRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public ZoneAvailabilityResponse getAvailability(Long zoneId) {
        EventZone eventZone = eventZoneRepository.findById(zoneId)
                .orElseThrow(() -> new EventZoneNotFoundException(zoneId));
        int consumedQuantity = eventZone.getHeldQty() + eventZone.getSoldQty();

        int availableQuantity = eventZone.getCapacity() - consumedQuantity;
        return new ZoneAvailabilityResponse(
                eventZone.getId(),
                eventZone.getNameEn(),
                eventZone.getPriceUsdCents(),
                eventZone.getCapacity(),
                consumedQuantity,
                availableQuantity
        );
    }

    @Override
    @Transactional(readOnly = true)
    public List<ZoneAvailabilityResponse> getEventAvailability(Long eventId) {
        if (!eventRepository.existsById(eventId)) {
            throw new EventNotFoundException(eventId);
        }

        List<EventZone> eventZones = eventZoneRepository.findAllByEventId(eventId);
        return eventZones.stream()
                .map(f -> {
                    int consumedQuantity = f.getHeldQty() + f.getSoldQty();
                    return new ZoneAvailabilityResponse(
                            f.getId(),
                            f.getNameEn(),
                            f.getPriceUsdCents(),
                            f.getCapacity(),
                            consumedQuantity,
                            f.getCapacity() - consumedQuantity
                    );
                })
                .toList();
    }
}
