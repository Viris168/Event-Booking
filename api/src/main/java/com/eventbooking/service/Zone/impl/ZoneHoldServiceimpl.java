package com.eventbooking.service.Zone.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventNotOnSaleException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.dto.hold.HeldZoneItem;
import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.inventory.error.HoldNotActiveException;
import com.eventbooking.inventory.error.HoldNotFoundException;
import com.eventbooking.inventory.error.InsufficientZoneCapacityException;
import com.eventbooking.inventory.error.InvalidHoldTargetException;
import com.eventbooking.model.*;
import com.eventbooking.repository.*;
import com.eventbooking.service.Zone.ZoneHoldService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class ZoneHoldServiceimpl implements ZoneHoldService {

    private final EventRepository eventRepository;
    private final EventZoneRepository eventZoneRepository;
    private final HoldRepository holdRepository;
    private final AppUserRepository appUserRepository;
    private final HoldZoneLineRepository holdZoneLineRepository;

    public ZoneHoldServiceimpl(EventRepository eventRepository, EventZoneRepository eventZoneRepository, HoldRepository holdRepository, AppUserRepository appUserRepository, HoldZoneLineRepository holdZoneLineRepository) {
        this.eventRepository = eventRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.holdRepository = holdRepository;
        this.appUserRepository = appUserRepository;
        this.holdZoneLineRepository = holdZoneLineRepository;
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

            expireActiveHoldsForZone(zoneId, now);

            EventZone zone = eventZoneRepository.findByIdAndEventIdForUpdate(zoneId, eventId).orElseThrow(() -> new EventZoneNotFoundException(zoneId));
            if (!Boolean.TRUE.equals(zone.getActive())) {
                throw new InvalidHoldTargetException("Zone is inactive");
            }

            long remaining = (long) zone.getCapacity()
                    - zone.getHeldQty()
                    - zone.getSoldQty();

            if (remaining < quantity) { throw new InsufficientZoneCapacityException(
                        "Not enough tickets remaining in this zone");
            }

            zone.setHeldQty(Math.toIntExact((long) zone.getHeldQty() + quantity));

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
    @Transactional(readOnly = true)
    public HoldResponse getHold(Long holdId, Long userId) {
        Hold hold = holdRepository.findByIdAndUser_Id(holdId, userId)
                .orElseThrow(() -> new HoldNotFoundException(holdId));

        List<HeldZoneItem> zones = holdZoneLineRepository.findByHoldId(holdId)
                .stream()
                .map(line -> new HeldZoneItem(
                        line.getEventZone().getId(),
                        line.getEventZone().getNameEn(),
                        line.getQty(),
                        line.getEventZone().getPriceUsdCents()
                ))
                .toList();

        int totalUsdCents = zones.stream()
                .mapToInt(zone -> Math.multiplyExact(zone.unitPriceUsdCents(), zone.qty()))
                .reduce(0, Math::addExact);

        return new HoldResponse(
                hold.getId(),
                hold.getEvent().getId(),
                hold.getUser().getId(),
                hold.getStatus(),
                hold.getExpiresAt(),
                hold.getCreatedAt(),
                hold.getExtended(),
                List.of(),
                zones,
                totalUsdCents
        );

    }

    @Override
    public void releaseHold(Long holdId, Long userId) {
        Hold hold = holdRepository.findOwnedByIdForUpdate(holdId, userId)
                .orElseThrow(() -> new HoldNotFoundException(holdId));

        Instant now = Instant.now();

        if (hold.getStatus() == HoldStatus.RELEASED) {
            return;
        }

        if (hold.getStatus() == HoldStatus.ACTIVE
                && !hold.getExpiresAt().isAfter(now)) {
            releaseHeldZoneInventory(hold);
            hold.setStatus(HoldStatus.EXPIRED);
            return;
        }

        if (hold.getStatus() != HoldStatus.ACTIVE) {
            throw new HoldNotActiveException("Only an active hold can be released");
        }

        releaseHeldZoneInventory(hold);
        hold.setStatus(HoldStatus.RELEASED);
    }

    @Override
    public int expireActiveHolds(Instant currentTime) {
        int expired = 0;
        for (Long holdId : holdRepository.findExpiredActiveHoldIds(currentTime, HoldStatus.ACTIVE)) {
            if (expireHoldIfStillExpired(holdId, currentTime)) {
                expired++;
            }
        }
        return expired;
    }

    private void expireActiveHoldsForZone(Long zoneId, Instant now) {
        for (Long holdId : holdRepository.findExpiredActiveHoldIdsByZoneId(
                zoneId, now, HoldStatus.ACTIVE)) {
            expireHoldIfStillExpired(holdId, now);
        }
    }

    private boolean expireHoldIfStillExpired(Long holdId, Instant now) {
        Hold hold = holdRepository.findByIdForUpdate(holdId).orElse(null);

        if (hold == null
                || hold.getStatus() != HoldStatus.ACTIVE
                || hold.getExpiresAt().isAfter(now)) {
            return false;
        }

        releaseHeldZoneInventory(hold);
        hold.setStatus(HoldStatus.EXPIRED);
        return true;
    }

    private void releaseHeldZoneInventory(Hold hold) {
        List<HoldZoneLine> zoneLines = holdZoneLineRepository.findByHoldId(hold.getId());
        Map<Long, EventZone> lockedZones = lockZonesOf(zoneLines);

        for (HoldZoneLine line : zoneLines) {
            EventZone zone = lockedZones.get(line.getEventZone().getId());
            int quantity = line.getQty();

            if (zone.getHeldQty() < quantity) {
                throw new IllegalStateException(
                        "Zone " + zone.getId() + " has fewer held tickets than hold " + hold.getId());
            }

            zone.setHeldQty(zone.getHeldQty() - quantity);
        }
    }

    private Map<Long, EventZone> lockZonesOf(List<HoldZoneLine> zoneLines) {
        if (zoneLines.isEmpty()) {
            return Map.of();
        }

        List<Long> zoneIds = zoneLines.stream()
                .map(line -> line.getEventZone().getId())
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();

        Map<Long, EventZone> zonesById = new HashMap<>();
        for (EventZone zone : eventZoneRepository.findAllByIdForUpdate(zoneIds)) {
            zonesById.put(zone.getId(), zone);
        }
        return zonesById;
    }
}
