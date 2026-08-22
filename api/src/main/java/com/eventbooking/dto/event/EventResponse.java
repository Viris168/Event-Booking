package com.eventbooking.dto.event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.InventoryMode;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.dto.venue.VenueResponse;

import java.time.Instant;
import java.util.List;

public record EventResponse(
        Long id,
        Long organizerId,
        VenueResponse venue,
        InventoryMode inventoryMode,
        String slug,
        String titleEn,
        String titleKm,
        String descriptionEn,
        String descriptionKm,
        String category,
        Integer cover,
        EventStatus status,
        Instant startsAt,
        Instant doorsOpenAt,
        Instant salesOpenAt,
        Instant salesCloseAt,
        Instant createdAt,
        List<SeatClassResponse> seatClasses,
        List<EventZoneResponse> zones,

        Integer totalCapacity,
        Integer totalSold,
        Integer totalHeld
) {
}
