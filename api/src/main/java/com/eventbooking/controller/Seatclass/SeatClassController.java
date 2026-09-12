package com.eventbooking.controller.Seatclass;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.dto.seatclass.CreateSeatClassRequest;
import com.eventbooking.dto.seatclass.SeatClassResponse;
import com.eventbooking.dto.seatclass.UpdateSeatClassRequest;
import com.eventbooking.security.EventVisibilityGuard;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.Seatclass.SeatClassService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Seat classes: what a section costs at <em>this</em> event.
 *
 * <p>{@link SeatClassService} has existed since the catalog lane landed and was
 * never exposed, so the organiser's event form had no way to price a seated
 * event against the server and stayed on the prototype store instead - which is
 * why anything saved there vanished on reload.
 *
 * <p>Event-level on purpose. The physical seats belong to the venue and are
 * shared by every show held there; the <em>price</em> of section A is this
 * event's business alone, which is why a class is created under an event id and
 * never under a venue.
 */
@RestController
@RequestMapping("/api/v1/events/{eventId}/seat-class")
@Tag(name = "Seat classes", description = "Per-event pricing tiers for a venue's sections")
public class SeatClassController {

    private final SeatClassService seatClassService;
    private final OrganizerResolver organizerResolver;
    private final EventVisibilityGuard eventVisibilityGuard;

    public SeatClassController(SeatClassService seatClassService,
                               OrganizerResolver organizerResolver,
                               EventVisibilityGuard eventVisibilityGuard) {
        this.seatClassService = seatClassService;
        this.organizerResolver = organizerResolver;
        this.eventVisibilityGuard = eventVisibilityGuard;
    }

    @PostMapping
    @Operation(summary = "Create a pricing tier for this event")
    public ResponseEntity<SeatClassResponse> create(
            @CurrentUserId Long actorUserId,
            @PathVariable Long eventId,
            @Valid @RequestBody CreateSeatClassRequest request) {

        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(seatClassService.createSeatClass(organizerId, eventId, request));
    }

    @GetMapping
    @Operation(summary = "This event's pricing tiers")
    public List<SeatClassResponse> list(
            @CurrentUserId(optional = true) Long actorUserId,
            @PathVariable Long eventId) {
        eventVisibilityGuard.requireReadable(eventId, actorUserId);
        return seatClassService.findByEvent(eventId);
    }

    /**
     * Two checks, not one. The event must be readable by this caller, AND the
     * tier must actually belong to it - the lookup is by seat class id alone, so
     * without the second check /events/1/seat-class/9 happily served event 6's
     * pricing under event 1's name, and /events/99/... served it under an event
     * that does not exist.
     */
    @GetMapping("/{seatClassId}")
    public SeatClassResponse get(
            @CurrentUserId(optional = true) Long actorUserId,
            @PathVariable Long eventId,
            @PathVariable Long seatClassId) {
        eventVisibilityGuard.requireReadable(eventId, actorUserId);
        SeatClassResponse seatClass = seatClassService.getSeatClass(seatClassId);
        eventVisibilityGuard.requireBelongsToEvent(eventId, seatClass.eventId());
        return seatClass;
    }

    @PatchMapping("/{seatClassId}")
    @Operation(
            summary = "Re-price or rename a tier",
            description = """
                    Re-pricing never changes what an existing customer owes: `booking_item`
                    snapshots `unit_price_usd_cents` at checkout, so this only affects seats
                    sold from here on.""")
    public SeatClassResponse update(
            @CurrentUserId Long actorUserId,
            @PathVariable Long eventId,
            @PathVariable Long seatClassId,
            @Valid @RequestBody UpdateSeatClassRequest request) {

        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return seatClassService.updateSeatClass(organizerId, seatClassId, request);
    }
}
