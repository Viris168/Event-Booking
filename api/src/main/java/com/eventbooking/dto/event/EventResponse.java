package com.eventbooking.dto.event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.Enumeration.EventTransition;
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
        String coverImageUrl,
        String bannerImageUrl,
        EventStatus status,
        Instant startsAt,
        Instant doorsOpenAt,
        Instant salesOpenAt,
        Instant salesCloseAt,
        Instant createdAt,

        /** When it last entered PENDING_REVIEW. Null if never submitted, or withdrawn. */
        Instant submittedAt,

        /**
         * Every action legal from the current status, from EventStateMachine.
         *
         * <p>The organiser form's footer and the dashboard's row menu both ask
         * "what can I do with this event", and both render straight from this
         * array. Sending it means the rules live in one place instead of being
         * copied into JavaScript and drifting the first time an edge changes.
         */
        List<EventTransition> availableActions,

        /** Whether the organiser may still change the fields. Drives the form lock. */
        boolean editable,

        /**
         * The most recent review entry, inlined so the status banner does not
         * need a second request just to render itself. Null before any
         * transition. Full history is at GET /event/{id}/review.
         */
        EventReviewResponse latestReview,

        List<SeatClassResponse> seatClasses,
        List<EventZoneResponse> zones,

        Integer totalCapacity,
        Integer totalSold,
        Integer totalHeld
) {
}
