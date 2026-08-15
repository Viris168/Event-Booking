package com.eventbooking.service.Zone.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventNotOnSaleException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.catalog.error.InvalidZoneCapacityException;
import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.inventory.error.InvalidHoldTargetException;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventZone;
import com.eventbooking.model.Hold;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.service.Zone.ZoneHoldService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Service
@Transactional
public class ZoneHoldServiceimpl implements ZoneHoldService {

    private final EventRepository eventRepository;
    private final EventZoneRepository eventZoneRepository;
    private final HoldRepository holdRepository;

    public ZoneHoldServiceimpl(EventRepository eventRepository, EventZoneRepository eventZoneRepository, HoldRepository holdRepository) {
        this.eventRepository = eventRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.holdRepository = holdRepository;
    }

    @Override
    public HoldResponse createHold(Long eventId, Long zoneId, int quantity) {
        if (quantity <= 0) {
            throw new InvalidHoldTargetException("Hold quantity must be greater than zero");
        }
        Event event = eventRepository.findById(eventId).orElseThrow(() -> new EventNotFoundException(eventId));
        Instant now = Instant.now();
        if (event.getStatus() != EventStatus.PUBLISHED || now.isBefore(event.getSalesOpenAt()) || !now.isBefore(event.getSalesCloseAt())) {
            throw new EventNotOnSaleException(eventId);
        }
        EventZone eventZone = eventZoneRepository.findById(zoneId).orElseThrow(() -> new EventZoneNotFoundException(zoneId));
        if (!eventZone.getEvent().getId().equals(eventId)) {
            throw new InvalidHoldTargetException("Zone does not belong to the requested event");
        }

        Optional<EventZone> zone = eventZoneRepository.findByIdAndEventIdForUpdate(zoneId, eventId);



        return null;
    }

    @Override
    public HoldResponse getHold(Long holdId, Long userId) {
        return null;
    }

    @Override
    public void releaseHold(Long holdId, Long userId) {

    }

    @Override
    public int expireActiveHolds(Instant currentTime) {

        return 0;
    }

    @Override
    @Transactional
    public void convertHold(Long holdId) {
        Hold hold = holdRepository.findById(holdId).orElseThrow(() -> new InvalidHoldTargetException("Hold id not found"));
        if (hold.getStatus() != HoldStatus.ACTIVE) {
            throw new RuntimeException("Cannot checkout: This cart has expired or was already processed.");
        }
        hold.setStatus(HoldStatus.CONSUMED);
        holdRepository.save(hold);
    }
}
