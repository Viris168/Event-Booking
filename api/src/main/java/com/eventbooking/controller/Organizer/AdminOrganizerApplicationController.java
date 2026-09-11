package com.eventbooking.controller.Organizer;

import com.eventbooking.dto.organizer.OrganizerApplicationResponse;
import com.eventbooking.dto.organizer.RejectApplicationRequest;
import com.eventbooking.security.AdminResolver;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.Organizer.OrganizerService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Reviewing organiser applications. The admin half of the flow.
 *
 * <p>Modelled on AdminEventController, down to the resolver call: every method
 * begins by turning the caller into a confirmed admin id, and passes that id
 * down rather than the raw {@code actorUserId}. Both decisions here write a
 * reviewedBy, and fetching the actor separately from the authorization check is
 * how an audit trail ends up naming the wrong person.
 *
 * <p>Under {@code /api/v1/admin/...} for the same reason the event moderation
 * endpoints are: one prefix, one audience, one rule, expressible against the
 * whole controller if a SecurityFilterChain matcher ever needs to.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/admin/organizer-applications")
public class AdminOrganizerApplicationController {

    private final OrganizerService organizerService;
    private final AdminResolver adminResolver;

    public AdminOrganizerApplicationController(OrganizerService organizerService,
                                               AdminResolver adminResolver) {
        this.organizerService = organizerService;
        this.adminResolver = adminResolver;
    }

    /**
     * The review queue: everything still waiting, longest wait first.
     *
     * <p>No status filter parameter. This endpoint exists to be worked down,
     * and an admin who wants to read decided applications wants a different
     * screen with different columns, not the same one with a query string.
     */
    @GetMapping
    public ResponseEntity<List<OrganizerApplicationResponse>> pendingQueue(
            @CurrentUserId Long actorUserId) {
        adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(organizerService.pendingQueue());
    }

    /**
     * Approve: the moment a customer becomes an organiser.
     *
     * <p>No request body - an approval has nothing to explain, the same reason
     * AdminEventController.approve takes none.
     *
     * <p>PATCH rather than POST: this moves an existing row to a new state
     * rather than creating anything the caller can address afterwards.
     */
    @PatchMapping("/{id}/approve")
    public ResponseEntity<OrganizerApplicationResponse> approve(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(organizerService.approve(adminUserId, id));
    }

    /**
     * Reject, with a reason the applicant can act on.
     *
     * <p>The body is mandatory and {@code @Valid} is what enforces it: without
     * the annotation a blank message reaches
     * {@code organizer_application_note_required} and comes back as a raw
     * constraint violation - a 500 where the admin deserved "message is
     * required".
     */
    @PatchMapping("/{id}/reject")
    public ResponseEntity<OrganizerApplicationResponse> reject(
            @CurrentUserId Long actorUserId,
            @PathVariable Long id,
            @Valid @RequestBody RejectApplicationRequest request) {
        Long adminUserId = adminResolver.requireAdminUserId(actorUserId);
        return ResponseEntity.ok(organizerService.reject(adminUserId, id, request.message()));
    }
}
