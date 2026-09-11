package com.eventbooking.controller.Event;

import com.eventbooking.security.CurrentUserId;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.ReviewDecisionRequest;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.service.event.EventService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Moderation. Separate from EventController on purpose: a different authorizer,
 * a different audience, and - once the JWT filter lands - a different
 * SecurityFilterChain rule, which is far easier to express against a whole
 * controller than against four methods scattered among the organiser's.
 *
 * <p>AdminResolver returns the caller's app_user id rather than a bare boolean,
 * because every decision here writes an event_review row naming who made it.
 * Fetching that separately is how an audit log ends up with the wrong actor.
 */
@RestController
@Slf4j
@CrossOrigin
@RequestMapping("/api/v1/admin/events")
public class AdminEventController {

    private final EventService eventService;
    private final AdminResolver adminResolver;

    public AdminEventController(EventService eventService, AdminResolver adminResolver) {
        this.eventService = eventService;
        this.adminResolver = adminResolver;
    }

    @PatchMapping("/{id}/approve")
    public ResponseEntity<EventResponse> approve(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.approve(adminUserId, id), HttpStatus.OK);
    }

    /**
     * Take a published event off sale. Moderation, not the organiser's own
     * release control - which is why it lives here and why it is the one
     * lifecycle action they cannot perform on their own event.
     *
     * <p>It previously sat on EventController with no authorization at all:
     * no resolver, no header, nothing. Any caller who could reach the URL could
     * pull any organiser's live event off sale.
     */
    @PatchMapping("/{id}/takedown")
    public ResponseEntity<EventResponse> takeDown(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.takeDownEvent(id), HttpStatus.OK);
    }

    @PatchMapping("/{id}/reject")
    public ResponseEntity<EventResponse> reject(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody ReviewDecisionRequest request) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.reject(adminUserId, id, request.message()), HttpStatus.OK);
    }

    @PatchMapping("/{id}/request-changes")
    public ResponseEntity<EventResponse> requestChanges(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody ReviewDecisionRequest request) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.requestChanges(adminUserId, id, request.message()), HttpStatus.OK);
    }
}
