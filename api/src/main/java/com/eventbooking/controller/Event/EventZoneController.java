package com.eventbooking.controller.Event;


import com.eventbooking.dto.eventzone.CreateEventZoneRequest;
import com.eventbooking.dto.eventzone.EventZoneResponse;
import com.eventbooking.dto.eventzone.UpdateZoneRequest;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventZoneService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Zones - the ZONED tier's inventory.
 *
 * <p>The three writes take {@code X-User-Id} and resolve an organiser; the two
 * reads do not, because what is on sale at an event is public. Until this was
 * added the whole controller was unauthenticated, which meant
 * {@code DELETE /zone/{id}} would deactivate any organiser's zone for anyone
 * who could reach the URL.
 *
 * <p>{@code X-User-Id} is the same stand-in every other controller uses. The
 * JWT filter is in place but still non-rejecting, so the header remains the
 * source of the actor id until the rules in SecurityConfig flip; the swap is a
 * signature change here and nothing below it.
 */
@RestController
@Slf4j
// TODO: restrict allowed origins/methods before production (currently wide open).
@CrossOrigin
@RequestMapping(value = "/api/v1")
public class EventZoneController {

    private final EventZoneService eventZoneService;
    private final OrganizerResolver organizerResolver;

    public EventZoneController(EventZoneService eventZoneService, OrganizerResolver organizerResolver) {
        this.eventZoneService = eventZoneService;
        this.organizerResolver = organizerResolver;
    }

    @PostMapping("/event/{eventId}/zone")
    public ResponseEntity<EventZoneResponse> createEventZone(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long eventId,
            @Valid @RequestBody CreateEventZoneRequest createEventZoneRequest) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(
                eventZoneService.createZone(organizerId, eventId, createEventZoneRequest), HttpStatus.CREATED);

    }

    @GetMapping("/zone/{id}")
    public ResponseEntity<EventZoneResponse> getEventZone(@PathVariable Long id) {
        return new ResponseEntity<>(eventZoneService.getZone(id), HttpStatus.OK);
    }

    @GetMapping("/event/{eventId}/zone")
    public ResponseEntity<List<EventZoneResponse>> getAllEventZones(@PathVariable Long eventId){
        return new ResponseEntity<>(eventZoneService.findByEvent(eventId), HttpStatus.OK);
    }

    @PatchMapping("/zone/{id}")
    public ResponseEntity<EventZoneResponse> updateEventZone(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody UpdateZoneRequest updateZoneRequest) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventZoneService.updateZone(organizerId, id, updateZoneRequest), HttpStatus.OK);
    }

    @DeleteMapping("/zone/{id}")
    public ResponseEntity<Void> deleteEventZone(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        eventZoneService.deactivateZone(organizerId, id);
        return ResponseEntity.noContent().build();
    }



}
