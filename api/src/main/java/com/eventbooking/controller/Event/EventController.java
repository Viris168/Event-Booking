package com.eventbooking.controller.Event;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.Enumeration.ImageRole;
import com.eventbooking.dto.event.CreateEventRequest;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.EventReviewResponse;
import com.eventbooking.dto.event.EventSearchCriteria;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.security.EventVisibilityGuard;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventService;
import org.springframework.data.domain.Page;

import java.util.List;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Slf4j
@CrossOrigin
@RequestMapping(value = "/api/v1/events")
public class EventController {

    private final EventService eventService;

    private final OrganizerResolver organizerResolver;

    private final EventVisibilityGuard eventVisibilityGuard;

    /**
     * The actor id is an app_user id taken from the verified token, never the
     * OWNER id: the resolver turns it into an organizer_profile id and rejects
     * callers who have no profile. Two id spaces that look identical on the
     * wire, which is why the translation lives in one place.
     */
    public EventController(EventService eventService, OrganizerResolver organizerResolver,
                           EventVisibilityGuard eventVisibilityGuard) {
        this.eventService = eventService;
        this.organizerResolver = organizerResolver;
        this.eventVisibilityGuard = eventVisibilityGuard;
    }

    @PostMapping
    public ResponseEntity<EventResponse> createEvent(
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody CreateEventRequest eventRequest) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        EventResponse eventResponse = eventService.createEvent(organizerId, eventRequest);
        return new ResponseEntity<>(eventResponse,HttpStatus.CREATED);
    }

    /**
     * The public catalogue, with the filter bar's six controls applied.
     *
     * <p>All of them are optional and all of them arrive as raw strings: the
     * events page keeps its whole filter state in the URL and sends the
     * untouched ones as empty values, so binding {@code from} as a LocalDate or
     * {@code minUsd} as a BigDecimal would answer 400 to a visitor who has
     * simply not typed anything. EventSearchCriteria parses them leniently
     * instead - a value it cannot read means "no filter", never an error.
     */
    @GetMapping
    public ResponseEntity<Page<EventResponse>> listEvents(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String province,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String minUsd,
            @RequestParam(required = false) String maxUsd,
            @RequestParam(required = false) String sort) {
        EventSearchCriteria criteria =
                EventSearchCriteria.of(q, province, from, to, minUsd, maxUsd, sort);
        Page<EventResponse> events = eventService.listEvents(criteria, page, size);
        return new ResponseEntity<>(events, HttpStatus.OK);
    }

    @GetMapping("/{id}")
    public ResponseEntity<EventResponse> getEvent(@PathVariable Long id) {
        EventResponse eventResponse = eventService.getEvent(id);
        return new ResponseEntity<>(eventResponse,HttpStatus.OK);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<EventResponse> updateEvent(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody UpdateEventRequest request) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        EventResponse eventResponse = eventService.updateEvent(organizerId, id, request);
        return new ResponseEntity<>(eventResponse,HttpStatus.OK);
    }

    /**
     * Put the event in front of a platform admin. Organiser action: the resolver
     * turns the caller into an organizer_profile id for the ownership check,
     * while the raw app_user id is what signs the review log - two id spaces,
     * both needed, which is why both are passed down.
     */
    @PatchMapping("/{id}/submit")
    public ResponseEntity<EventResponse> submitForReview(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventService.submitForReview(organizerId, id, actorUserId), HttpStatus.OK);
    }

    /** Take it back out of the queue - or out of APPROVED, to fix something. */
    @PatchMapping("/{id}/withdraw")
    public ResponseEntity<EventResponse> withdrawFromReview(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventService.withdrawFromReview(organizerId, id, actorUserId), HttpStatus.OK);
    }

    @PatchMapping("/{id}/publish")
    public ResponseEntity<EventResponse> publishEvent(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        EventResponse updatedEvent = eventService.publishEvent(organizerId, id);
        return new ResponseEntity<>(updatedEvent, HttpStatus.OK);
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
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @RequestParam(defaultValue = "COVER") ImageRole role,
            @RequestParam("file") MultipartFile file) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventService.uploadImage(organizerId, id, role, file), HttpStatus.OK);
    }

    @DeleteMapping("/{id}/image")
    public ResponseEntity<EventResponse> deleteEventImage(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @RequestParam(defaultValue = "COVER") ImageRole role) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return new ResponseEntity<>(eventService.deleteImage(organizerId, id, role), HttpStatus.OK);
    }

    /**
     * The decision trail. Public to any caller who can see the event: the
     * organiser needs it for their own history, and an admin reviewing a
     * resubmission needs to know what was asked for last time.
     */
    @GetMapping("/{id}/review")
    public ResponseEntity<List<EventReviewResponse>> getReviewHistory(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        // The moderation trail is not catalogue data. It names the admin who
        // decided and the organiser who submitted, carries the message sent back
        // on a rejection, and lists the field-level before/after of every edit -
        // for a draft nobody outside the organisation is supposed to know exists.
        // It used to take nothing but the path variable, so any signed-in
        // customer could read all of that for any event.
        eventVisibilityGuard.requireReviewReadable(id, actorUserId);
        return new ResponseEntity<>(eventService.getReviewHistory(id), HttpStatus.OK);
    }

    @GetMapping("/{id}/verify")
    public ResponseEntity<Void> verifyEvent(@PathVariable Long id) {
        eventService.verifyEventIsOnSale(id);
        return ResponseEntity.ok().build();
    }


}
