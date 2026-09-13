package com.eventbooking.controller.Event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.dto.admin.AdminEventOverviewResponse;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.ReviewDecisionRequest;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.service.admin.AdminEventOverviewService;
import com.eventbooking.service.event.EventService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
    private final AdminEventOverviewService overviewService;
    private final AdminResolver adminResolver;

    public AdminEventController(EventService eventService,
                                AdminEventOverviewService overviewService,
                                AdminResolver adminResolver) {
        this.eventService = eventService;
        this.overviewService = overviewService;
        this.adminResolver = adminResolver;
    }

    /**
     * The moderation table: every event, any owner, any status.
     *
     * <p>Separate from the queue below rather than a looser version of it. The
     * queue answers "what is waiting for me" and defaults to PENDING_REVIEW;
     * this answers "what is on the platform" and defaults to no status filter
     * at all. Collapsing them would mean one endpoint whose default is either
     * wrong for the queue or wrong for the table.
     */
    @GetMapping("/overview")
    public ResponseEntity<List<AdminEventOverviewResponse>> overview(
            @CurrentUserId Long actorUserId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) EventStatus status,
            @RequestParam(required = false) String province) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(overviewService.list(q, status, province), HttpStatus.OK);
    }

    /**
     * The moderation queue. Defaults to PENDING_REVIEW because that is the
     * screen's whole purpose; the parameter exists so the same endpoint can
     * back a "recently rejected" or "approved, not yet published" view without
     * a second method.
     *
     * <p>This is not GET /api/v1/events with a filter. That endpoint is the
     * public catalogue and returns only PUBLISHED and TAKEN_DOWN by design -
     * accepting an arbitrary status there would hand every organiser's DRAFT,
     * with title, venue and prices, to any anonymous caller. Listing
     * unpublished work is an admin capability, so it lives on the admin
     * controller behind AdminResolver.
     */
    @GetMapping
    public ResponseEntity<Page<EventResponse>> listForReview(
            @CurrentUserId Long actorUserId,
            @RequestParam(defaultValue = "PENDING_REVIEW") EventStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.listForReview(status, page, size), HttpStatus.OK);
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
