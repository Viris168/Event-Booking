package com.eventbooking.controller.Organizer;

import com.eventbooking.Enumeration.EventStatus;
import com.eventbooking.dto.event.EventResponse;
import com.eventbooking.security.OrganizerResolver;
import com.eventbooking.service.event.EventService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@Slf4j
@CrossOrigin
@RequestMapping("/api/v1/organizer")
public class OrganizerController {

    private final EventService eventService;
    private final OrganizerResolver organizerResolver;

    public OrganizerController(EventService eventService, OrganizerResolver organizerResolver) {
        this.eventService = eventService;
        this.organizerResolver = organizerResolver;
    }

    /**
     * The organiser's own events, every status included.
     *
     * <p>Deliberately not the public GET /event: that one is the customer
     * catalogue and must never surface a DRAFT or a REJECTED event. This one is
     * the opposite - the organiser needs to see exactly the events a customer
     * cannot.
     *
     * <p>The header is an {@code app_user.id}; {@code event.organizer_id} is an
     * {@code organizer_profile.id}. Passing the first where the second is meant
     * does not fail - both are Long - it silently answers with a different
     * organiser's events. The resolver is what keeps the two apart, and it
     * doubles as the check that the caller is an organiser at all.
     */
    @GetMapping("/events")
    public ResponseEntity<List<EventResponse>> listForOrganizer(
            @RequestHeader("X-User-Id") Long actorUserId,
            @RequestParam(required = false) EventStatus status) {
        Long organizerId = organizerResolver.requireOrganizerId(actorUserId);
        return ResponseEntity.ok(eventService.listForOrganizer(organizerId, status));
    }
}
