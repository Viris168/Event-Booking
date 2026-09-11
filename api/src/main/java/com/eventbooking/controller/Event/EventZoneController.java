package com.eventbooking.controller.Event;


import com.eventbooking.security.CurrentUserId;
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
 * <p>The three writes resolve an organiser from the authenticated caller; the
 * two reads do not, because what is on sale at an event is public. Until this
 * was added the whole controller was unauthenticated, which meant
 * {@code DELETE /zone/{id}} would deactivate any organiser's zone for anyone
 * who could reach the URL.
 *
 * <p>The actor id arrives via {@link CurrentUserId}, out of the verified token.
 * It used to arrive in an {@code X-User-Id} header, which made the ownership
 * check below exactly as trustworthy as the caller chose to be.
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

    @PostMapping("/events/{eventId}/zone")
    public ResponseEntity<EventZoneResponse> createEventZone(
            @CurrentUserId Long actorUserId,
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

    @GetMapping("/events/{eventId}/zone")
    public ResponseEntity<List<EventZoneResponse>> getAllEventZones(@PathVariable Long eventId){
        return new ResponseEntity<>(eventZoneService.findByEvent(eventId), HttpStatus.OK);
    }

    @PatchMapping("/zone/{id}")
    public ResponseEntity<EventZoneResponse> updateEventZone(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody UpdateZoneRequest updateZoneRequest) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventZoneService.updateZone(organizerId, id, updateZoneRequest), HttpStatus.OK);
    }

    @DeleteMapping("/zone/{id}")
    public ResponseEntity<Void> deleteEventZone(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        eventZoneService.deactivateZone(organizerId, id);
        return ResponseEntity.noContent().build();
    }



}
