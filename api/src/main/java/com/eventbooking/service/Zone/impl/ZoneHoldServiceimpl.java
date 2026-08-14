package com.eventbooking.service.Zone.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventNotOnSaleException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventZone;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.service.Zone.ZoneHoldService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@Transactional
public class ZoneHoldServiceimpl implements ZoneHoldService {

    private final EventRepository eventRepository;
    private final EventZoneRepository eventZoneRepository;

    public ZoneHoldServiceimpl(EventRepository eventRepository, EventZoneRepository eventZoneRepository) {
        this.eventRepository = eventRepository;
        this.eventZoneRepository = eventZoneRepository;
    }

    @Override
    public HoldResponse createHold(Long eventId, Long zoneId, String holderToken, int quantity) {
        Event event = eventRepository.findById(eventId).orElseThrow(() -> new EventNotFoundException(eventId));
        Instant now = Instant.now();
        if(event.getStatus() != EventStatus.PUBLISHED || now.isBefore(event.getSalesOpenAt()) || !now.isBefore(event.getSalesCloseAt())) {
            throw new EventNotOnSaleException(eventId);
        }
        EventZone eventZone = eventZoneRepository.findById(zoneId).orElseThrow(() -> new EventZoneNotFoundException(eventId));
        eventZone.
        return null;
    }

    @Override
    public HoldResponse getHold(Long holdId, String holderToken) {
        return null;
    }

    @Override
    public void releaseHold(Long holdId, String holderToken) {

    }

    @Override
    public int expireActiveHolds(Instant currentTime) {
        return 0;
    }

    @Override
    public void convertHold(Long holdId) {

    }
}
