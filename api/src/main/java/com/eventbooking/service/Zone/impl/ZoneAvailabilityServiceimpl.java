package com.eventbooking.service.Zone.impl;

import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.dto.Zone.ZoneAvailabilityResponse;
import com.eventbooking.model.EventZone;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.service.Zone.ZoneAvailabilityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ZoneAvailabilityServiceimpl implements ZoneAvailabilityService {

    private final HoldRepository holdRepository;
    private final EventZoneRepository eventZoneRepository;
    private final EventRepository eventRepository;

    public ZoneAvailabilityServiceimpl(
            HoldRepository holdRepository,
            EventZoneRepository eventZoneRepository,
            EventRepository eventRepository
    ) {
        this.holdRepository = holdRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.eventRepository = eventRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public ZoneAvailabilityResponse getAvailability(Long zoneId) {
        EventZone eventZone = eventZoneRepository.findById(zoneId)
                .orElseThrow(() -> new EventZoneNotFoundException(zoneId));
        Instant now = Instant.now();
        int consumedQuantity = Math.toIntExact(holdRepository.sumConsumedQuantityByZoneId(zoneId, now, HoldStatus.ACTIVE, HoldStatus.CONSUMED));

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
        Instant now = Instant.now();
        Map<Long, Long> result = holdRepository.sumConsumedQuantityByEvent(eventId, now, HoldStatus.ACTIVE, HoldStatus.CONSUMED)
                .stream()
                .collect(Collectors.toMap(
                        HoldRepository.ZoneConsumed::getId,
                        HoldRepository.ZoneConsumed::getConsumedQuantity
                ));

        return eventZones.stream()
                .map(f -> {
                    int consumedQuantity = Math.toIntExact(
                            result.getOrDefault(f.getId(), 0L));
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
