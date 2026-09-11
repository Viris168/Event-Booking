package com.eventbooking.controller.Organizer;

import com.eventbooking.dto.organizer.OrganizerApplicationRequest;
import com.eventbooking.dto.organizer.OrganizerApplicationResponse;
import com.eventbooking.security.CurrentUserId;
import com.eventbooking.service.Organizer.OrganizerService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The applicant's half of the organiser application flow.
 *
 * <p>No resolver. Every other write controller in this package starts by
 * turning the caller into an organiser id or an admin id, and this one
 * deliberately cannot: the entire audience is people who are neither. Being
 * signed in is the whole requirement, and SecurityConfig's
 * {@code anyRequest().authenticated()} already supplies it - these paths are
 * not in PUBLIC_GETS, so they are protected without a new matcher.
 *
 * <p>Split from {@link AdminOrganizerApplicationController} for the reason
 * EventController and AdminEventController are split: a different audience and
 * a different authorizer, which is far easier to express against a whole
 * controller than against individual methods.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/organizer-applications")
public class OrganizerApplicationController {

    private final OrganizerService organizerService;

    public OrganizerApplicationController(OrganizerService organizerService) {
        this.organizerService = organizerService;
    }

    /**
     * Submit an application.
     *
     * <p>The applicant is never in the body - it comes from the authenticated
     * principal, the same rule the catalog write endpoints adopted when they
     * stopped believing a client-supplied owner id.
     *
     * <p>201 rather than 200: this creates a row the caller can go on to read
     * back from {@code GET /me}.
     */
    @PostMapping
    public ResponseEntity<OrganizerApplicationResponse> apply(
            @CurrentUserId Long actorUserId,
            @Valid @RequestBody OrganizerApplicationRequest request) {
        return new ResponseEntity<>(organizerService.apply(actorUserId, request), HttpStatus.CREATED);
    }

    /**
     * The caller's own applications, newest first.
     *
     * <p>A list, not the single latest one. A rejected applicant may apply
     * again, and the screen has to show the rejected attempt beside the new one
     * or the reason they were turned down disappears the moment they resubmit.
     *
     * <p>Takes no path parameter for whose applications to return, which is the
     * point: there is no way to ask this endpoint about anyone else.
     */
    @GetMapping("/me")
    public ResponseEntity<List<OrganizerApplicationResponse>> myApplications(
            @CurrentUserId Long actorUserId) {
        return ResponseEntity.ok(organizerService.myApplications(actorUserId));
    }
}
