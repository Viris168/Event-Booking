package com.eventbooking.controller.Event;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.dto.admin.AdminEventOverviewResponse;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.dto.event.ReviewDecisionRequest;
import com.eventbooking.dto.event.UpdateEventRequest;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.service.event.EventDeletionService;
import com.eventbooking.service.admin.AdminEventOverviewService;
import com.eventbooking.service.event.EventService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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
    private final EventDeletionService deletionService;
    private final AdminResolver adminResolver;

    public AdminEventController(EventService eventService,
                                AdminEventOverviewService overviewService,
                                EventDeletionService deletionService,
                                AdminResolver adminResolver) {
        this.eventService = eventService;
        this.overviewService = overviewService;
        this.deletionService = deletionService;
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

    /**
     * One event in full, in any status - what the moderation table's edit
     * dialog opens with.
     *
     * <p>Not GET /api/v1/events/{id}. That one is the public detail page and
     * 404s anything unpublished, deliberately, so nobody can walk sequential
     * ids to read drafts. An admin is the one caller those states are kept for.
     */
    /**
     * How many events sit in each status - the numbers on the review queue's tabs.
     *
     * <p>Declared BEFORE {@code /{id}} below, and that ordering is load-bearing:
     * "status-counts" is not a Long, so if the templated mapping wins the match
     * the request dies as a 400 MALFORMED_REQUEST before reaching any handler.
     * That is exactly how this endpoint failed once already.
     *
     * <p>Its own endpoint rather than a field on /admin/stats, which is the
     * dashboard's payload: that one runs a dozen counts across users, bookings,
     * payments and tickets, and this is polled every thirty seconds.
     */
    @GetMapping("/status-counts")
    public ResponseEntity<Map<EventStatus, Long>> statusCounts(@CurrentUserId Long actorUserId) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(overviewService.countsByStatus(), HttpStatus.OK);
    }

    @GetMapping("/{id}")
    public ResponseEntity<EventResponse> getForAdmin(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.getEventForAdmin(id), HttpStatus.OK);
    }

    /**
     * Edit somebody else's event. Moderation's repair tool: a misleading title,
     * a wrong category, a date that does not match the poster.
     *
     * <p>Same request body as the organiser's PATCH, and the same validation
     * behind it. What it does not reach is pricing, zones, the seat map or the
     * images - those have their own owner-scoped endpoints and are the
     * organiser's inventory, not a moderator's to rewrite underneath sold
     * tickets.
     */
    @PatchMapping("/{id}")
    public ResponseEntity<EventResponse> update(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody UpdateEventRequest request) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.updateEventAsAdmin(adminUserId, id, request), HttpStatus.OK);
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

    /**
     * Put a taken-down event back on sale.
     *
     * <p>The undo for the method above, and the reason TAKEN_DOWN stopped being
     * a terminal state. Nothing is rebuilt: the event's inventory and bookings
     * were never touched by the take-down, so this is one column going back the
     * other way.
     */
    @PatchMapping("/{id}/restore")
    public ResponseEntity<EventResponse> restore(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        adminResolver.requireAdminUserId(actorUserId);
        return new ResponseEntity<>(eventService.restoreEvent(id), HttpStatus.OK);
    }

    /**
     * Erase the event for good.
     *
     * <p>The one irreversible action on this controller, and deliberately not
     * an alternative to take-down: it is refused outright for any event that
     * has ever been booked, because deleting it would take real tickets with
     * it. What it is for is the listing that should not exist at all - spam, a
     * duplicate, a test event - where TAKEN_DOWN would just be permanent
     * clutter in the moderation table.
     *
     * <p>204, not the deleted row. There is nothing left to return, and a body
     * describing a resource that no longer exists is a client's invitation to
     * keep using it.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        deletionService.delete(adminUserId, id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
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
