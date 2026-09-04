package com.eventbooking.controller.Event;

import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventService;
import org.springframework.data.domain.Page;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Slf4j
@CrossOrigin
@RequestMapping(value = "/api/v1/event")
public class EventController {

    private final EventService eventService;
    private final OrganizerResolver organizerResolver;

    /**
     * X-User-Id is an app_user id and is still unauthenticated - anyone can
     * send any value. What changed is that it is no longer the OWNER id: the
     * resolver turns it into an organizer_profile id and rejects callers who
     * have no profile. When the JWT filter lands, the header is replaced by
     * the principal here and nothing below this class moves.
     */
    public EventController(EventService eventService, OrganizerResolver organizerResolver) {
        this.eventService = eventService;
        this.organizerResolver = organizerResolver;
    }

    @PostMapping
    public ResponseEntity<EventResponse> createEvent(
            @RequestHeader("X-User-Id") Long actorUserId,
            @Valid @RequestBody CreateEventRequest eventRequest) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        EventResponse eventResponse = eventService.createEvent(organizerId, eventRequest);
        return new ResponseEntity<>(eventResponse,HttpStatus.CREATED);
    }

    @GetMapping
    public ResponseEntity<Page<EventResponse>> listEvents(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<EventResponse> events = eventService.listEvents(page, size);
        return new ResponseEntity<>(events, HttpStatus.OK);
    }

    @GetMapping("/{id}")
    public ResponseEntity<EventResponse> getEvent(@PathVariable Long id) {
        EventResponse eventResponse = eventService.getEvent(id);
        return new ResponseEntity<>(eventResponse,HttpStatus.OK);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<EventResponse> updateEvent(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody UpdateEventRequest request) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        EventResponse eventResponse = eventService.updateEvent(organizerId, id, request);
        return new ResponseEntity<>(eventResponse,HttpStatus.OK);
    }

    @PatchMapping("/{id}/publish")
    public ResponseEntity<EventResponse> publishEvent(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        EventResponse updatedEvent = eventService.publishEvent(organizerId, id);
        return new ResponseEntity<>(updatedEvent, HttpStatus.OK);
    }

    /**
     * Take an event off sale permanently. Separate from the publish endpoint
     * rather than a status field on PATCH /{id}: this is a moderation action
     * with a different audience and a different future authorization rule, and
     * a one-way transition should not be reachable by a client that meant to
     * rename the event.
     */
    @PatchMapping("/{id}/takedown")
    public ResponseEntity<EventResponse> takeDownEvent(@PathVariable Long id) {
        return new ResponseEntity<>(eventService.takeDownEvent(id), HttpStatus.OK);
    }

    /**
     * Put an image in one of the event's two slots. multipart/form-data, part
     * named "file"; role selects the slot and defaults to the cover, so the
     * common case needs no query string.
     *
     * Returns the whole event rather than just the URL - the client that just
     * uploaded is the one rendering the page, and this saves it a second GET.
     */
    @PostMapping(value = "/{id}/image", consumes = "multipart/form-data")
    public ResponseEntity<EventResponse> uploadEventImage(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long id,
            @RequestParam(defaultValue = "COVER") ImageRole role,
            @RequestParam("file") MultipartFile file) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventService.uploadImage(organizerId, id, role, file), HttpStatus.OK);
    }

    @DeleteMapping("/{id}/image")
    public ResponseEntity<EventResponse> deleteEventImage(
            @RequestHeader("X-User-Id") Long actorUserId,
            @PathVariable Long id,
            @RequestParam(defaultValue = "COVER") ImageRole role) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventService.deleteImage(organizerId, id, role), HttpStatus.OK);
    }

    @GetMapping("/{id}/verify")
    public ResponseEntity<Void> verifyEvent(@PathVariable Long id) {
        eventService.verifyEventIsOnSale(id);
        return ResponseEntity.ok().build();
    }


}
