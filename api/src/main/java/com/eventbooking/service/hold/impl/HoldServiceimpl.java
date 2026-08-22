package com.eventbooking.service.hold.impl;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.HoldStatus;
import com.eventbooking.Enumeration.SeatStatus;
import com.eventbooking.catalog.error.EventNotFoundException;
import com.eventbooking.catalog.error.EventNotOnSaleException;
import com.eventbooking.catalog.error.EventZoneNotFoundException;
import com.eventbooking.dto.hold.HeldSeatItem;
import com.eventbooking.dto.hold.HeldZoneItem;
import com.eventbooking.dto.hold.HoldResponse;
import com.eventbooking.inventory.error.HoldNotActiveException;
import com.eventbooking.inventory.error.HoldNotFoundException;
import com.eventbooking.inventory.error.InsufficientZoneCapacityException;
import com.eventbooking.inventory.error.InvalidHoldTargetException;
import com.eventbooking.inventory.error.SeatUnavailableException;
import com.eventbooking.model.AppUser;
import com.eventbooking.model.Event;
import com.eventbooking.model.EventSeat;
import com.eventbooking.model.EventZone;
import com.eventbooking.model.Hold;
import com.eventbooking.model.HoldZoneLine;
import com.eventbooking.repository.AppUserRepository;
import com.eventbooking.repository.EventRepository;
import com.eventbooking.repository.EventSeatRepository;
import com.eventbooking.repository.EventZoneRepository;
import com.eventbooking.repository.HoldRepository;
import com.eventbooking.repository.HoldZoneLineRepository;
import com.eventbooking.service.hold.HoldService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.orm.ObjectOptimisticLockingFailureException;

@Service
public class HoldServiceimpl implements HoldService {

    private static final int HOLD_TTL_MINUTES = 10;

    private final EventRepository eventRepository;
    private final AppUserRepository appUserRepository;
    private final HoldRepository holdRepository;
    private final EventSeatRepository eventSeatRepository;
    private final EventZoneRepository eventZoneRepository;
    private final HoldZoneLineRepository holdZoneLineRepository;

    public HoldServiceimpl(EventRepository eventRepository,
                           AppUserRepository appUserRepository,
                           HoldRepository holdRepository,
                           EventSeatRepository eventSeatRepository,
                           EventZoneRepository eventZoneRepository,
                           HoldZoneLineRepository holdZoneLineRepository) {
        this.eventRepository = eventRepository;
        this.appUserRepository = appUserRepository;
        this.holdRepository = holdRepository;
        this.eventSeatRepository = eventSeatRepository;
        this.eventZoneRepository = eventZoneRepository;
        this.holdZoneLineRepository = holdZoneLineRepository;
    }

    @Override
    @Transactional
    public HoldResponse createHold(Long eventId, List<Long> seatIds, Map<Long, Integer> zoneQty, Long userId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new EventNotFoundException(eventId));
        Instant now = Instant.now();
        requireOnSale(event, now, eventId);

        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new InvalidHoldTargetException("User not found"));

        List<Long> uniqueSeatIds = seatIds == null ? List.of() : seatIds.stream().distinct().toList();
        Map<Long, Integer> zones = zoneQty == null ? Map.of() : zoneQty;

        if (uniqueSeatIds.isEmpty() && zones.isEmpty()) {
            throw new InvalidHoldTargetException("Cart must contain at least one seat or zone");
        }

        Instant expiresAt = now.plus(HOLD_TTL_MINUTES, ChronoUnit.MINUTES);

        // --- Seats: load + validate ---
        List<EventSeat> selectedSeats = uniqueSeatIds.isEmpty()
                ? List.of()
                : eventSeatRepository.findAllById(uniqueSeatIds);
        if (selectedSeats.size() != uniqueSeatIds.size()) {
            throw new InvalidHoldTargetException("One or more seats do not exist");
        }

        int totalCents = 0;
        try {
            for (EventSeat seat : selectedSeats) {
                if (!seat.getEvent().getId().equals(eventId)) {
                    throw new InvalidHoldTargetException("Seat does not belong to this event");
                }
                if (seat.getStatus() != SeatStatus.AVAILABLE) {
                    throw new SeatUnavailableException("Seat is unavailable");
                }
                totalCents += seat.getSeatClass().getPriceUsdCents();
            }
        } catch (ObjectOptimisticLockingFailureException ex) {
            // Two concurrent requests raced for the same seat — tell the user cleanly
            throw new SeatUnavailableException("One or more seats were just taken. Please try again.");
        }

        // --- Zones: lock + validate + reserve ---
        Map<Long, EventZone> lockedZones = lockZonesOf(zones.keySet());
        List<HoldZoneLine> zoneLines = new ArrayList<>();
        List<HeldZoneItem> heldZoneItems = new ArrayList<>();
        for (Map.Entry<Long, Integer> entry : zones.entrySet()) {
            Long zoneId = entry.getKey();
            int qty = entry.getValue() == null ? 0 : entry.getValue();
            if (qty <= 0) {
                throw new InvalidHoldTargetException("Zone quantity must be greater than zero");
            }

            EventZone zone = lockedZones.get(zoneId);
            if (zone == null) {
                throw new EventZoneNotFoundException(zoneId);
            }
            if (!zone.getEvent().getId().equals(eventId)) {
                throw new InvalidHoldTargetException("Zone does not belong to this event");
            }
            if (!Boolean.TRUE.equals(zone.getActive())) {
                throw new InvalidHoldTargetException("Zone is inactive");
            }

            long remaining = (long) zone.getCapacity() - zone.getHeldQty() - zone.getSoldQty();
            if (remaining < qty) {
                throw new InsufficientZoneCapacityException("Not enough tickets remaining in this zone");
            }

            zone.setHeldQty(zone.getHeldQty() + qty);
            zoneLines.add(HoldZoneLine.builder()
                    .eventZone(zone)
                    .qty(qty)
                    .build());
            heldZoneItems.add(new HeldZoneItem(zoneId, zone.getNameEn(), qty, zone.getPriceUsdCents()));
            totalCents = Math.addExact(totalCents, Math.multiplyExact(zone.getPriceUsdCents(), qty));
        }

        // --- Persist hold + zone lines ---
        Hold hold = Hold.builder()
                .event(event)
                .user(user)
                .status(HoldStatus.ACTIVE)
                .expiresAt(expiresAt)
                .build();
        zoneLines.forEach(line -> line.setHold(hold));
        hold.getZoneLines().addAll(zoneLines);

        Hold savedHold = holdRepository.save(hold);

        // --- Attach seats to the saved hold ---
        List<HeldSeatItem> heldSeatItems = new ArrayList<>();
        for (EventSeat seat : selectedSeats) {
            seat.setStatus(SeatStatus.HELD);
            seat.setHoldId(savedHold.getId());
            seat.setHoldExpiresAt(expiresAt);
            heldSeatItems.add(new HeldSeatItem(
                    seat.getId(),
                    seat.getVenueSeat().getSectionLabel(),
                    seat.getVenueSeat().getRowLabel(),
                    seat.getVenueSeat().getSeatNumber(),
                    seat.getSeatClass().getPriceUsdCents()
            ));
        }
        if (!selectedSeats.isEmpty()) {
            eventSeatRepository.saveAll(selectedSeats);
        }

        return new HoldResponse(
                savedHold.getId(),
                eventId,
                userId,
                savedHold.getStatus(),
                savedHold.getExpiresAt(),
                savedHold.getCreatedAt(),
                savedHold.getExtended(),
                heldSeatItems,
                heldZoneItems,
                totalCents
        );
    }

    @Override
    @Transactional(readOnly = true)
    public HoldResponse getHold(Long holdId, Long userId) {
        Hold hold = holdRepository.findByIdAndUser_Id(holdId, userId)
                .orElseThrow(() -> new HoldNotFoundException(holdId));
        return toResponse(hold);
    }

    @Override
    @Transactional(readOnly = true)
    public List<HoldResponse> getMyActiveHolds(Long userId) {
        return holdRepository.findActiveByUserId(userId, HoldStatus.ACTIVE).stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public void releaseHold(Long holdId, Long userId) {
        Hold hold = holdRepository.findOwnedByIdForUpdate(holdId, userId)
                .orElseThrow(() -> new HoldNotFoundException(holdId));

        Instant now = Instant.now();

        if (hold.getStatus() == HoldStatus.RELEASED) {
            return;
        }

        if (hold.getStatus() == HoldStatus.ACTIVE && !hold.getExpiresAt().isAfter(now)) {
            releaseHoldInventory(hold);
            hold.setStatus(HoldStatus.EXPIRED);
            return;
        }

        if (hold.getStatus() != HoldStatus.ACTIVE) {
            throw new HoldNotActiveException("Only an active hold can be released");
        }

        releaseHoldInventory(hold);
        hold.setStatus(HoldStatus.RELEASED);
    }

    @Override
    @Transactional
    public int expireActiveHolds(Instant currentTime) {
        int expired = 0;
        for (Long holdId : holdRepository.findExpiredActiveHoldIds(currentTime, HoldStatus.ACTIVE)) {
            if (expireHoldIfStillExpired(holdId, currentTime)) {
                expired++;
            }
        }
        return expired;
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private HoldResponse toResponse(Hold hold) {
        List<HeldSeatItem> seats = eventSeatRepository.findByHoldId(hold.getId()).stream()
                .map(seat -> new HeldSeatItem(
                        seat.getId(),
                        seat.getVenueSeat().getSectionLabel(),
                        seat.getVenueSeat().getRowLabel(),
                        seat.getVenueSeat().getSeatNumber(),
                        seat.getSeatClass().getPriceUsdCents()
                ))
                .toList();

        List<HeldZoneItem> zones = holdZoneLineRepository.findByHoldId(hold.getId()).stream()
                .map(line -> new HeldZoneItem(
                        line.getEventZone().getId(),
                        line.getEventZone().getNameEn(),
                        line.getQty(),
                        line.getEventZone().getPriceUsdCents()
                ))
                .toList();

        int totalCents = seats.stream().mapToInt(HeldSeatItem::priceUsdCents).sum()
                + zones.stream().mapToInt(z -> z.unitPriceUsdCents() * z.qty()).sum();

        return new HoldResponse(
                hold.getId(),
                hold.getEvent().getId(),
                hold.getUser().getId(),
                hold.getStatus(),
                hold.getExpiresAt(),
                hold.getCreatedAt(),
                hold.getExtended(),
                seats,
                zones,
                totalCents
        );
    }

    private void requireOnSale(Event event, Instant now, Long eventId) {
        if (event.getStatus() != EventStatus.PUBLISHED
                || now.isBefore(event.getSalesOpenAt())
                || !now.isBefore(event.getSalesCloseAt())) {
            throw new EventNotOnSaleException(eventId);
        }
    }

    private Map<Long, EventZone> lockZonesOf(Collection<Long> zoneIds) {
        if (zoneIds == null || zoneIds.isEmpty()) {
            return Map.of();
        }
        List<Long> sorted = zoneIds.stream().distinct().sorted().toList();
        Map<Long, EventZone> byId = new HashMap<>();
        for (EventZone zone : eventZoneRepository.findAllByIdForUpdate(sorted)) {
            byId.put(zone.getId(), zone);
        }
        return byId;
    }

    private boolean expireHoldIfStillExpired(Long holdId, Instant now) {
        Hold hold = holdRepository.findByIdForUpdate(holdId).orElse(null);
        if (hold == null
                || hold.getStatus() != HoldStatus.ACTIVE
                || hold.getExpiresAt().isAfter(now)) {
            return false;
        }
        releaseHoldInventory(hold);
        hold.setStatus(HoldStatus.EXPIRED);
        return true;
    }

    private void releaseHoldInventory(Hold hold) {
        releaseHeldSeats(hold.getId());
        releaseHeldZoneInventory(hold);
    }

    private void releaseHeldSeats(Long holdId) {
        List<EventSeat> seats = eventSeatRepository.findByHoldIdForUpdate(holdId);
        for (EventSeat seat : seats) {
            if (seat.getStatus() == SeatStatus.HELD) {
                seat.setStatus(SeatStatus.AVAILABLE);
            }
            seat.setHoldId(null);
            seat.setHoldExpiresAt(null);
        }
        if (!seats.isEmpty()) {
            eventSeatRepository.saveAll(seats);
        }
    }

    private void releaseHeldZoneInventory(Hold hold) {
        List<HoldZoneLine> zoneLines = holdZoneLineRepository.findByHoldId(hold.getId());
        if (zoneLines.isEmpty()) {
            return;
        }
        Map<Long, EventZone> lockedZones = lockZonesOf(
                zoneLines.stream().map(line -> line.getEventZone().getId()).toList());

        for (HoldZoneLine line : zoneLines) {
            EventZone zone = lockedZones.get(line.getEventZone().getId());
            int qty = line.getQty();
            if (zone.getHeldQty() < qty) {
                throw new IllegalStateException(
                        "Zone " + zone.getId() + " has fewer held tickets than hold " + hold.getId());
            }
            zone.setHeldQty(zone.getHeldQty() - qty);
        }
    }
}
