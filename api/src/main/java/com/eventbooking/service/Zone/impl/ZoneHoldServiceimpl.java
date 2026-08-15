package com.eventbooking.service.Zone.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventNotOnSaleException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.catalog.error.InvalidZoneCapacityException;
import com.eventbooking.dto.hold.HeldZoneItem;
import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.inventory.error.InsufficientZoneCapacityException;
import com.eventbooking.inventory.error.InvalidHoldTargetException;
import com.eventbooking.model.*;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.service.Zone.ZoneHoldService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
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
    public HoldResponse createHold(Long eventId, Long zoneId,  Long userId, int quantity) {
            if (quantity <= 0) {throw new InvalidHoldTargetException("Hold quantity must be greater than zero");}
            Instant now = Instant.now();
            Event event = eventRepository.findById(eventId).orElseThrow(() -> new EventNotFoundException(eventId));
            if (event.getStatus() != EventStatus.PUBLISHED
                    || now.isBefore(event.getSalesOpenAt())
                    || !now.isBefore(event.getSalesCloseAt())) {
                throw new EventNotOnSaleException(eventId);
            }

            EventZone zone = eventZoneRepository.findByIdAndEventIdForUpdate(zoneId, eventId).orElseThrow(() -> new EventZoneNotFoundException(zoneId));
            if (!Boolean.TRUE.equals(zone.getActive())) {
                throw new InvalidHoldTargetException("Zone is inactive");
            }

            // Mark old holds expired for this zone.
            holdRepository.expireActiveHoldsForZone(zoneId, now, HoldStatus.ACTIVE, HoldStatus.EXPIRED);
            long consumed = holdRepository.sumConsumedQuantityByZoneId(zoneId, now, HoldStatus.ACTIVE, HoldStatus.CONSUMED);
            long remaining = (long) zone.getCapacity() - consumed;

            if (remaining < quantity) { throw new InsufficientZoneCapacityException(
                        "Not enough tickets remaining in this zone");
            }

            AppUser user = appUserRepository.findById(userId)
                    .orElseThrow(() -> new InvalidHoldTargetException("User not found"));

            Hold hold = Hold.builder()
                    .event(event)
                    .user(user)
                    .status(HoldStatus.ACTIVE)
                    .expiresAt(now.plus(10, ChronoUnit.MINUTES))
                    .build();

            HoldZoneLine zoneLine = HoldZoneLine.builder()
                    .hold(hold)
                    .eventZone(zone)
                    .qty(quantity)
                    .build();

            hold.getZoneLines().add(zoneLine);

            Hold savedHold = holdRepository.save(hold);

            return new HoldResponse(
                    savedHold.getId(),
                    eventId,
                    userId,
                    savedHold.getStatus(),
                    savedHold.getExpiresAt(),
                    savedHold.getCreatedAt(),
                    savedHold.getExtended(),
                    List.of(),
                    List.of(new HeldZoneItem(
                            zoneId,
                            zone.getNameEn(),
                            quantity,
                            zone.getPriceUsdCents()
                    )),
                    Math.multiplyExact(zone.getPriceUsdCents(), quantity)
            );
    }

    @Override
    public HoldResponse getHold(Long holdId, Long userId) {
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new InvalidHoldTargetException("User not found"));
        Hold savedHold = holdRepository.findById(holdId).orElseThrow(() -> new EventNotFoundException(holdId));

        return new HoldResponse(
                savedHold.getId(),
                savedHold.getEvent().getId(),
                userId,
                savedHold.getStatus(),
                savedHold.getExpiresAt(),
                savedHold.getCreatedAt(),
                savedHold.getExtended(),
                List.of(),
                List.of(new HeldZoneItem(
                        savedHold.getZoneLines().stream().map(EventZone::getId).toList(),
                        zone.getNameEn(),
                        quantity,
                        zone.getPriceUsdCents()
                )),
                Math.multiplyExact(zone.getPriceUsdCents(), )
        );

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
