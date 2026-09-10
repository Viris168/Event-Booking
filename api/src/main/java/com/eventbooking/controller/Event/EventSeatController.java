package com.eventbooking.controller.Event;

import com.eventbooking.dto.eventseat.GenerateEventSeatsRequest;
import com.eventbooking.dto.eventseat.SeatMapResponse;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventSeatService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Puts a venue's chairs on sale at one event, in one pricing tier.
 *
 * <p>The POST takes {@code X-User-Id}; the seat map read does not, because it
 * is what a customer picks seats from. Before this, neither did - so anyone
 * could generate inventory on anyone's event.
 *
 * <p><b>Note the URL prefix.</b> The write is {@code /api/v1/events/...}
 * (plural) while the read is {@code /api/v1/event/...} (singular), and the rest
 * of the API is singular. Worth normalising, but not silently: the React client
 * calls both spellings today, so changing them is its own change with its own
 * frontend edit. Anyone writing path-based security rules needs to know both
 * exist.
 */
@RestController
@Slf4j
public class EventSeatController {

    private final EventSeatService eventSeatService;
    private final OrganizerResolver organizerResolver;

    public EventSeatController(EventSeatService eventSeatService, OrganizerResolver organizerResolver) {
        this.eventSeatService = eventSeatService;
        this.organizerResolver = organizerResolver;
    }

    @PostMapping("/api/v1/events/{eventId}/seats")
    public ResponseEntity<SeatMapResponse> generateEventSeats(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long eventId,
            @Valid @RequestBody GenerateEventSeatsRequest request
    ) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(eventSeatService.generateEventSeats(organizerId, eventId, request));
    }


    @GetMapping("/api/v1/events/{eventId}/seat-map")
    public ResponseEntity<SeatMapResponse> getSeatMap(
            @PathVariable Long eventId
    ) {
        return ResponseEntity.ok(eventSeatService.getSeatMap(eventId));
    }


}
